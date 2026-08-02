import { lexicalSimilarity } from "@/lib/retrieval/lexical";
import type { RetrievedChunk } from "@/lib/retrieval";

export function isArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function relevantSentences(question: string, chunks: RetrievedChunk[]) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const sentences = chunks
    .flatMap((chunk) =>
      Array.from(segmenter.segment(chunk.content), ({ segment }) => segment.trim())
        .filter((sentence) => sentence.length > 8)
        .map((sentence) => ({ sentence, score: lexicalSimilarity(question, sentence) })),
    )
    .sort((a, b) => b.score - a.score)
    .filter((item, index, items) => items.findIndex(({ sentence }) => sentence === item.sentence) === index)
    .filter(({ score }) => score > 0);

  if (sentences.length) {
    return sentences.slice(0, 3).map(({ sentence }) => sentence);
  }

  // A source-title query can retrieve the correct chunk even when the title is not repeated
  // in its body. In that case, answer from the leading text of the top retrieved chunk.
  return chunks
    .flatMap((chunk) => Array.from(segmenter.segment(chunk.content), ({ segment }) => segment.trim()))
    .filter((sentence) => sentence.length > 8)
    .slice(0, 2);
}

export function createLocalGroundedAnswer(question: string, chunks: RetrievedChunk[]) {
  const sentences = relevantSentences(question, chunks);
  if (!sentences.length) return null;
  const answer = sentences.join(" ");
  return isArabic(question)
    ? `بحسب المعلومات الموثقة في قاعدة المعرفة: ${answer}`
    : `Based on the verified knowledge: ${answer}`;
}
