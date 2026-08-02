import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAIEnvironment } from "@/lib/env";
import { createEmbeddings } from "@/lib/openai/embeddings";
import { lexicalSimilarity } from "@/lib/retrieval/lexical";

export interface RetrievedChunk {
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  embeddingTokens: number;
  model: string;
  mode: "vector" | "local-lexical";
}

function numberEnvironment(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function retrieveProjectKnowledge(
  supabase: SupabaseClient,
  projectId: string,
  question: string,
): Promise<RetrievalResult> {
  const environment = getOpenAIEnvironment();
  const maximumResults = Math.min(numberEnvironment("DEFAULT_MAX_RETRIEVAL_RESULTS", 6), 12);

  if (environment.MOCK_EMBEDDINGS) {
    const [{ data: chunkRows, error: chunksError }, { data: sourceRows, error: sourcesError }] =
      await Promise.all([
        supabase
          .from("document_chunks")
          .select("content,metadata,knowledge_source_id")
          .eq("project_id", projectId)
          .limit(200),
        supabase
          .from("knowledge_sources")
          .select("id")
          .eq("project_id", projectId)
          .eq("status", "ready"),
      ]);
    if (chunksError || sourcesError) throw chunksError || sourcesError;

    const readySourceIds = new Set((sourceRows || []).map(({ id }) => id));
    const chunks = (chunkRows || [])
      .filter(({ knowledge_source_id }) => readySourceIds.has(knowledge_source_id))
      .map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const labels = [metadata.source_name, metadata.page_title]
          .filter((value): value is string => typeof value === "string")
          .join(" ");

        return {
          content: row.content,
          metadata,
          similarity: lexicalSimilarity(question, `${labels} ${row.content}`),
        };
      })
      .filter(({ similarity }) => similarity >= 0.16)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maximumResults);

    return { chunks, embeddingTokens: 0, model: "local-grounded-retrieval", mode: "local-lexical" };
  }

  const embedded = await createEmbeddings([question]);
  const threshold = Math.min(numberEnvironment("DEFAULT_SIMILARITY_THRESHOLD", 0.72), 0.99);
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedded.embeddings[0],
    target_project_id: projectId,
    match_threshold: threshold,
    match_count: maximumResults,
  });
  if (error) throw error;

  return {
    chunks: (data || []).map((row: { content: string; similarity: number; metadata: unknown }) => ({
      content: row.content,
      similarity: row.similarity,
      metadata: (row.metadata || {}) as Record<string, unknown>,
    })),
    embeddingTokens: embedded.totalTokens,
    model: embedded.model,
    mode: "vector",
  };
}
