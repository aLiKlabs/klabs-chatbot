import { getEncoding } from "js-tiktoken";
import { createContentHash } from "@/lib/ingestion/hash";

export interface ChunkingOptions {
  targetTokens: number;
  maximumTokens: number;
  overlapTokens: number;
  minimumTokens: number;
}

export interface TextChunk {
  content: string;
  tokenCount: number;
  contentHash: string;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  targetTokens: 500,
  maximumTokens: 700,
  overlapTokens: 80,
  minimumTokens: 30,
};

const encoding = getEncoding("cl100k_base");

export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

function splitOversizedText(text: string, maximumTokens: number): string[] {
  const tokens = encoding.encode(text);
  if (tokens.length <= maximumTokens) return [text];

  const pieces: string[] = [];
  for (let index = 0; index < tokens.length; index += maximumTokens) {
    pieces.push(encoding.decode(tokens.slice(index, index + maximumTokens)).trim());
  }
  return pieces.filter(Boolean);
}

function semanticSegments(text: string, maximumTokens: number): string[] {
  const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const segments: string[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;
    const sentences = Array.from(sentenceSegmenter.segment(trimmedBlock), ({ segment }) =>
      segment.trim(),
    ).filter(Boolean);
    for (const sentence of sentences.length ? sentences : [trimmedBlock]) {
      segments.push(...splitOversizedText(sentence, maximumTokens));
    }
  }
  return segments;
}

export function createTextChunks(
  text: string,
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS,
): TextChunk[] {
  if (
    options.minimumTokens < 1 ||
    options.targetTokens < options.minimumTokens ||
    options.maximumTokens < options.targetTokens ||
    options.overlapTokens >= options.targetTokens
  ) {
    throw new Error("Invalid chunking configuration");
  }

  const segments = semanticSegments(text, options.maximumTokens);
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    const content = current.join(" ").replace(/\s+/g, " ").trim();
    if (!content) return;
    const tokenCount = countTokens(content);
    if (tokenCount >= options.minimumTokens || chunks.length === 0) {
      chunks.push({ content, tokenCount, contentHash: createContentHash(content) });
    }

    const overlap = encoding
      .decode(encoding.encode(content).slice(-options.overlapTokens))
      .trim();
    current = overlap ? [overlap] : [];
    currentTokens = overlap ? countTokens(overlap) : 0;
  };

  for (const segment of segments) {
    const segmentTokens = countTokens(segment);
    if (current.length && currentTokens + segmentTokens > options.maximumTokens) flush();
    current.push(segment);
    currentTokens += segmentTokens;
    if (currentTokens >= options.targetTokens) flush();
  }
  if (current.length) flush();

  const unique = new Map<string, TextChunk>();
  for (const chunk of chunks) unique.set(chunk.contentHash, chunk);
  return [...unique.values()];
}
