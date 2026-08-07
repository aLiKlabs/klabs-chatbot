import { NextResponse } from "next/server";
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
import { consumeWidgetRateLimit, requestAddress } from "@/lib/rate-limit/widget";
import { retrieveProjectKnowledge, type RetrievedChunk } from "@/lib/retrieval";
import { createServiceClient } from "@/lib/laravel/service";
import { publicChatSchema } from "@/lib/validation/widget";
import { getPublicWidgetProject, isApprovedWidgetPage, localized } from "@/lib/widget/project";

export const runtime = "nodejs";

function sourceMetadata(chunk: RetrievedChunk) {
  const title = [chunk.metadata.page_title, chunk.metadata.source_name].find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const rawUrl = chunk.metadata.original_url;
  return { title: title || "Knowledge source", url: typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl) ? rawUrl : null };
}

function streamEvent(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: Request) {
  const parsed = publicChatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request." }, { status: 400 });
  const rate = consumeWidgetRateLimit(`${requestAddress(request)}:${parsed.data.publicKey}`, 30);
  if (!rate.allowed) return NextResponse.json({ error: "Too many messages. Please wait a moment." }, { status: 429, headers: { "retry-after": String(rate.retryAfter) } });

  const startedAt = Date.now();
  const supabase = createServiceClient();
  const widget = await getPublicWidgetProject(supabase, parsed.data.publicKey);
  if (!widget || !isApprovedWidgetPage(parsed.data.pageUrl, widget.project.website_url, widget.domains)) {
    return NextResponse.json({ error: "Chatbot unavailable." }, { status: 404 });
  }

  try {
    const language = parsed.data.language || (isArabic(parsed.data.message) ? "ar" : "en");
    const { data: existing } = await supabase.from("conversations").select("id").eq("project_id", widget.project.id).eq("session_id", parsed.data.sessionId).maybeSingle();
    let conversationId = existing?.id as string | undefined;
    const smallTalkAnswer = createSmallTalkAnswer(parsed.data.message, language, widget.settings.bot_name);
    const understanding = understandQuestion(parsed.data.message, parsed.data.history);
    const restrictedLocation = hasCompanyLocationRestriction(widget.instructions.restricted_topics)
      && isRestrictedCompanyLocationQuestion(parsed.data.message);
    const businessQuestion = isLikelyBusinessQuestion(parsed.data.message);
    const clearlyOffTopic = !businessQuestion && isClearlyOffTopicKnowledgeRequest(parsed.data.message);
    const knowledgeRequired = businessQuestion || understanding.requiresKnowledge;
    const retrieval = smallTalkAnswer || clearlyOffTopic || restrictedLocation || understanding.needsClarification || understanding.requiresTool
      ? { chunks: [], embeddingTokens: 0, model: "local-small-talk", mode: "local-lexical" as const }
      : await retrieveProjectKnowledge(supabase, widget.project.id, understanding.searchQueries, { language });
    const grounding = assessKnowledge(retrieval.chunks);
    const knowledgeChunks = grounding.chunks;
    const evidence = evaluateEvidence(understanding, knowledgeChunks, grounding.hasConflictingSources);
    const answerPlan = createAnswerPlan(understanding, knowledgeChunks, evidence);
    const uniqueSources = knowledgeChunks.map(sourceMetadata).filter((source, index, all) => all.findIndex((candidate) => candidate.title === source.title && candidate.url === source.url) === index);
    const fallback = localized(widget.instructions.fallback_message, language, language === "ar" ? "عذراً، لا تتوفر لدي معلومات حول ذلك. يمكنك التواصل مع الفريق للمساعدة." : "I’m sorry, I don’t have information about that. You can contact the team for help.");
    let answer = smallTalkAnswer || fallback;
    let model = smallTalkAnswer ? "local-small-talk" : "safe-fallback";
    let usageModel = model;
    let inputTokens = estimateTokens(parsed.data.message);
    let outputTokens = estimateTokens(answer);
    let cachedInputTokens = 0;
    let cacheWriteTokens = 0;
    let unanswered = !smallTalkAnswer && knowledgeChunks.length === 0;
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
      const prompt = buildGroundedPrompt({ question: understanding.resolvedQuestion, chunks: knowledgeChunks, history: parsed.data.history, projectInstruction: widget.instructions.system_instruction, language, answerPlan });
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
      const { data: created, error } = await supabase.from("conversations").insert({
        project_id: widget.project.id, session_id: parsed.data.sessionId, language, page_url: parsed.data.pageUrl,
        referrer: request.headers.get("referer"), user_agent: request.headers.get("user-agent"), status: unanswered ? "unanswered" : "active",
      }).select("id").single();
      if (error || !created) throw error || new Error("Conversation could not be saved.");
      conversationId = created.id;
    }
    const userMessageId = crypto.randomUUID();
    const assistantMessageId = crypto.randomUUID();
    const latencyMs = Date.now() - startedAt;
    const estimatedCost = usageModel === LUNA_PRICING.model
      ? calculateLunaCost({ inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens, embeddingTokens: retrieval.embeddingTokens }).totalCost
      : null;
    const { error: messageError } = await supabase.from("messages").insert([
      { id: userMessageId, project_id: widget.project.id, conversation_id: conversationId, role: "user", content: parsed.data.message, sources: [], retrieval_score: null, model: null, input_tokens: null, output_tokens: null, latency_ms: null, is_unanswered: false },
      { id: assistantMessageId, project_id: widget.project.id, conversation_id: conversationId, role: "assistant", content: answer, sources: uniqueSources, retrieval_score: knowledgeChunks[0]?.similarity ?? null, model, input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs, is_unanswered: unanswered },
    ]);
    if (messageError) throw messageError;
    await Promise.all([
      supabase.from("conversations").update({ status: unanswered ? "unanswered" : "active", language, last_message_at: now }).eq("id", conversationId),
      supabase.from("usage_events").insert({ project_id: widget.project.id, conversation_id: conversationId, event_type: unanswered ? "chat_unanswered" : "chat_answered", model: usageModel, input_tokens: inputTokens, output_tokens: outputTokens, embedding_tokens: retrieval.embeddingTokens, estimated_cost: estimatedCost }),
    ]);

    const encoder = new TextEncoder();
    const visibleSources = widget.instructions.citation_mode ? uniqueSources.filter(({ url }) => url) : [];
    const stream = new ReadableStream({
      async start(controller) {
        streamEvent(controller, encoder, "meta", {
          messageId: assistantMessageId,
          conversationId,
          unanswered,
          answerable: smallTalkAnswer ? true : evidence.answerable,
          grounded: smallTalkAnswer ? true : !unanswered && evidence.answerable && !grounding.hasConflictingSources,
          conflict: grounding.hasConflictingSources,
          escalated: evidence.needsHuman || understanding.intent === "human-support",
          sources: visibleSources,
        });
        const pieces = answer.match(/\S+\s*/g) || [answer];
        for (const piece of pieces) {
          streamEvent(controller, encoder, "delta", { text: piece });
          await new Promise((resolve) => setTimeout(resolve, 12));
        }
        streamEvent(controller, encoder, "done", {});
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) {
    console.error("Public chatbot request failed", { category: "public-chat", error });
    return NextResponse.json({ error: "The chatbot could not answer right now. Please try again." }, { status: 500 });
  }
}
