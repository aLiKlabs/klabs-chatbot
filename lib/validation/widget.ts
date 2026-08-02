import { z } from "zod";

const publicKey = z.string().regex(/^[a-f0-9]{36}$/i, "Invalid chatbot key.");
const historyMessage = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2_000) });

export const publicChatSchema = z.object({
  publicKey,
  message: z.string().trim().min(1).max(2_000),
  sessionId: z.string().uuid(),
  pageUrl: z.string().url().max(2_048),
  language: z.enum(["en", "ar"]).optional(),
  history: z.array(historyMessage).max(8).default([]),
});

export const feedbackSchema = z.object({
  publicKey,
  sessionId: z.string().uuid(),
  messageId: z.string().uuid(),
  rating: z.enum(["positive", "negative"]),
});

export const leadSchema = z.object({
  publicKey,
  sessionId: z.string().uuid(),
  name: z.string().trim().max(120).optional().default(""),
  email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  phone: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(1_000).optional().default(""),
  consent: z.boolean().default(false),
}).refine((value) => Boolean(value.email || value.phone), { message: "Enter an email address or telephone number." });
