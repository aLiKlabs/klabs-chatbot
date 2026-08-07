import { z } from "zod";

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2_000),
});

export const adminChatRequestSchema = z.object({
  message: z.string().trim().min(2, "Enter a question.").max(2_000),
  sessionId: z.string().uuid(),
  language: z.enum(["en", "ar"]).optional(),
  history: z.array(historyMessageSchema).max(8).default([]),
});

export type ChatHistoryMessage = z.infer<typeof historyMessageSchema>;
