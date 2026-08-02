// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMockEmbedding } from "@/lib/openai/embeddings";

describe("local mock embeddings", () => {
  it("creates deterministic normalized vectors with the requested dimensions", () => {
    const first = createMockEmbedding("K-Labs verified content", 1536);
    const second = createMockEmbedding("K-Labs verified content", 1536);
    const different = createMockEmbedding("Different content", 1536);
    const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

    expect(first).toHaveLength(1536);
    expect(first).toEqual(second);
    expect(first).not.toEqual(different);
    expect(magnitude).toBeCloseTo(1, 8);
  });
});
