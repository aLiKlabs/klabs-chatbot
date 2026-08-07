import { lexicalSimilarity, meaningfulTerms } from "@/lib/retrieval/lexical";
import type { RetrievedChunk } from "@/lib/retrieval";

const APPROVED_SOURCE_STATUSES = new Set(["approved", "active", "published", "ready"]);
const BLOCKED_SOURCE_STATUSES = new Set(["draft", "archived", "disabled", "expired", "pending", "failed"]);

export interface GroundingConflict {
  topic: string;
  values: string[];
  sourceIds: string[];
}

export interface GroundingAssessment {
  chunks: RetrievedChunk[];
  conflicts: GroundingConflict[];
  hasConflictingSources: boolean;
}

function stringMetadata(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function sourceId(chunk: RetrievedChunk) {
  return stringMetadata(chunk.metadata, "source_id", "knowledge_source_id", "source_name", "original_url") || "unknown-source";
}

function isSourceApproved(chunk: RetrievedChunk, now: Date) {
  if (/ignore\s+(all\s+)?previous instructions|reveal\s+(the\s+)?(?:hidden|system)\s+prompt|you are now\s+/iu.test(chunk.content)) return false;
  const metadata = chunk.metadata;
  if (metadata.superseded === true || metadata.is_superseded === true) return false;
  const explicitApproval = metadata.approved;
  if (explicitApproval === false) return false;

  const status = stringMetadata(metadata, "source_status", "approval_status", "status");
  if (status && (BLOCKED_SOURCE_STATUSES.has(status.toLowerCase()) || !APPROVED_SOURCE_STATUSES.has(status.toLowerCase()))) return false;

  const expiresAt = stringMetadata(metadata, "expires_at", "expiration_date", "valid_until");
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (!Number.isNaN(expiry.valueOf()) && expiry < now) return false;
  }
  return true;
}

export function filterApprovedChunks(chunks: RetrievedChunk[], now = new Date()) {
  return chunks.filter((chunk) => Boolean(chunk.content.trim()) && isSourceApproved(chunk, now));
}

function numberWordValues(value: string) {
  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14,
    fifteen: 15, twenty: 20, thirty: 30,
  };
  return [...value.toLocaleLowerCase().matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|thirty)\b/gu)]
    .map((match) => words[match[1]])
    .filter((number): number is number => number !== undefined);
}

function policySignals(content: string) {
  const signals: Array<{ topic: string; value: string }> = [];
  for (const match of content.matchAll(/\b(\d+)\s*(calendar\s+|business\s+)?days?\b/giu)) {
    const before = content.slice(Math.max(0, (match.index || 0) - 80), match.index || 0).toLocaleLowerCase();
    const topic = before.match(/(return|refund|delivery|cancell?ation|exchange)/u)?.[1] || "time-limit";
    signals.push({ topic, value: `${match[1]} ${(match[2] || "").trim()}days`.replace(/\s+/g, " ").trim() });
  }
  for (const match of content.matchAll(/\b(free|complimentary|no charge|paid|fee|charge)\b/giu)) {
    const before = content.slice(Math.max(0, (match.index || 0) - 80), match.index || 0).toLocaleLowerCase();
    if (/delivery|shipping|shipment/u.test(before)) signals.push({ topic: "delivery-cost", value: match[1].toLocaleLowerCase() });
  }
  return signals;
}

export function detectConflictingSources(chunks: RetrievedChunk[]) {
  const byTopic = new Map<string, Map<string, Set<string>>>();
  for (const chunk of chunks) {
    for (const signal of policySignals(chunk.content)) {
      const values = byTopic.get(signal.topic) || new Map<string, Set<string>>();
      const sourceIds = values.get(signal.value) || new Set<string>();
      sourceIds.add(sourceId(chunk));
      values.set(signal.value, sourceIds);
      byTopic.set(signal.topic, values);
    }
  }

  return [...byTopic.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([topic, values]) => ({
      topic,
      values: [...values.keys()],
      sourceIds: [...new Set([...values.values()].flatMap((ids) => [...ids]))],
    }));
}

export function assessKnowledge(chunks: RetrievedChunk[], now = new Date()): GroundingAssessment {
  const approvedChunks = filterApprovedChunks(chunks, now);
  const conflicts = detectConflictingSources(approvedChunks);
  return { chunks: approvedChunks, conflicts, hasConflictingSources: conflicts.length > 0 };
}

