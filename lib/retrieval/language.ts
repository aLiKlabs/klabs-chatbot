export type KnowledgeLanguage = "ar" | "en" | "unknown";

export function detectKnowledgeLanguage(value: string): KnowledgeLanguage {
  const letters = value.match(/[\p{L}]/gu) || [];
  if (!letters.length) return "unknown";
  const arabic = value.match(/[\u0600-\u06ff]/gu)?.length || 0;
  if (arabic / letters.length >= 0.18) return "ar";
  return "en";
}
