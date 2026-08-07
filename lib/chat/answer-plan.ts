import { lexicalSimilarity } from "@/lib/retrieval/lexical";
import type { RetrievedChunk } from "@/lib/retrieval";
import type { QuestionUnderstanding } from "@/lib/chat/question";

export type EvidenceStrength = "high" | "medium" | "low" | "none";

export interface EvidenceEvaluation {
  answerable: boolean;
  evidenceStrength: EvidenceStrength;
  missingInformation: string[];
  hasConflict: boolean;
  needsClarification: boolean;
  needsHuman: boolean;
}

export interface AnswerPlan {
  directAnswer: string;
  supportingPoints: string[];
  conditions: string[];
  sourceIds: string[];
  needsClarification: boolean;
  needsEscalation: boolean;
}

function sentences(content: string) {
  return content
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12 && sentence.length <= 500);
}

export function evaluateEvidence(
  understanding: QuestionUnderstanding,
  chunks: RetrievedChunk[],
  hasConflict = false,
): EvidenceEvaluation {
  const evidence = chunks.map((chunk) => chunk.content).join("\n");
  const directScore = Math.max(...chunks.map((chunk) => lexicalSimilarity(understanding.resolvedQuestion, chunk.content)), 0);
  const missingInformation = understanding.entities.quotedPhrases
    .filter((phrase) => !evidence.toLocaleLowerCase().includes(phrase.toLocaleLowerCase()));
  const needsClarification = understanding.needsClarification;
  const needsHuman = hasConflict || understanding.intent === "account" || understanding.intent === "human-support";
  let evidenceStrength: EvidenceStrength = "none";
  if (chunks.length && directScore >= 0.55 && !missingInformation.length) evidenceStrength = "high";
  else if (chunks.length && directScore >= 0.3 && !missingInformation.length) evidenceStrength = "medium";
  else if (chunks.length) evidenceStrength = "low";

  return {
    answerable: !needsClarification && !hasConflict && !needsHuman && (evidenceStrength === "high" || evidenceStrength === "medium"),
    evidenceStrength,
    missingInformation,
    hasConflict,
    needsClarification,
    needsHuman,
  };
}

export function createAnswerPlan(
  understanding: QuestionUnderstanding,
  chunks: RetrievedChunk[],
  evaluation: EvidenceEvaluation,
): AnswerPlan {
  const points = chunks.flatMap((chunk) => sentences(chunk.content)).slice(0, 4);
  const conditions = points.filter((point) => /\b(unless|except|excluded|only|provided|however|defective|opened|warning)\b/iu.test(point));
  const sourceIds = [...new Set(chunks.map((chunk) => String(chunk.metadata.source_id || chunk.metadata.source_name || "unknown-source")))];
  return {
    directAnswer: `Answer the user's question directly: ${understanding.resolvedQuestion}`,
    supportingPoints: points,
    conditions,
    sourceIds,
    needsClarification: evaluation.needsClarification,
    needsEscalation: evaluation.needsHuman,
  };
}
