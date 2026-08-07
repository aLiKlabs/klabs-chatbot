import { describe, expect, it } from "vitest";
import {
  GENERAL_CONVERSATION_MODEL,
  GENERAL_LIMIT_FALLBACK_MODEL,
  hasCompanyLocationRestriction,
  isClearlyOffTopicKnowledgeRequest,
  isLikelyBusinessQuestion,
  isRestrictedCompanyLocationQuestion,
  MAX_CONSECUTIVE_GENERAL_TURNS,
} from "@/lib/chat/general-conversation";

describe("bounded general conversation", () => {
  it("keeps business questions on the grounded path", () => {
    expect(isLikelyBusinessQuestion("What services does K-Labs provide?")).toBe(true);
    expect(isLikelyBusinessQuestion("شنو رقمكم؟")).toBe(true);
    expect(isLikelyBusinessQuestion("Tell me a joke")).toBe(false);
  });

  it("blocks unrelated comparisons before knowledge retrieval", () => {
    expect(isClearlyOffTopicKnowledgeRequest("Compare Bahrain and Iran")).toBe(true);
    expect(isClearlyOffTopicKnowledgeRequest("Iran?")).toBe(true);
    expect(isClearlyOffTopicKnowledgeRequest("قارن بين البحرين وإيران")).toBe(true);
    expect(isClearlyOffTopicKnowledgeRequest("What services does K-Labs provide?")).toBe(false);
    expect(isClearlyOffTopicKnowledgeRequest("Tell me about karting")).toBe(false);
    expect(isClearlyOffTopicKnowledgeRequest("Explain Bahrain Victorious")).toBe(false);
  });

  it("blocks company-location questions in English and Arabic", () => {
    expect(hasCompanyLocationRestriction(["company_location"])).toBe(true);
    expect(hasCompanyLocationRestriction(["politics"])).toBe(false);
    expect(isRestrictedCompanyLocationQuestion("Where is K-Labs based?")).toBe(true);
    expect(isRestrictedCompanyLocationQuestion("What is your office address?")).toBe(true);
    expect(isRestrictedCompanyLocationQuestion("وين مكانكم؟")).toBe(true);
    expect(isRestrictedCompanyLocationQuestion("موقع شركة كي لابس؟")).toBe(true);
    expect(isRestrictedCompanyLocationQuestion("What services does K-Labs provide?")).toBe(false);
  });

  it("uses a clearly bounded general-chat policy", () => {
    expect(GENERAL_CONVERSATION_MODEL).toBe("general-conversation");
    expect(GENERAL_LIMIT_FALLBACK_MODEL).toBe("general-limit-fallback");
    expect(MAX_CONSECUTIVE_GENERAL_TURNS).toBe(3);
  });
});
