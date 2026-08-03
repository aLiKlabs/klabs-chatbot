import { NextResponse } from "next/server";
import { buildGroundedPrompt } from "@/lib/chat/prompt";
import { createLocalGroundedAnswer, isArabic } from "@/lib/chat/local-answer";
import { estimateTokens } from "@/lib/chat/token-estimate";
import { getOpenAIEnvironment } from "@/lib/env";
import { consumeWidgetRateLimit, requestAddress } from "@/lib/rate-limit/widget";
import { retrieveProjectKnowledge, type RetrievedChunk } from "@/lib/retrieval";
import { createServiceClient } from "@/lib/supabase/service";
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
    const retrieval = await retrieveProjectKnowledge(supabase, widget.project.id, parsed.data.message);
    const uniqueSources = retrieval.chunks.map(sourceMetadata).filter((source, index, all) => all.findIndex((candidate) => candidate.title === source.title && candidate.url === source.url) === index);
    const fallback = localized(widget.instructions.fallback_message, language, language === "ar" ? "عذراً، لا تتوفر لدي معلومات حول ذلك. يمكنك التواصل مع الفريق للمساعدة." : "I’m sorry, I don’t have information about that. You can contact the team for help.");
    let answer = fallback;
    let model = "safe-fallback";
    let inputTokens = estimateTokens(parsed.data.message);
    let outputTokens = estimateTokens(answer);
    let unanswered = retrieval.chunks.length === 0;
    if (retrieval.chunks.length) {
      const prompt = buildGroundedPrompt({ question: parsed.data.message, chunks: retrieval.chunks, history: parsed.data.history, projectInstruction: widget.instructions.system_instruction });
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
    const { data: existing } = await supabase.from("conversations").select("id").eq("project_id", widget.project.id).eq("session_id", parsed.data.sessionId).maybeSingle();
    let conversationId = existing?.id as string | undefined;
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
    const { error: messageError } = await supabase.from("messages").insert([
      { id: userMessageId, project_id: widget.project.id, conversation_id: conversationId, role: "user", content: parsed.data.message, sources: [], retrieval_score: null, model: null, input_tokens: null, output_tokens: null, latency_ms: null, is_unanswered: false },
      { id: assistantMessageId, project_id: widget.project.id, conversation_id: conversationId, role: "assistant", content: answer, sources: uniqueSources, retrieval_score: retrieval.chunks[0]?.similarity ?? null, model, input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: latencyMs, is_unanswered: unanswered },
    ]);
    if (messageError) throw messageError;
    await Promise.all([
      supabase.from("conversations").update({ status: unanswered ? "unanswered" : "active", language, last_message_at: now }).eq("id", conversationId),
      supabase.from("usage_events").insert({ project_id: widget.project.id, conversation_id: conversationId, event_type: unanswered ? "chat_unanswered" : "chat_answered", model, input_tokens: inputTokens, output_tokens: outputTokens, embedding_tokens: retrieval.embeddingTokens }),
    ]);

    const encoder = new TextEncoder();
    const visibleSources = widget.instructions.citation_mode ? uniqueSources.filter(({ url }) => url) : [];
    const stream = new ReadableStream({
      async start(controller) {
        streamEvent(controller, encoder, "meta", { messageId: assistantMessageId, conversationId, unanswered, sources: visibleSources });
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
