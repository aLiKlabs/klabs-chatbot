const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "do", "for", "from", "how",
  "i", "in", "is", "it", "me", "of", "on", "or", "the", "this", "to", "we", "what",
  "when", "where", "which", "who", "why", "with", "you", "your",
  "في", "من", "إلى", "الى", "على", "عن", "ما", "ماذا", "كيف", "هل", "هو", "هي", "و",
]);

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function meaningfulTerms(value: string): string[] {
  const terms = normalize(value).split(/\s+/).filter(Boolean);
  const meaningful = terms.filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  return [...new Set(meaningful.length ? meaningful : terms)];
}

export function lexicalSimilarity(query: string, content: string): number {
  const queryTerms = meaningfulTerms(query);
  if (!queryTerms.length) return 0;
  const contentTerms = new Set(meaningfulTerms(content));
  const matches = queryTerms.filter((term) => contentTerms.has(term)).length;
  if (!matches) return 0;

  const coverage = matches / queryTerms.length;
  const precision = matches / Math.max(Math.min(contentTerms.size, 20), 1);
  const normalizedQuery = normalize(query);
  const phraseBonus = normalizedQuery.length > 4 && normalize(content).includes(normalizedQuery) ? 0.18 : 0;
  return Math.min(0.99, coverage * 0.82 + precision * 0.12 + phraseBonus);
}
