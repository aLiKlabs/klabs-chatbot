import { describe, expect, it } from "vitest";
import { averageLatency, buildDailySeries, calculateUsage, commonQuestions, commonSources } from "@/lib/analytics";

describe("project analytics", () => {
  const now = new Date().toISOString();
  it("groups repeated questions without punctuation or case noise", () => {
    const result = commonQuestions([
      { role: "user", content: "What services?", created_at: now },
      { role: "user", content: "what SERVICES", created_at: now },
      { role: "assistant", content: "Answer", created_at: now },
    ]);
    expect(result).toEqual([{ question: "What services?", count: 2 }]);
  });
  it("counts retrieved source titles", () => {
    expect(commonSources([{ role: "assistant", content: "A", created_at: now, sources: [{ title: "About" }, { title: "About" }] }])).toEqual([{ title: "About", count: 2 }]);
  });
  it("calculates latency and token totals", () => {
    expect(averageLatency([{ role: "assistant", content: "A", created_at: now, latency_ms: 100 }, { role: "assistant", content: "B", created_at: now, latency_ms: 300 }])).toBe(200);
    expect(calculateUsage([{ input_tokens: 10, output_tokens: 20, embedding_tokens: 30, estimated_cost: "0.25", created_at: now }])).toMatchObject({ inputTokens: 10, outputTokens: 20, embeddingTokens: 30, estimatedCost: 0.25 });
  });
  it("builds an inclusive trend range ending on the selected date", () => {
    const series = buildDailySeries([], [], 3, new Date("2026-08-02T00:00:00Z"));
    expect(series.map(({ date }) => date)).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });
});
