import { describe, expect, it } from "vitest";
import { consumeWidgetRateLimit } from "@/lib/rate-limit/widget";
import { appearanceSchema, domainSchema } from "@/lib/validation/settings";
import { publicChatSchema } from "@/lib/validation/widget";
import { isApprovedWidgetPage, localized } from "@/lib/widget/project";

describe("public widget boundaries", () => {
  it("allows only the project website and explicitly approved domains", () => {
    const domains = [{ domain: "staging.example.com" }];
    expect(isApprovedWidgetPage("https://www.example.com/about", "https://example.com", domains)).toBe(true);
    expect(isApprovedWidgetPage("https://staging.example.com/page", "https://example.com", domains)).toBe(true);
    expect(isApprovedWidgetPage("https://evil.example.net", "https://example.com", domains)).toBe(false);
    expect(isApprovedWidgetPage("javascript:alert(1)", "https://example.com", domains)).toBe(false);
  });

  it("selects localized values without leaking raw objects", () => {
    expect(localized({ en: "Hello", ar: "مرحباً" }, "ar", "Fallback")).toBe("مرحباً");
    expect(localized({ en: "Hello" }, "fr", "Fallback")).toBe("Hello");
  });

  it("validates public chat identifiers and the embedding page", () => {
    expect(publicChatSchema.safeParse({ publicKey: "a".repeat(36), message: "Hello", sessionId: crypto.randomUUID(), pageUrl: "https://example.com", history: [] }).success).toBe(true);
    expect(publicChatSchema.safeParse({ publicKey: "bad", message: "Hello", sessionId: "bad", pageUrl: "file:///etc/passwd" }).success).toBe(false);
  });

  it("normalizes approved domains", () => {
    expect(domainSchema.parse({ domain: "https://Staging.Example.com/path" }).domain).toBe("staging.example.com");
  });

  it("enforces an in-memory request window", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(consumeWidgetRateLimit(key, 2).allowed).toBe(true);
    expect(consumeWidgetRateLimit(key, 2).allowed).toBe(true);
    expect(consumeWidgetRateLimit(key, 2).allowed).toBe(false);
  });

  it("accepts a complete safe appearance payload", () => {
    expect(appearanceSchema.safeParse({
      botName: "Assistant", welcomeEn: "Hello", welcomeAr: "", placeholderEn: "Ask a question", placeholderAr: "",
      primaryColor: "#6758E8", secondaryColor: "#FFFFFF", textColor: "#172033", launcherPosition: "bottom-right", launcherIcon: "message",
      logoUrl: "", avatarUrl: "", borderRadius: 16, showBranding: true, collectLeads: false, requireLeadConsent: true, suggestedEn: "Question", suggestedAr: "",
      contactEmail: "", contactPhone: "", whatsappNumber: "", contactPageUrl: "", contactLabelEn: "Contact us", contactLabelAr: "",
      privacyUrl: "", termsUrl: "",
    }).success).toBe(true);
  });
});
