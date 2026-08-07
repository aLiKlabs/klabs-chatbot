import type { LaravelClient } from "@/lib/laravel/client";
import { cleanExtractedText } from "@/lib/ingestion/clean";
import { createTextChunks } from "@/lib/ingestion/chunk";
import { extractDocument } from "@/lib/ingestion/extract";
import { createContentHash } from "@/lib/ingestion/hash";
import { knowledgeRedactionTopics, redactKnowledgeText } from "@/lib/ingestion/redact";
import { createEmbeddings } from "@/lib/openai/embeddings";
import { getOpenAIEnvironment } from "@/lib/env";
import { detectKnowledgeLanguage } from "@/lib/retrieval/language";
import type { KnowledgeSource } from "@/types/database";

type SourcePage = {
  id: string;
  url: string;
  title: string | null;
  raw_text: string | null;
  clean_text: string | null;
};

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Processing failed.";
  if (/429|quota|billing/i.test(message)) {
    return "OpenAI API credits are unavailable. Add billing or credits to the API account, then reprocess this source.";
  }
  if (/401|incorrect api key|invalid.*key/i.test(message)) {
    return "The OpenAI API key was rejected. Replace it in .env.local, restart the app, then reprocess this source.";
  }
  return message.slice(0, 1_000);
}

function sourceMimeType(source: KnowledgeSource) {
  const value = source.metadata?.mime_type;
  return typeof value === "string" ? value : "application/octet-stream";
}

function parseStoredEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  if (typeof value !== "string" || !value.startsWith("[") || !value.endsWith("]")) return null;
  const parsed = value.slice(1, -1).split(",").map(Number);
  return parsed.length && parsed.every(Number.isFinite) ? parsed : null;
}

async function saveExtractedPages(
  supabase: LaravelClient,
  source: KnowledgeSource,
  redactionTopics: readonly string[],
): Promise<SourcePage[]> {
  if (!source.storage_path) throw new Error("The uploaded file is missing from storage.");
  const { data, error } = await supabase.storage
    .from("chatbot-documents")
    .download(source.storage_path);
  if (error || !data) throw new Error("The uploaded file could not be downloaded.");

  const bytes = new Uint8Array(await data.arrayBuffer());
  const extracted = await extractDocument(bytes, source.name, sourceMimeType(source));
  const rows = extracted.sections.map((section) => {
    const pageSuffix = section.pageNumber ? `#page=${section.pageNumber}` : "";
    const text = redactKnowledgeText(section.text, redactionTopics);
    return {
      project_id: source.project_id,
      knowledge_source_id: source.id,
      url: `storage://${source.storage_path}${pageSuffix}`,
      title: section.pageNumber
        ? `${extracted.title || source.name} — Page ${section.pageNumber}`
        : extracted.title || source.name,
      raw_text: text,
      clean_text: text,
      content_hash: createContentHash(text),
      last_crawled_at: new Date().toISOString(),
    };
  });

  const { error: deleteError } = await supabase
    .from("source_pages")
    .delete()
    .eq("knowledge_source_id", source.id);
  if (deleteError) throw deleteError;
  const { data: pages, error: insertError } = await supabase
    .from("source_pages")
    .insert(rows)
    .select("id,url,title,raw_text,clean_text");
  if (insertError || !pages) throw insertError || new Error("Extracted pages could not be saved.");
  return pages as SourcePage[];
}

async function redactStoredPages(
  supabase: LaravelClient,
  pages: SourcePage[],
  redactionTopics: readonly string[],
) {
  return Promise.all(pages.map(async (page) => {
    const rawText = redactKnowledgeText(page.raw_text || page.clean_text || "", redactionTopics);
    const cleanText = redactKnowledgeText(page.clean_text || "", redactionTopics);
    if (rawText !== page.raw_text || cleanText !== page.clean_text) {
      const { error } = await supabase.from("source_pages").update({
        raw_text: rawText,
        clean_text: cleanText,
        content_hash: createContentHash(cleanText),
      }).eq("id", page.id);
      if (error) throw error;
    }
    return { ...page, raw_text: rawText, clean_text: cleanText };
  }));
}

