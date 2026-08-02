import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getOpenAIEnvironment } from "@/lib/env";
import { countTokens } from "@/lib/ingestion/chunk";
import { getOpenAIClient } from "@/lib/openai/client";

const MAX_EMBEDDING_BATCH = 64;
const MAX_ATTEMPTS = 3;

export interface EmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  model: string;
}

function shouldRetry(error: unknown): boolean {
  return error instanceof OpenAI.APIError && (error.status === 429 || error.status >= 500);
}

export function createMockEmbedding(input: string, dimensions: number): number[] {
  const digest = createHash("sha256").update(input).digest();
  let state = digest.readUInt32LE(0) || 1;
  const vector = Array.from({ length: dimensions }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  });
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / magnitude);
}

async function embedBatch(input: string[]) {
  const environment = getOpenAIEnvironment();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await getOpenAIClient().embeddings.create({
        model: environment.OPENAI_EMBEDDING_MODEL,
        dimensions: environment.OPENAI_EMBEDDING_DIMENSIONS,
        input,
        encoding_format: "float",
      });
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === MAX_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function createEmbeddings(input: string[]): Promise<EmbeddingResult> {
  const environment = getOpenAIEnvironment();
  if (environment.MOCK_EMBEDDINGS) {
    return {
      embeddings: input.map((content) =>
        createMockEmbedding(content, environment.OPENAI_EMBEDDING_DIMENSIONS),
      ),
      totalTokens: input.reduce((total, content) => total + countTokens(content), 0),
      model: "mock-local-development",
    };
  }
  const embeddings: number[][] = [];
  let totalTokens = 0;

  for (let index = 0; index < input.length; index += MAX_EMBEDDING_BATCH) {
    const response = await embedBatch(input.slice(index, index + MAX_EMBEDDING_BATCH));
    embeddings.push(...response.data.sort((a, b) => a.index - b.index).map(({ embedding }) => embedding));
    totalTokens += response.usage.total_tokens;
  }

  return { embeddings, totalTokens, model: environment.OPENAI_EMBEDDING_MODEL };
}
