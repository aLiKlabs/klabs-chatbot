export const LUNA_PRICING = {
  model: "gpt-5.6-luna",
  inputPerMillion: 0.2,
  cachedInputPerMillion: 0.02,
  cacheWritePerMillion: 0.25,
  outputPerMillion: 1.2,
  embeddingPerMillion: 0.02,
} as const;

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens: number;
  embeddingTokens?: number;
};

function safeTokens(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value || 0)) : 0;
}

export function calculateLunaCost(usage: TokenUsage) {
  const inputTokens = safeTokens(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, safeTokens(usage.cachedInputTokens));
  const cacheWriteTokens = Math.min(
    inputTokens - cachedInputTokens,
    safeTokens(usage.cacheWriteTokens),
  );
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens);
  const outputTokens = safeTokens(usage.outputTokens);
  const embeddingTokens = safeTokens(usage.embeddingTokens);

  const inputCost = (uncachedInputTokens * LUNA_PRICING.inputPerMillion) / 1_000_000;
  const cachedInputCost = (cachedInputTokens * LUNA_PRICING.cachedInputPerMillion) / 1_000_000;
  const cacheWriteCost = (cacheWriteTokens * LUNA_PRICING.cacheWritePerMillion) / 1_000_000;
  const outputCost = (outputTokens * LUNA_PRICING.outputPerMillion) / 1_000_000;
  const embeddingCost = (embeddingTokens * LUNA_PRICING.embeddingPerMillion) / 1_000_000;

  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    uncachedInputTokens,
    outputTokens,
    embeddingTokens,
    inputCost,
    cachedInputCost,
    cacheWriteCost,
    outputCost,
    embeddingCost,
    totalCost: inputCost + cachedInputCost + cacheWriteCost + outputCost + embeddingCost,
  };
}
