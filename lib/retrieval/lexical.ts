const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "can", "do", "for", "from", "how",
  "i", "in", "is", "it", "me", "of", "on", "or", "the", "this", "to", "we", "what",
  "tell", "about", "explain",
  "when", "where", "which", "who", "why", "with", "you", "your",
  "في", "من", "إلى", "الى", "على", "عن", "ما", "ماذا", "كيف", "هل", "هو", "هي", "و",
  "شنو", "وش", "ايش", "إيش", "ابي", "أبي", "ابغى", "أبغى", "قول", "قولي", "خبرني", "تكلم", "انزين",
]);

const RELATED_TERMS: Record<string, string[]> = {
  number: ["phone", "telephone", "call", "contact"],
  phone: ["number", "telephone", "call", "contact"],
  telephone: ["number", "phone", "call", "contact"],
  services: ["service", "capabilities", "capability", "solutions"],
  service: ["services", "capabilities", "capability", "solutions"],
  reach: ["contact", "email", "phone", "call"],
  contact: ["reach", "email", "phone", "call"],
  "رقم": ["number", "phone", "telephone", "call", "contact"],
  "التواصل": ["contact", "reach", "email", "phone", "call"],
  "تواصل": ["contact", "reach", "email", "phone", "call"],
  "الايميل": ["email", "contact"],
  "الإيميل": ["email", "contact"],
  "ايميل": ["email", "contact"],
  "إيميل": ["email", "contact"],
  "البريد": ["email", "contact"],
  "بريد": ["email", "contact"],
  "الخدمات": ["services", "service", "capabilities", "solutions"],
  "خدمات": ["services", "service", "capabilities", "solutions"],
  "خدمة": ["services", "service", "capabilities", "solutions"],
  "فريق": ["team", "teams"],
  "الفريق": ["team", "teams"],
  "فرق": ["team", "teams"],
  "الفرق": ["team", "teams"],
  "افرقه": ["team", "teams"],
  "الافرقه": ["team", "teams"],
  "كلابس": ["klabs", "labs"],
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ـ\u064b-\u065f\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function matchesTerm(queryTerm: string, contentTerms: Set<string>) {
  if (contentTerms.has(queryTerm)) return true;
  // One-character typos are common in names (for example, "victorous").
  // Keep fuzzy matching limited to longer words so it cannot distort short,
  // high-impact terms such as policy names, numbers, or acronyms.
  return queryTerm.length >= 5 && [...contentTerms].some((term) =>
    term.length >= 5 && editDistance(queryTerm, term) <= 1,
  );
}

export function meaningfulTerms(value: string): string[] {
  const terms = normalize(value).split(/\s+/).filter(Boolean);
  const meaningful = terms.filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  const selected = meaningful.length ? meaningful : terms;
  const arabicStems = selected.flatMap((term) => {
    if (!/[\u0600-\u06ff]/u.test(term) || term.length < 4) return [];
    // Remove common Arabic conjunctions, prepositions, and the definite article
    // so "بالكارتنج" and "الكارتنج" can match the same Arabic source term.
    const withoutPrefix = term.replace(/^(?:و|ف|ب|ك|ل)?(?:ال)/u, "").replace(/^(?:و|ف|ب|ك|ل)/u, "");
    return withoutPrefix.length >= 3 && withoutPrefix !== term ? [withoutPrefix] : [];
  });
  const searchTerms = [...new Set([...selected, ...arabicStems])];
  const expanded = searchTerms.flatMap((term) => [term, ...(RELATED_TERMS[term] || [])]);
  for (const term of searchTerms) {
    // Arabic commonly attaches possessive pronouns directly to nouns, e.g.
    // رقمك / رقمكم and خدماتكم. Match the meaningful stem as the same intent.
    if (term.startsWith("رقم")) expanded.push("number", "phone", "telephone", "call", "contact");
    if (term.includes("تواصل")) expanded.push("contact", "reach", "email", "phone", "call");
    if (term.includes("ايميل") || term.includes("إيميل") || term.includes("بريد")) expanded.push("email", "contact");
    if (term.includes("خدم")) expanded.push("services", "service", "capabilities", "solutions");
  }
  if (searchTerms.includes("klabs")) expanded.push("labs");
  if (searchTerms.includes("labs") && searchTerms.includes("k")) expanded.push("klabs");
  return [...new Set(expanded)];
}

export function lexicalSimilarity(query: string, content: string): number {
  const queryTerms = meaningfulTerms(query);
  if (!queryTerms.length) return 0;
  const contentTerms = new Set(meaningfulTerms(content));
  const matches = queryTerms.filter((term) => matchesTerm(term, contentTerms)).length;
  if (!matches) return 0;

  const coverage = matches / queryTerms.length;
  const precision = matches / Math.max(Math.min(contentTerms.size, 20), 1);
  const normalizedQuery = normalize(query);
  const phraseBonus = normalizedQuery.length > 4 && normalize(content).includes(normalizedQuery) ? 0.18 : 0;
  return Math.min(0.99, coverage * 0.82 + precision * 0.12 + phraseBonus);
}
