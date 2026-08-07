import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { buildGroundedPrompt } from "@/lib/chat/prompt";
import { createLocalGroundedAnswer, isArabic } from "@/lib/chat/local-answer";
import { estimateTokens } from "@/lib/chat/token-estimate";
import { createSmallTalkAnswer } from "@/lib/chat/small-talk";
import { assessKnowledge, validateGroundedAnswer } from "@/lib/chat/grounding";
import { localizedConflictResponse } from "@/lib/chat/agent-policy";
import { createAnswerPlan, evaluateEvidence } from "@/lib/chat/answer-plan";
import { understandQuestion } from "@/lib/chat/question";
import {
  countConsecutiveGeneralTurns,
  GENERAL_CONVERSATION_MODEL,
  GENERAL_LIMIT_FALLBACK_MODEL,
  hasCompanyLocationRestriction,
  isClearlyOffTopicKnowledgeRequest,
  isLikelyBusinessQuestion,
  isRestrictedCompanyLocationQuestion,
  MAX_CONSECUTIVE_GENERAL_TURNS,
} from "@/lib/chat/general-conversation";
import { getOpenAIEnvironment } from "@/lib/env";
import { calculateLunaCost, LUNA_PRICING } from "@/lib/openai/pricing";
import { retrieveProjectKnowledge, type RetrievedChunk } from "@/lib/retrieval";
import { createClient } from "@/lib/laravel/server";
import { adminChatRequestSchema } from "@/lib/validation/chat";

type LocalizedText = Record<string, string>;

function localized(value: unknown, language: string, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const entries = value as LocalizedText;
  if (entries[language]) return entries[language];
  if (language === "ar") return fallback;
  return entries.en || Object.values(entries).find(Boolean) || fallback;
}

function sourceMetadata(chunk: RetrievedChunk) {
  const title = [chunk.metadata.page_title, chunk.metadata.source_name]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const rawUrl = chunk.metadata.original_url;
  const url = typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  const pageNumber = typeof chunk.metadata.page_number === "number" ? chunk.metadata.page_number : null;
  return { title: title || "Knowledge source", url, pageNumber };
}

