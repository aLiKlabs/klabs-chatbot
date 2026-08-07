export const COMPANY_LOCATION_REDACTION = "company_location";

export function knowledgeRedactionTopics(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.redacted_topics;
  return Array.isArray(value) ? value.filter((topic): topic is string => typeof topic === "string") : [];
}

export function redactCompanyLocation(text: string) {
  let redacted = text;
  const replacements: ReadonlyArray<readonly [RegExp, string]> = [
    [/Identity, locations, founder, contact and public description/giu, "Identity, founder, contact and public description"],
    [/team size, job openings and office details/giu, "team size and job openings"],
    [/\s+with a delivery\s+presence in Pakistan\./giu, "."],
    [/\bBahrain-based\s+/giu, ""],
    [/HEADQUARTERS\s+Manama,\s*Bahrain\s+\[S3\]\s*/giu, ""],
    [/LOCATIONS\s+Bahrain\s*\+\s*Pakistan\s+\[S1\]\[S3\]\s*/giu, ""],
    [/LinkedIn lists Manama as headquarters,\s*a Pakistan location and a founding\s+year of 2015\.\s*\[S3\]/giu, "LinkedIn lists a founding year of 2015. [S3]"],
    [/Bahrain office\s+Road 3803[\s\S]*?Verified public; normalized\s+punctuation\s*(?=LinkedIn K-Labs)/giu, ""],
    [/Where is K-Labs based\?\s*K-Labs is headquartered in Manama, Bahrain, and also has a location in\s*Karachi, Pakistan\.\s*/giu, ""],
    [/Does K-Labs work only in Bahrain\?[\s\S]*?serves global customers\.\s*/giu, ""],
    [/Where is the Bahrain office\?[\s\S]*?Where is the Pakistan office\?[\s\S]*?Pakistan\.\s*(?=Is K-Labs hiring\?)/giu, ""],
    [/Company identity, official services, verified locations, public contact details/giu, "Company identity, official services, public contact details"],
    [/founding year, headquarters, industry/giu, "founding year and industry"],
    [/contact\s+details and office locations/giu, "contact details"],
    [/Founded 2015, Manama headquarters,\s*Pakistan location, industry and listed\s*company-size range/giu, "Founded 2015, industry and listed company-size range"],
    [/office\/contact update/giu, "contact update"],
  ];
  for (const [pattern, replacement] of replacements) redacted = redacted.replace(pattern, replacement);
  return redacted.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function redactKnowledgeText(text: string, topics: readonly string[]) {
  return topics.includes(COMPANY_LOCATION_REDACTION) ? redactCompanyLocation(text) : text;
}
