export type AnalyticsMessage = {
  role: string;
  content: string;
  is_unanswered?: boolean;
  latency_ms?: number | null;
  sources?: unknown;
  created_at: string;
};

export type UsageRow = {
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
  estimated_cost: number | string | null;
  created_at: string;
};

export function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function buildDailySeries(conversations: Array<{ started_at: string }>, messages: AnalyticsMessage[], days = 30, endDate = new Date()) {
  const map = new Map<string, { date: string; conversations: number; questions: number; unanswered: number }>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(endDate); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10); map.set(key, { date: key, conversations: 0, questions: 0, unanswered: 0 });
  }
  for (const conversation of conversations) { const row = map.get(dateKey(conversation.started_at)); if (row) row.conversations += 1; }
  for (const message of messages) { const row = map.get(dateKey(message.created_at)); if (row && message.role === "user") row.questions += 1; if (row && message.is_unanswered) row.unanswered += 1; }
  return [...map.values()];
}

function normalizedQuestion(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

export function commonQuestions(messages: AnalyticsMessage[], limit = 6) {
  const entries = new Map<string, { question: string; count: number }>();
  for (const message of messages.filter(({ role }) => role === "user")) {
    const key = normalizedQuestion(message.content); if (!key) continue;
    const current = entries.get(key); if (current) current.count += 1; else entries.set(key, { question: message.content.trim(), count: 1 });
  }
  return [...entries.values()].sort((a, b) => b.count - a.count || a.question.localeCompare(b.question)).slice(0, limit);
}

export function commonSources(messages: AnalyticsMessage[], limit = 6) {
  const entries = new Map<string, { title: string; count: number }>();
  for (const message of messages) {
    if (!Array.isArray(message.sources)) continue;
    for (const source of message.sources) {
      if (!source || typeof source !== "object") continue;
      const title = String((source as Record<string, unknown>).title || "").trim(); if (!title) continue;
      const current = entries.get(title); if (current) current.count += 1; else entries.set(title, { title, count: 1 });
    }
  }
  return [...entries.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, limit);
}

export function calculateUsage(rows: UsageRow[]) {
  const totals = rows.reduce((sum, row) => ({
    inputTokens: sum.inputTokens + (row.input_tokens || 0), outputTokens: sum.outputTokens + (row.output_tokens || 0),
    embeddingTokens: sum.embeddingTokens + (row.embedding_tokens || 0), reportedCost: sum.reportedCost + Number(row.estimated_cost || 0),
  }), { inputTokens: 0, outputTokens: 0, embeddingTokens: 0, reportedCost: 0 });
  const inputRate = Number(process.env.OPENAI_INPUT_COST_PER_MILLION || 0);
  const outputRate = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION || 0);
  const embeddingRate = Number(process.env.OPENAI_EMBEDDING_COST_PER_MILLION || 0);
  const configuredCost = (totals.inputTokens * inputRate + totals.outputTokens * outputRate + totals.embeddingTokens * embeddingRate) / 1_000_000;
  return { ...totals, estimatedCost: totals.reportedCost || configuredCost };
}

export function averageLatency(messages: AnalyticsMessage[]) {
  const values = messages.map(({ latency_ms }) => latency_ms).filter((value): value is number => typeof value === "number" && value >= 0);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}
