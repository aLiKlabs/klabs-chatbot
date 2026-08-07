import type { LaravelClient } from "@/lib/laravel/client";
import { getOpenAIEnvironment } from "@/lib/env";
import { createEmbeddings } from "@/lib/openai/embeddings";
import { lexicalSimilarity } from "@/lib/retrieval/lexical";
import { detectKnowledgeLanguage, type KnowledgeLanguage } from "@/lib/retrieval/language";

export interface RetrievedChunk {
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  semanticSimilarity?: number;
  keywordRelevance?: number;
  metadataMatch?: number;
  sourceAuthority?: number;
  freshnessScore?: number;
  combinedScore?: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  embeddingTokens: number;
  model: string;
  mode: "vector" | "local-lexical" | "hybrid-lexical";
}

export interface RetrievalOptions {
  semanticCandidates?: number;
  keywordCandidates?: number;
  finalPassages?: number;
  now?: Date;
  language?: KnowledgeLanguage;
}

type SourceRow = {
  id: string;
  status?: string;
  name?: string;
  original_url?: string;
  metadata?: Record<string, unknown>;
};

type ChunkRow = {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
  knowledge_source_id: string;
  source_page_id?: string | null;
  chunk_index?: number;
};

type VectorRow = ChunkRow & {
  similarity: number;
  status?: string;
  source_status?: string;
  source_name?: string;
  original_url?: string;
};

function numberEnvironment(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedQueries(question: string | string[]) {
  return [...new Set((Array.isArray(question) ? question : [question])
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => value.length > 2))].slice(0, 4);
}

