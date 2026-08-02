import { describe, expect, it } from "vitest";
import { projectSchema, slugifyProjectName } from "@/lib/validation/projects";

describe("project validation", () => {
  it("normalizes a project name into a safe slug segment", () => {
    expect(slugifyProjectName("  K-Labs / Bahrain Website  ")).toBe(
      "k-labs-bahrain-website",
    );
  });

  it("accepts a bilingual HTTPS project", () => {
    const result = projectSchema.safeParse({
      name: "K-Labs Demo",
      websiteUrl: "https://example.test",
      defaultLanguage: "en",
      supportedLanguages: ["en", "ar"],
      timezone: "Asia/Bahrain",
      botName: "Website Assistant",
      welcomeMessage: "Hello! How can I help?",
      primaryColor: "#6758E8",
      contactEmail: "",
      whatsappNumber: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-HTTP website protocols", () => {
    const result = projectSchema.safeParse({
      name: "Unsafe project",
      websiteUrl: "file:///etc/passwd",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      timezone: "UTC",
      botName: "Assistant",
      welcomeMessage: "Hello there",
      primaryColor: "#6758E8",
      contactEmail: "",
      whatsappNumber: "",
    });

    expect(result.success).toBe(false);
  });
});
