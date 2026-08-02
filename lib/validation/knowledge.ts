import { z } from "zod";
import { MAX_DOCUMENT_BYTES, detectDocumentType } from "@/lib/ingestion/extract";

const sourceName = z.string().trim().min(2, "Enter a name.").max(140);
const sourceText = z.string().trim().min(30, "Add at least 30 characters.").max(500_000);

export const manualSourceSchema = z.object({
  projectId: z.string().uuid(),
  name: sourceName,
  content: sourceText,
});

export const faqSourceSchema = z.object({
  projectId: z.string().uuid(),
  question: z.string().trim().min(5, "Enter a complete question.").max(500),
  answer: z.string().trim().min(10, "Enter a complete answer.").max(20_000),
});

export const sourceIdSchema = z.object({
  projectId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

export const uploadRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(240),
    mimeType: z.string().trim().min(1).max(160),
    size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  })
  .superRefine((input, context) => {
    try {
      detectDocumentType(input.filename, input.mimeType);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Unsupported document.",
      });
    }
  });

export function safeStorageFilename(filename: string) {
  const extension = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  const base = filename
    .slice(0, extension ? -extension.length : undefined)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "document"}${extension}`;
}