function uniqueSources(chunks: RetrievedChunk[]) {
  const sources = chunks.map(sourceMetadata);
  return sources.filter(
    (source, index) =>
      sources.findIndex(
        (candidate) =>
          candidate.title === source.title &&
          candidate.url === source.url &&
          candidate.pageNumber === source.pageNumber,
      ) === index,
  );
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "The chatbot could not answer.";
  if (/429|quota|billing|insufficient_quota/i.test(message)) {
    return "OpenAI API credits are unavailable. Keep free local test mode enabled or add API credits.";
  }
  if (/401|api key/i.test(message)) return "The OpenAI API key was rejected.";
  return "The chatbot could not answer right now. Please try again.";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  await requireAdministrator();
  const { projectId } = await context.params;
  const parsed = adminChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message || "Invalid request." } },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const supabase = await createClient();
  const [{ data: project }, { data: instructions }, { data: settings }] = await Promise.all([
    supabase.from("projects").select("id,name,status").eq("id", projectId).single(),
    supabase.from("chatbot_instructions").select("*").eq("project_id", projectId).single(),
    supabase.from("chatbot_settings").select("bot_name").eq("project_id", projectId).single(),
  ]);
  if (!project || project.status === "archived") {
    return NextResponse.json(
      { error: { code: "PROJECT_UNAVAILABLE", message: "This project is unavailable for testing." } },
      { status: 404 },
    );
  }

  try {
    const language = parsed.data.language || (isArabic(parsed.data.message) ? "ar" : "en");
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .eq("session_id", parsed.data.sessionId)
      .maybeSingle();
    let conversationId = existingConversation?.id as string | undefined;
    const smallTalkAnswer = createSmallTalkAnswer(parsed.data.message, language, settings?.bot_name);
    const understanding = understandQuestion(parsed.data.message, parsed.data.history);
    const restrictedLocation = hasCompanyLocationRestriction(instructions?.restricted_topics)
      && isRestrictedCompanyLocationQuestion(parsed.data.message);
    const businessQuestion = isLikelyBusinessQuestion(parsed.data.message);
    const clearlyOffTopic = !businessQuestion && isClearlyOffTopicKnowledgeRequest(parsed.data.message);
    const knowledgeRequired = businessQuestion || understanding.requiresKnowledge;
    const retrieval = smallTalkAnswer || clearlyOffTopic || restrictedLocation || understanding.needsClarification || understanding.requiresTool
      ? { chunks: [], embeddingTokens: 0, model: "local-small-talk", mode: "local-lexical" as const }
      : await retrieveProjectKnowledge(supabase, projectId, understanding.searchQueries, { language });
    const grounding = assessKnowledge(retrieval.chunks);
    const knowledgeChunks = grounding.chunks;
    const evidence = evaluateEvidence(understanding, knowledgeChunks, grounding.hasConflictingSources);
    const answerPlan = createAnswerPlan(understanding, knowledgeChunks, evidence);
    const sources = uniqueSources(knowledgeChunks);
    const fallback = localized(
      instructions?.fallback_message,
      language,
      language === "ar"
        ? "عذراً، لا تتوفر لدي معلومات موثقة حول ذلك في قاعدة المعرفة."
        : "I’m sorry, but I don’t have verified information about that in the knowledge base.",
    );
    let answer = smallTalkAnswer || fallback;
    let model = smallTalkAnswer ? "local-small-talk" : "safe-fallback";
    let usageModel = model;
    let inputTokens = estimateTokens(parsed.data.message);
    let outputTokens = estimateTokens(answer);
    let cachedInputTokens = 0;
    let cacheWriteTokens = 0;
    let unanswered = !smallTalkAnswer && knowledgeChunks.length === 0;
    let promptTokens = 0;

    if (understanding.needsClarification && !smallTalkAnswer) {
      answer = understanding.clarificationQuestion || fallback;
      model = "clarification-fallback";
      usageModel = model;
      unanswered = true;
    } else if (understanding.intent === "human-support" && !smallTalkAnswer) {
      answer = language === "ar"
        ? "يحتاج هذا الأمر إلى مراجعة ممثل بشري. ستتضمن الإحالة التفاصيل التي قدمتها بالفعل."
        : "This needs to be reviewed by a human representative. The escalation can include the details you already provided.";
      model = "human-escalation";
      usageModel = model;
      unanswered = true;
    } else if (understanding.requiresTool && !smallTalkAnswer) {
      answer = language === "ar"
        ? "أستطيع شرح الإجراء، لكن لا أستطيع تنفيذ هذا الإجراء مباشرة من خلال هذه المحادثة."
        : "I can explain the process, but I can’t complete that action directly from this chat.";
      model = "unsupported-action-fallback";
      usageModel = model;
      unanswered = true;
    } else if (grounding.hasConflictingSources) {
      answer = localizedConflictResponse(language);
      model = "grounding-conflict-fallback";
      usageModel = model;
      unanswered = true;
    } else if (knowledgeChunks.length && evidence.answerable) {
      const prompt = buildGroundedPrompt({
        question: understanding.resolvedQuestion,
        chunks: knowledgeChunks,
        history: parsed.data.history,
        projectInstruction: instructions?.system_instruction,
        language,
        answerPlan,
      });
      promptTokens = prompt.tokenCount;
      if (getOpenAIEnvironment().MOCK_EMBEDDINGS) {
        answer = createLocalGroundedAnswer(parsed.data.message, knowledgeChunks) || fallback;
        model = "local-grounded-extractive";
        inputTokens = prompt.tokenCount;
        outputTokens = estimateTokens(answer);
        unanswered = answer === fallback;
      } else {
        const { createGroundedResponse } = await import("@/lib/openai/responses");
        const generated = await createGroundedResponse(prompt.input);
        answer = generated.text || fallback;
        model = generated.model;
        usageModel = generated.model;
        inputTokens = generated.inputTokens;
        outputTokens = generated.outputTokens;
        cachedInputTokens = generated.cachedInputTokens;
        cacheWriteTokens = generated.cacheWriteTokens;
        unanswered = !generated.text;
      }
      const validated = validateGroundedAnswer(answer, knowledgeChunks, fallback);
      if (!validated.grounded) {
        answer = validated.answer;
        model = "grounding-validation-fallback";
        usageModel = model;
        unanswered = true;
      }
    } else if (knowledgeRequired && !smallTalkAnswer) {
      unanswered = true;
    }

    if (!smallTalkAnswer && !clearlyOffTopic && !restrictedLocation && !knowledgeChunks.length && !knowledgeRequired && !understanding.needsClarification && !understanding.requiresTool) {
      const generalTurns = await countConsecutiveGeneralTurns(supabase, conversationId);
      if (generalTurns < MAX_CONSECUTIVE_GENERAL_TURNS) {
        const { createGeneralConversationResponse } = await import("@/lib/openai/responses");
        const generated = await createGeneralConversationResponse(parsed.data.message, parsed.data.history, language);
        if (generated.text) {
          answer = generated.text;
          model = GENERAL_CONVERSATION_MODEL;
          usageModel = generated.model;
          inputTokens = generated.inputTokens;
          outputTokens = generated.outputTokens;
          cachedInputTokens = generated.cachedInputTokens;
          cacheWriteTokens = generated.cacheWriteTokens;
          unanswered = false;
        }
      } else {
        model = GENERAL_LIMIT_FALLBACK_MODEL;
        usageModel = GENERAL_LIMIT_FALLBACK_MODEL;
      }
    }

    const now = new Date().toISOString();
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          project_id: projectId,
          session_id: parsed.data.sessionId,
          language,
          status: unanswered ? "unanswered" : "active",
          page_url: `/projects/${projectId}/testing`,
        })
        .select("id")
        .single();
      if (error || !created) throw error || new Error("Conversation could not be saved.");
      conversationId = created.id;
    }

    const latencyMs = Date.now() - startedAt;
    const estimatedCost = usageModel === LUNA_PRICING.model
      ? calculateLunaCost({ inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, embeddingTokens: retrieval.embeddingTokens }).totalCost
      : null;
    const bestScore = knowledgeChunks[0]?.similarity ?? null;
    const { error: messagesError } = await supabase.from("messages").insert([
      {
        project_id: projectId,
        conversation_id: conversationId,
        role: "user",
        content: parsed.data.message,
        sources: [],
        is_unanswered: false,
      },
      {
        project_id: projectId,
        conversation_id: conversationId,
        role: "assistant",
        content: answer,
        sources,
        retrieval_score: bestScore,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        is_unanswered: unanswered,
      },
    ]);
    if (messagesError) throw messagesError;
    await Promise.all([
      supabase
        .from("conversations")
        .update({ status: unanswered ? "unanswered" : "active", last_message_at: now, language })
        .eq("id", conversationId),
      supabase.from("usage_events").insert({
        project_id: projectId,
        conversation_id: conversationId,
        event_type: unanswered ? "chat_unanswered" : "chat_answered",
        model: usageModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        embedding_tokens: retrieval.embeddingTokens,
        estimated_cost: estimatedCost,
      }),
    ]);

    return NextResponse.json({
      answer,
      sources: instructions?.citation_mode === false ? [] : sources,
      unanswered,
      answerable: smallTalkAnswer ? true : evidence.answerable,
      grounded: smallTalkAnswer ? true : !unanswered && evidence.answerable && !grounding.hasConflictingSources,
      conflict: grounding.hasConflictingSources,
      escalated: evidence.needsHuman || understanding.intent === "human-support",
      debug: {
        retrievalMode: retrieval.mode,
        chunks: knowledgeChunks.map((chunk) => ({
          content: chunk.content.slice(0, 1_000),
          similarity: chunk.similarity,
          ...sourceMetadata(chunk),
        })),
        promptTokens,
        model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        embeddingTokens: retrieval.embeddingTokens,
        latencyMs,
        evidenceStrength: evidence.evidenceStrength,
        missingInformation: evidence.missingInformation,
        answerPlan,
      },
    });
  } catch (error) {
    console.error("Admin chatbot request failed", { projectId, category: "chat", error });
    return NextResponse.json(
      { error: { code: "CHAT_FAILED", message: safeError(error) } },
      { status: 500 },
    );
  }
}