export async function processKnowledgeSource(
  supabase: LaravelClient,
  projectId: string,
  sourceId: string,
) {
  const { data: rawSource, error: sourceError } = await supabase
    .from("knowledge_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .single();
  if (sourceError || !rawSource) throw new Error("Knowledge source not found.");
  const source = rawSource as KnowledgeSource;
  const { data: instructions } = await supabase
    .from("chatbot_instructions")
    .select("restricted_topics")
    .eq("project_id", projectId)
    .maybeSingle();
  const projectTopics = Array.isArray(instructions?.restricted_topics)
    ? instructions.restricted_topics.filter((topic: unknown): topic is string => typeof topic === "string")
    : [];
  const redactionTopics = Array.from(new Set([
    ...knowledgeRedactionTopics(source.metadata),
    ...projectTopics,
  ]));

  const { data: oldChunkRows } = await supabase
    .from("document_chunks")
    .select("content_hash,embedding")
    .eq("knowledge_source_id", sourceId)
    .not("embedding", "is", null);
  const reusableEmbeddings = new Map<string, number[]>();
  for (const row of oldChunkRows || []) {
    const embedding = parseStoredEmbedding(row.embedding);
    if (embedding) reusableEmbeddings.set(row.content_hash, embedding);
  }

  const { data: job, error: jobError } = await supabase
    .from("ingestion_jobs")
    .insert({
      project_id: projectId,
      knowledge_source_id: sourceId,
      job_type: source.last_processed_at ? "reprocess" : "embed",
      status: "processing",
      progress: 10,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error("The ingestion job could not be started.");

  try {
    await supabase
      .from("knowledge_sources")
      .update({ status: "processing", error_message: null })
      .eq("id", sourceId);

    let pages: SourcePage[];
    if (source.storage_path) {
      pages = await saveExtractedPages(supabase, source, redactionTopics);
    } else {
      const { data, error } = await supabase
        .from("source_pages")
        .select("id,url,title,raw_text,clean_text")
        .eq("knowledge_source_id", sourceId)
        .order("created_at");
      if (error || !data?.length) throw new Error("This source has no readable content.");
      pages = data as SourcePage[];
    }
    pages = await redactStoredPages(supabase, pages, redactionTopics);

    await supabase.from("ingestion_jobs").update({ progress: 35 }).eq("id", job.id);
    const sourceContent = pages
      .map((page) => cleanExtractedText(page.clean_text || ""))
      .filter(Boolean)
      .join("\n\n");
    if (!sourceContent) throw new Error("This source has no readable content.");
    const contentHash = createContentHash(sourceContent);

    const { count: existingCount } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("knowledge_source_id", sourceId);
    if (source.content_hash === contentHash && (existingCount ?? 0) > 0) {
      await Promise.all([
        supabase
          .from("knowledge_sources")
          .update({ status: "ready", error_message: null, last_processed_at: new Date().toISOString() })
          .eq("id", sourceId),
        supabase
          .from("ingestion_jobs")
          .update({ status: "completed", progress: 100, processed_items: existingCount, completed_at: new Date().toISOString() })
          .eq("id", job.id),
      ]);
      return { chunkCount: existingCount ?? 0, skipped: true };
    }

    const chunks = pages.flatMap((page) =>
      createTextChunks(cleanExtractedText(page.clean_text || "")).map((chunk) => ({
        ...chunk,
        sourcePageId: page.id,
        pageTitle: page.title,
        pageUrl: page.url,
      })),
    );
    if (!chunks.length) throw new Error("No usable knowledge chunks were created.");

    await supabase.from("ingestion_jobs").update({ progress: 55 }).eq("id", job.id);
    const missingChunks = chunks.filter(({ contentHash }) => !reusableEmbeddings.has(contentHash));
    const embedded = missingChunks.length
      ? await createEmbeddings(missingChunks.map(({ content }) => content))
      : { embeddings: [], totalTokens: 0, model: getOpenAIEnvironment().OPENAI_EMBEDDING_MODEL };
    const freshEmbeddings = new Map(
      missingChunks.map((chunk, index) => [chunk.contentHash, embedded.embeddings[index]]),
    );
    await supabase.from("ingestion_jobs").update({ progress: 90 }).eq("id", job.id);

    const payload = chunks.map((chunk, index) => ({
      source_page_id: chunk.sourcePageId,
      chunk_index: index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: reusableEmbeddings.get(chunk.contentHash) || freshEmbeddings.get(chunk.contentHash),
      content_hash: chunk.contentHash,
      metadata: {
        source_name: source.name,
        source_type: source.source_type,
        page_title: chunk.pageTitle,
        page_number: chunk.pageUrl.match(/#page=(\d+)$/)?.[1]
          ? Number(chunk.pageUrl.match(/#page=(\d+)$/)?.[1])
          : null,
        original_url: /^https?:\/\//i.test(chunk.pageUrl) ? chunk.pageUrl : source.original_url,
        language: detectKnowledgeLanguage(chunk.content),
      },
    }));
    const { error: replaceError } = await supabase.rpc("replace_source_chunks", {
      target_source_id: sourceId,
      target_project_id: projectId,
      source_content_hash: contentHash,
      chunk_payload: payload,
      embedding_token_count: embedded.totalTokens,
      embedding_model: embedded.model,
    });
    if (replaceError) throw replaceError;

    await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        progress: 100,
        processed_items: chunks.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { chunkCount: chunks.length, skipped: false };
  } catch (error) {
    const message = errorMessage(error);
    await Promise.all([
      supabase.from("knowledge_sources").update({ status: "failed", error_message: message }).eq("id", sourceId),
      supabase
        .from("ingestion_jobs")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", job.id),
    ]);
    throw new Error(message);
  }
}
