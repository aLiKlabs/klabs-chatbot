import { describe, expect, it } from "vitest";
import { createAnswerPlan, evaluateEvidence } from "@/lib/chat/answer-plan";
import { understandQuestion } from "@/lib/chat/question";
import { deduplicateCandidates, expandNeighborChunks, normalizedQueries } from "@/lib/retrieval";
import type { RetrievedChunk } from "@/lib/retrieval";

function chunk(content: string, metadata: Record<string, unknown> = {}, similarity = 0.8): RetrievedChunk {
  return { content, metadata, similarity };
}

describe("staged knowledge answering", () => {
  it("extracts intent, preserves identifiers, and generates focused queries", () => {
    const result = understandQuestion("Can I return model HX-200 after opening it?", []);
    expect(result.intent).toBe("policy");
    expect(result.entities.identifiers).toContain("HX-200");
    expect(result.searchQueries.length).toBeLessThanOrEqual(4);
    expect(result.searchQueries.some((query) => query.includes("HX-200"))).toBe(true);
  });

  it("resolves a follow-up from confirmed recent conversation", () => {
    const result = understandQuestion("Does it include international delivery?", [
      { role: "user", content: "Tell me about the Premium Plan." },
      { role: "assistant", content: "The Premium Plan is listed in the approved knowledge." },
    ]);
    expect(result.intent).toBe("follow-up");
    expect(result.resolvedQuestion).toContain("Premium Plan");
    expect(result.needsClarification).toBe(false);
  });

  it("uses the assistant's named subject for a pronoun follow-up", () => {
    const result = understandQuestion("What do they do?", [
      { role: "user", content: "Tell me about the whole organization." },
      { role: "assistant", content: "Victorious Bahrain is a multi-sport organization supporting athlete development." },
    ]);
    expect(result.resolvedQuestion).toContain("Victorious Bahrain");
    expect(result.resolvedQuestion).toContain("What do they do?");
  });

  it("keeps a possessive-pronoun follow-up on the current team", () => {
    const result = understandQuestion("Who's their leader?", [
      { role: "user", content: "Tell me about the karting team." },
      { role: "assistant", content: "Victorious Motorsport is a Bahraini racing team that develops drivers through karting." },
    ]);
    expect(result.intent).toBe("follow-up");
    expect(result.resolvedQuestion).toContain("Victorious Motorsport");
    expect(result.resolvedQuestion).toContain("Who's their leader?");
  });

  it("keeps Bahraini Arabic follow-ups on the named organization", () => {
    const result = understandQuestion("انزين شنو عندهم افرقة؟", [
      { role: "user", content: "خبرني عن فيكتوريوس" },
      { role: "assistant", content: "Victorious Bahrain is a multi-sport organization." },
    ]);
    expect(result.intent).toBe("follow-up");
    expect(result.resolvedQuestion).toContain("Victorious Bahrain");
  });

  it("asks for the minimum missing reference instead of guessing", () => {
    const result = understandQuestion("Can I return it?", []);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("product");
  });

  it("keeps query variants bounded and deduplicated", () => {
    expect(normalizedQueries(["Return policy", " Return policy ", "opened item"])).toEqual(["Return policy", "opened item"]);
  });

  it("deduplicates near-identical passages while preserving exceptions", () => {
    const duplicateA = chunk("Standard delivery takes three to five business days.", { source_id: "a" }, 0.9);
    const duplicateB = chunk("Standard delivery takes three to five business days.", { source_id: "b" }, 0.8);
    const exception = chunk("Standard delivery takes three to five business days unless the order is oversized.", { source_id: "c" }, 0.7);
    expect(deduplicateCandidates([duplicateA, duplicateB, exception])).toHaveLength(2);
  });

  it("expands a selected passage with adjacent context when available", () => {
    const selected = chunk("These products are excluded.", { source_id: "policy", source_page_id: "page", chunk_index: 2 }, 0.9);
    const previous = chunk("Opened hygiene products and personalized products", { source_id: "policy", source_page_id: "page", chunk_index: 1 }, 0.4);
    const next = chunk("Defective items follow a separate process.", { source_id: "policy", source_page_id: "page", chunk_index: 3 }, 0.3);
    expect(expandNeighborChunks([selected], [selected, previous, next], 3)).toHaveLength(3);
  });

  it("marks related but incomplete evidence as insufficient", () => {
    const understanding = understandQuestion("Can opened headphones be returned?", []);
    const evaluation = evaluateEvidence(understanding, [chunk("Most unused products can be returned within 30 days.")]);
    expect(evaluation.evidenceStrength).toBe("low");
    expect(evaluation.answerable).toBe(false);
  });

  it("creates an answer plan that retains conditions and source coverage", () => {
    const understanding = understandQuestion("Can opened headphones be returned?", []);
    const evidence = [chunk("Opened headphones are excluded unless defective.", { source_id: "returns-policy" })];
    const evaluation = evaluateEvidence(understanding, evidence);
    const plan = createAnswerPlan(understanding, evidence, evaluation);
    expect(plan.conditions[0]).toContain("unless defective");
    expect(plan.sourceIds).toContain("returns-policy");
  });
});
