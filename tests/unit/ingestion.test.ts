// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTextChunks, countTokens } from "@/lib/ingestion/chunk";
import { cleanExtractedText } from "@/lib/ingestion/clean";
import { detectDocumentType } from "@/lib/ingestion/extract";
import { createContentHash } from "@/lib/ingestion/hash";
import { safeStorageFilename, uploadRequestSchema } from "@/lib/validation/knowledge";

describe("knowledge ingestion", () => {
  it("normalizes unsafe control characters and repeated whitespace", () => {
    expect(cleanExtractedText("  Hello\u0000   world\r\n\r\n\r\nNext  ")).toBe(
      "Hello world\n\nNext",
    );
  });

  it("creates deterministic hashes", () => {
    expect(createContentHash("same content")).toBe(createContentHash("same content"));
    expect(createContentHash("same content")).not.toBe(createContentHash("different content"));
  });

  it("creates bounded, non-empty, deduplicated chunks", () => {
    const paragraph = "K-Labs provides verified website information to customers. ".repeat(80);
    const chunks = createTextChunks(paragraph, {
      targetTokens: 80,
      maximumTokens: 110,
      overlapTokens: 15,
      minimumTokens: 10,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map(({ contentHash }) => contentHash)).size).toBe(chunks.length);
    expect(chunks.every(({ content, tokenCount }) => content && tokenCount === countTokens(content))).toBe(true);
    expect(chunks.every(({ tokenCount }) => tokenCount <= 110)).toBe(true);
  });

  it("validates supported filename and MIME combinations", () => {
    expect(detectDocumentType("guide.pdf", "application/pdf")).toBe("pdf");
    expect(detectDocumentType("guide.md", "text/markdown")).toBe("markdown");
    expect(() => detectDocumentType("payload.pdf", "text/plain")).toThrow(/supported/i);
    expect(uploadRequestSchema.safeParse({ filename: "guide.pdf", mimeType: "application/pdf", size: 21 * 1024 * 1024 }).success).toBe(false);
  });

  it("sanitizes storage filenames without changing their extension", () => {
    expect(safeStorageFilename("../../Client Guide (Final).PDF")).toBe("Client-Guide-Final.pdf");
  });
});
