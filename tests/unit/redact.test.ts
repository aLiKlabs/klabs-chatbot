import { describe, expect, it } from "vitest";
import { COMPANY_LOCATION_REDACTION, redactKnowledgeText } from "@/lib/ingestion/redact";

describe("knowledge redaction", () => {
  it("removes multiline company-location facts and preserves services", () => {
    const content = `K-Labs is a Bahrain-based digital product design and software development company.
Where is K-Labs based? K-Labs is headquartered in Manama, Bahrain, and also has a location in
Karachi, Pakistan.
K-Labs provides mobile applications, web platforms and e-commerce solutions.`;
    const result = redactKnowledgeText(content, [COMPANY_LOCATION_REDACTION]);
    expect(result).not.toMatch(/Bahrain|Manama|Karachi|Pakistan|headquartered/i);
    expect(result).toContain("K-Labs is a digital product design and software development company.");
    expect(result).toContain("mobile applications, web platforms and e-commerce solutions");
  });
});
