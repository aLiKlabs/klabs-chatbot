import { lexicalSimilarity, meaningfulTerms } from "@/lib/retrieval/lexical";
import type { RetrievedChunk } from "@/lib/retrieval";

export function isArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function relevantSentences(question: string, chunks: RetrievedChunk[]) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const sentences = chunks
    .flatMap((chunk) =>
      chunk.content
        .split(/\n+/)
        .flatMap((line) => Array.from(segmenter.segment(line), ({ segment }) => segment.trim()))
        .filter((sentence) => sentence.length > 12 && sentence.length <= 500)
        .filter((sentence) => !sentence.endsWith("?") && !/\bPAGE\s+\d+\b/i.test(sentence))
        .map((sentence) => ({ sentence, score: lexicalSimilarity(question, sentence) })),
    )
    .sort((a, b) => b.score - a.score)
    .filter(({ score }) => score > 0);

  const selected: string[] = [];
  for (const { sentence } of sentences) {
    const terms = new Set(meaningfulTerms(sentence));
    const repeatsExisting = selected.some((existing) => {
      const existingTerms = new Set(meaningfulTerms(existing));
      const shared = [...terms].filter((term) => existingTerms.has(term)).length;
      const overlap = shared / Math.max(Math.min(terms.size, existingTerms.size), 1);
      return overlap >= 0.72 || existing.includes(sentence) || sentence.includes(existing);
    });
    if (!repeatsExisting) selected.push(sentence);
    if (selected.length === 2) break;
  }

  if (selected.length) return selected;

  // A source-title query can retrieve the correct chunk even when the title is not repeated
  // in its body. In that case, answer from the leading text of the top retrieved chunk.
  return chunks
    .flatMap((chunk) =>
      chunk.content
        .split(/\n+/)
        .flatMap((line) => Array.from(segmenter.segment(line), ({ segment }) => segment.trim())),
    )
    .filter((sentence) => sentence.length > 12 && sentence.length <= 500 && !sentence.endsWith("?"))
    .slice(0, 2);
}

function contactAnswer(question: string, chunks: RetrievedChunk[]) {
  if (!/(contact|phone|number|email|reach|call|اتصل|تواصل|رقم|هاتف|بريد)/iu.test(question)) return null;
  const content = chunks.map(({ content: chunkContent }) => chunkContent).join("\n");
  const emails = [...new Set(content.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [])];
  const phones = [...new Set((content.match(/\+\d[\d ()-]{6,}\d/g) || []).map((phone) => phone.trim()))];
  if (!emails.length && !phones.length) return null;

  if (isArabic(question)) {
    const details = [emails[0] ? `البريد الإلكتروني ${emails[0]}` : "", phones[0] ? `الهاتف ${phones[0]}` : ""]
      .filter(Boolean)
      .join(" أو ");
    return `يمكنك التواصل مع الفريق عبر ${details}.`;
  }

  const details = [emails[0] ? `email ${emails[0]}` : "", phones[0] ? `call ${phones[0]}` : ""]
    .filter(Boolean)
    .join(" or ");
  return `You can contact the team by ${details}.`;
}

export function createLocalGroundedAnswer(question: string, chunks: RetrievedChunk[]) {
  const contact = contactAnswer(question, chunks);
  if (contact) return contact;
  const sentences = relevantSentences(question, chunks);
  if (!sentences.length) return null;
  return sentences.join(" ");
}
