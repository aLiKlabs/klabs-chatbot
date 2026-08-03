import { describe, expect, it } from "vitest";
import { calculateLunaCost } from "@/lib/openai/pricing";

describe("Luna usage pricing", () => {
  it("calculates regular, cached, cache-write, output, and embedding costs", () => {
    const result = calculateLunaCost({ inputTokens: 1_000_000, cachedInputTokens: 200_000, cacheWriteTokens: 100_000, outputTokens: 100_000, embeddingTokens: 50_000 });
    expect(result.uncachedInputTokens).toBe(700_000);
    expect(result.inputCost).toBeCloseTo(0.14);
    expect(result.cachedInputCost).toBeCloseTo(0.004);
    expect(result.cacheWriteCost).toBeCloseTo(0.025);
    expect(result.outputCost).toBeCloseTo(0.12);
    expect(result.embeddingCost).toBeCloseTo(0.001);
    expect(result.totalCost).toBeCloseTo(0.29);
  });

  it("caps cache categories so they cannot exceed total input", () => {
    const result = calculateLunaCost({ inputTokens: 100, cachedInputTokens: 80, cacheWriteTokens: 80, outputTokens: 0 });
    expect(result.cachedInputTokens).toBe(80);
    expect(result.cacheWriteTokens).toBe(20);
    expect(result.uncachedInputTokens).toBe(0);
  });
});