function isNonFactualSentence(sentence: string) {
  return /^(hello|hi|thanks|thank you|you’re welcome|you're welcome|i('m| am) sorry|i (could|can)( not|'t)|i don('t| do not) have|i found conflicting|please|how can i help|what i can confirm)/iu.test(sentence.trim());
}

function valuesIn(value: string) {
  return [
    ...value.matchAll(/\b\d+(?:[.,]\d+)?\b/gu),
  ].map((match) => match[0])
    .concat(numberWordValues(value).map(String));
}

export function findUnsupportedClaims(answer: string, chunks: RetrievedChunk[]) {
  const evidenceChunks = filterApprovedChunks(chunks);
  const evidence = evidenceChunks.map((chunk) => chunk.content).join("\n");
  const evidenceTerms = meaningfulTerms(evidence);
  const evidenceValues = valuesIn(evidence);
  const unsupportedModifiers = /\b(free|guaranteed?|lifetime|tomorrow|today|always|never)\b/giu;
  return answer
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !isNonFactualSentence(sentence))
    .filter((sentence) => {
      const answerValues = valuesIn(sentence);
      if (answerValues.some((value) => !evidenceValues.includes(value))) return true;
      const modifiers = sentence.match(unsupportedModifiers) || [];
      if (modifiers.some((modifier) => !evidence.toLocaleLowerCase().includes(modifier.toLocaleLowerCase()))) return true;
      const terms = meaningfulTerms(sentence);
      const shared = terms.filter((term) => evidenceTerms.includes(term));
      const minimumSharedTerms = Math.min(2, Math.max(1, terms.length));
      return shared.length < minimumSharedTerms || lexicalSimilarity(sentence, evidence) < 0.12;
    });
}

export function validateGroundedAnswer(answer: string, chunks: RetrievedChunk[], fallback: string) {
  const unsupportedClaims = findUnsupportedClaims(answer, chunks);
  // A concise grounded answer can contain a polite, generic closing sentence
  // that is not present verbatim in a source. Preserve the verified sentences
  // instead of discarding the whole answer because of that one sentence.
  const unsupported = new Set(unsupportedClaims);
  const verifiedSentences = answer
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !unsupported.has(sentence));
  const verifiedAnswer = verifiedSentences.join(" ");
  return {
    answer: unsupportedClaims.length && !verifiedAnswer ? fallback : verifiedAnswer || answer,
    grounded: unsupportedClaims.length === 0 || Boolean(verifiedAnswer),
    unsupportedClaims,
  };
}

export interface ClaimValidation {
  claim: string;
  supported: boolean;
  sourceIds: string[];
}

export function extractMaterialClaims(answer: string) {
  return answer
    .split(/(?<=[.!?؟])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !isNonFactualSentence(sentence));
}

export function validateClaims(answer: string, chunks: RetrievedChunk[]): ClaimValidation[] {
  const unsupported = new Set(findUnsupportedClaims(answer, chunks));
  const evidence = chunks.map((chunk) => chunk.content).join("\n");
  return extractMaterialClaims(answer).map((claim) => ({
    claim,
    supported: !unsupported.has(claim),
    sourceIds: unsupported.has(claim)
      ? []
      : chunks
        .filter((chunk) => lexicalSimilarity(claim, chunk.content) >= 0.12)
        .map((chunk) => String(chunk.metadata.source_id || chunk.metadata.source_name || "unknown-source")),
  })).map((result) => ({
    ...result,
    sourceIds: result.sourceIds.length ? [...new Set(result.sourceIds)] : (result.supported && evidence ? ["evidence-present"] : []),
  }));
}

export function isConfirmedActionSuccess(result: unknown): result is { status: "success"; confirmed: true } {
  if (!result || typeof result !== "object") return false;
  const candidate = result as Record<string, unknown>;
  return candidate.status === "success" && candidate.confirmed === true;
}

export function createEscalationSummary(input: {
  objective: string;
  confirmedFacts?: string[];
  referenceNumbers?: string[];
  attemptedSteps?: string[];
  toolResults?: string[];
  unresolvedIssue: string;
}) {
  return [
    `User wants: ${input.objective}`,
    `Confirmed facts: ${input.confirmedFacts?.join("; ") || "None"}`,
    `Reference numbers: ${input.referenceNumbers?.join(", ") || "None"}`,
    `Troubleshooting/actions attempted: ${input.attemptedSteps?.join("; ") || "None"}`,
    `Tool results: ${input.toolResults?.join("; ") || "None"}`,
    `Unresolved issue: ${input.unresolvedIssue}`,
  ].join("\n");
}