function metadataValue(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function sourceAuthority(metadata: Record<string, unknown>) {
  const explicit = metadataValue(metadata, "source_authority", "authority");
  if (typeof explicit === "number") return Math.max(0, Math.min(1, explicit));
  if (metadata.official === true || metadata.is_official === true) return 1;
  const type = String(metadata.source_type || "").toLocaleLowerCase();
  if (["policy", "manual", "faq", "website", "webpage"].some((value) => type.includes(value))) return 0.85;
  if (type.includes("note") || type.includes("informal")) return 0.45;
  return 0.7;
}

function freshnessScore(metadata: Record<string, unknown>, now: Date) {
  const value = metadataValue(metadata, "effective_date", "updated_at", "last_processed_at");
  if (!value) return 0.5;
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return 0.5;
  const ageDays = Math.max(0, (now.valueOf() - date.valueOf()) / 86_400_000);
  return Math.max(0, Math.min(1, 1 - ageDays / 3_650));
}

function labelsFor(metadata: Record<string, unknown>) {
  return [metadata.source_name, metadata.page_title, metadata.policy_category, metadata.product, metadata.location, metadata.plan]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function chunkKey(chunk: RetrievedChunk) {
  const id = metadataValue(chunk.metadata, "chunk_id", "id", "content_hash");
  return String(id || `${chunk.metadata.source_id || "source"}:${chunk.content.replace(/\s+/gu, " ").trim().toLocaleLowerCase()}`);
}

function hasImportantException(content: string) {
  return /\b(unless|except|excluded|excludes|only|provided that|however|defective|opened|warning)\b/iu.test(content);
}

export function deduplicateCandidates(chunks: RetrievedChunk[]) {
  const unique: RetrievedChunk[] = [];
  for (const candidate of [...chunks].sort((a, b) => b.similarity - a.similarity)) {
    if (unique.some((existing) => {
      if (chunkKey(existing) === chunkKey(candidate)) return true;
      if (hasImportantException(existing.content) !== hasImportantException(candidate.content)) return false;
      return lexicalSimilarity(existing.content, candidate.content) >= 0.88;
    })) continue;
    unique.push(candidate);
  }
  return unique;
}

export function expandNeighborChunks(selected: RetrievedChunk[], candidatePool: RetrievedChunk[], maximum = 8) {
  const expanded = [...selected];
  for (const chunk of selected) {
    if (expanded.length >= maximum) break;
    const sourceId = String(chunk.metadata.source_id || "");
    const pageId = String(chunk.metadata.source_page_id || "");
    const index = Number(chunk.metadata.chunk_index);
    if (!sourceId || !Number.isFinite(index)) continue;
    const neighbors = candidatePool
      .filter((candidate) => String(candidate.metadata.source_id || "") === sourceId
        && (!pageId || String(candidate.metadata.source_page_id || "") === pageId)
        && Math.abs(Number(candidate.metadata.chunk_index) - index) <= 1)
      .sort((a, b) => Math.abs(Number(a.metadata.chunk_index) - index) - Math.abs(Number(b.metadata.chunk_index) - index));
    for (const neighbor of neighbors) {
      if (expanded.length >= maximum) break;
      if (!expanded.some((item) => chunkKey(item) === chunkKey(neighbor))) expanded.push(neighbor);
    }
  }
  return expanded;
}

function scoreCandidate(chunk: RetrievedChunk, queries: string[], now: Date, language?: KnowledgeLanguage) {
  const labels = labelsFor(chunk.metadata);
  const keyword = Math.max(...queries.map((query) => lexicalSimilarity(query, `${labels} ${chunk.content}`)), 0);
  const metadataMatch = Math.max(...queries.map((query) => lexicalSimilarity(query, labels)), 0);
  const semantic = chunk.semanticSimilarity ?? 0;
  const authority = sourceAuthority(chunk.metadata);
  const freshness = freshnessScore(chunk.metadata, now);
  const chunkLanguage = typeof chunk.metadata.language === "string"
    ? chunk.metadata.language as KnowledgeLanguage
    : detectKnowledgeLanguage(chunk.content);
  const languageAffinity = !language || language === "unknown" ? 0.5 : chunkLanguage === language ? 1 : 0;
  const combined = 0.50 * semantic + 0.25 * keyword + 0.10 * metadataMatch + 0.05 * authority + 0.05 * freshness + 0.05 * languageAffinity;
  return { ...chunk, keywordRelevance: keyword, metadataMatch, sourceAuthority: authority, freshnessScore: freshness, combinedScore: combined, similarity: combined };
}

function sourceMetadata(source: SourceRow, row: ChunkRow) {
  return {
    ...((source.metadata || {}) as Record<string, unknown>),
    ...((row.metadata || {}) as Record<string, unknown>),
    source_id: row.knowledge_source_id,
    source_status: source.status,
    source_name: source.name,
    original_url: source.original_url,
    source_page_id: row.source_page_id,
    chunk_index: row.chunk_index,
    chunk_id: row.id,
  } as Record<string, unknown>;
}

async function retrieveLexically(
  client: LaravelClient,
  projectId: string,
  queries: string[],
  maximumResults: number,
) {
  const [{ data: chunkRows, error: chunksError }, { data: sourceRows, error: sourcesError }] = await Promise.all([
    client.from("document_chunks").select("id,content,metadata,knowledge_source_id,source_page_id,chunk_index").eq("project_id", projectId).limit(200),
    client.from("knowledge_sources").select("id,status,name,original_url,metadata").eq("project_id", projectId).eq("status", "ready"),
  ]);
  if (chunksError || sourcesError) throw chunksError || sourcesError;

  const sources = new Map<string, SourceRow>(((sourceRows || []) as SourceRow[]).map((source) => [source.id, source]));
  return ((chunkRows || []) as ChunkRow[])
    .filter((row) => sources.has(row.knowledge_source_id))
    .map((row) => {
      const metadata = sourceMetadata(sources.get(row.knowledge_source_id) || { id: row.knowledge_source_id }, row);
      const keywordRelevance = Math.max(...queries.map((query) => lexicalSimilarity(query, `${labelsFor(metadata)} ${row.content}`)), 0);
      return { content: row.content, metadata, similarity: keywordRelevance, keywordRelevance, semanticSimilarity: keywordRelevance };
    })
    .filter((chunk) => chunk.keywordRelevance >= 0.08)
    .sort((a, b) => b.keywordRelevance - a.keywordRelevance)
    .slice(0, maximumResults);
}

function vectorChunk(row: VectorRow) {
  return {
    content: row.content,
    similarity: row.similarity,
    semanticSimilarity: row.similarity,
    metadata: {
      ...((row.metadata || {}) as Record<string, unknown>),
      source_id: row.knowledge_source_id,
      source_status: row.source_status || row.status || "ready",
      source_name: row.source_name,
      original_url: row.original_url,
      source_page_id: row.source_page_id,
      chunk_index: row.chunk_index,
      chunk_id: row.id,
    },
  } satisfies RetrievedChunk;
}

export async function retrieveProjectKnowledge(
  client: LaravelClient,
  projectId: string,
  question: string | string[],
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const environment = getOpenAIEnvironment();
  const queries = normalizedQueries(question);
  const semanticCandidates = Math.min(numberEnvironment("DEFAULT_SEMANTIC_CANDIDATES", options.semanticCandidates || 15), 30);
  const keywordCandidates = Math.min(numberEnvironment("DEFAULT_KEYWORD_CANDIDATES", options.keywordCandidates || 15), 30);
  const finalPassages = Math.min(numberEnvironment("DEFAULT_FINAL_PASSAGES", options.finalPassages || 6), 8);
  const now = options.now || new Date();
  const keywordResults = retrieveLexically(client, projectId, queries, keywordCandidates);

  if (environment.MOCK_EMBEDDINGS) {
    const chunks = (await keywordResults).map((chunk) => scoreCandidate(chunk, queries, now, options.language));
    const deduped = deduplicateCandidates(chunks);
    return { chunks: expandNeighborChunks(deduped.slice(0, finalPassages), deduped, finalPassages), embeddingTokens: 0, model: "local-grounded-retrieval", mode: "local-lexical" };
  }

  const embedded = await createEmbeddings(queries);
  const threshold = Math.min(numberEnvironment("DEFAULT_SIMILARITY_THRESHOLD", 0.72), 0.99);
  const vectorResults = await Promise.all(embedded.embeddings.map(async (embedding) => {
    const { data, error } = await client.rpc("match_document_chunks", {
      query_embedding: embedding,
      target_project_id: projectId,
      match_threshold: threshold,
      match_count: semanticCandidates,
    });
    if (error) throw error;
    return ((data || []) as VectorRow[]).map(vectorChunk);
  }));
  const keywordChunks = await keywordResults;
  const candidates = [...vectorResults.flat(), ...keywordChunks];
  const merged = new Map<string, RetrievedChunk>();
  for (const candidate of candidates) {
    const key = chunkKey(candidate);
    const existing = merged.get(key);
    if (!existing || (candidate.semanticSimilarity || 0) > (existing.semanticSimilarity || 0)) merged.set(key, candidate);
  }
  const ranked = deduplicateCandidates([...merged.values()].map((chunk) => scoreCandidate(chunk, queries, now, options.language)));
  const selected = ranked.slice(0, finalPassages);
  return {
    chunks: expandNeighborChunks(selected, ranked, finalPassages),
    embeddingTokens: embedded.totalTokens,
    model: embedded.model,
    mode: vectorResults.flat().length ? "vector" : "hybrid-lexical",
  };
}

export { normalizedQueries };
