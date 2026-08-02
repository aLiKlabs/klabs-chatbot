import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { buildGroundedPrompt } from "@/lib/chat/prompt";
import { createLocalGroundedAnswer, isArabic } from "@/lib/chat/local-answer";
import { estimateTokens } from "@/lib/chat/token-estimate";
import { getOpenAIEnvironment } from "@/lib/env";
import { retrieveProjectKnowledge, type RetrievedChunk } from "@/lib/retrieval";
import { createClient } from "@/lib/supabase/server";
import { adminChatRequestSchema } from "@/lib/validation/chat";

type LocalizedText = Record<string, string>;

function localized(value: unknown, language: string, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const entries = value as LocalizedText;
  return entries[language] || entries.en || Object.values(entries).find(Boolean) || fallback;
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
  const [{ data: project }, { data: instructions }] = await Promise.all([
    supabase.from("projects").select("id,name,status").eq("id", projectId).single(),
    supabase.from("chatbot_instructions").select("*").eq("project_id", projectId).single(),
  ]);
  if (!project || project.status === "archived") {
    return NextResponse.json(
      { error: { code: "PROJECT_UNAVAILABLE", message: "This project is unavailable for testing." } },
      { status: 404 },
    );
  }

  try {
    const language = isArabic(parsed.data.message) ? "ar" : "en";
    const retrieval = await retrieveProjectKnowledge(supabase, projectId, parsed.data.message);
    const sources = uniqueSources(retrieval.chunks);
    const fallback = localized(
      instructions?.fallback_message,
      language,
      language === "ar"
        ? "عذراً، لا تتوفر لدي معلومات موثقة حول ذلك في قاعدة المعرفة."
        : "I’m sorry, but I don’t have verified information about that in the knowledge base.",
    );
    let answer = fallback;
    let model = "safe-fallback";
    let inputTokens = estimateTokens(parsed.data.message);
    let outputTokens = estimateTokens(answer);
    let unanswered = retrieval.chunks.length === 0;
    let promptTokens = 0;

    if (retrieval.chunks.length) {
      const prompt = buildGroundedPrompt({
        question: parsed.data.message,
        chunks: retrieval.chunks,
        history: parsed.data.history,
        projectInstruction: instructions?.system_instruction,
      });
      promptTokens = prompt.tokenCount;
      if (getOpenAIEnvironment().MOCK_EMBEDDINGS) {
        answer = createLocalGroundedAnswer(parsed.data.message, retrieval.chunks) || fallback;
        model = "local-grounded-extractive";
        inputTokens = prompt.tokenCount;
        outputTokens = estimateTokens(answer);
        unanswered = answer === fallback;
      } else {
        const { createGroundedResponse } = await import("@/lib/openai/responses");
        const generated = await createGroundedResponse(prompt.input);
        answer = generated.text || fallback;
        model = generated.model;
        inputTokens = generated.inputTokens;
        outputTokens = generated.outputTokens;
        unanswered = !generated.text;
      }
    }

    const now = new Date().toISOString();
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .eq("session_id", parsed.data.sessionId)
      .maybeSingle();
    let conversationId = existingConversation?.id as string | undefined;
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
    const bestScore = retrieval.chunks[0]?.similarity ?? null;
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
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        embedding_tokens: retrieval.embeddingTokens,
      }),
    ]);

    return NextResponse.json({
      answer,
      sources: instructions?.citation_mode === false ? [] : sources,
      unanswered,
      debug: {
        retrievalMode: retrieval.mode,
        chunks: retrieval.chunks.map((chunk) => ({
          content: chunk.content.slice(0, 1_000),
          similarity: chunk.similarity,
          ...sourceMetadata(chunk),
        })),
        promptTokens,
        model,
        inputTokens,
        outputTokens,
        embeddingTokens: retrieval.embeddingTokens,
        latencyMs,
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
