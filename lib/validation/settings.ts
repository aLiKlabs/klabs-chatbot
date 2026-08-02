import { z } from "zod";

const optionalUrl = z.union([z.literal(""), z.string().url().max(2_048)]);
const optionalEmail = z.union([z.literal(""), z.string().email().max(254)]);
const optionalPhone = z.string().trim().max(40);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const appearanceSchema = z.object({
  botName: z.string().trim().min(2).max(80),
  welcomeEn: z.string().trim().min(2).max(1_000),
  welcomeAr: z.string().trim().max(1_000),
  placeholderEn: z.string().trim().min(2).max(120),
  placeholderAr: z.string().trim().max(120),
  primaryColor: color,
  secondaryColor: color,
  textColor: color,
  launcherPosition: z.enum(["bottom-left", "bottom-right"]),
  launcherIcon: z.enum(["message", "bot"]),
  logoUrl: optionalUrl,
  avatarUrl: optionalUrl,
  borderRadius: z.coerce.number().int().min(0).max(32),
  showBranding: z.boolean(),
  collectLeads: z.boolean(),
  requireLeadConsent: z.boolean(),
  suggestedEn: z.string().max(2_000),
  suggestedAr: z.string().max(2_000),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  whatsappNumber: optionalPhone,
  contactPageUrl: optionalUrl,
  contactLabelEn: z.string().trim().min(2).max(100),
  contactLabelAr: z.string().trim().max(100),
  privacyUrl: optionalUrl,
  termsUrl: optionalUrl,
});

export const instructionsSchema = z.object({
  systemInstruction: z.string().trim().max(10_000),
  tone: z.string().trim().min(2).max(80),
  answerLength: z.enum(["concise", "balanced", "detailed"]),
  fallbackEn: z.string().trim().min(5).max(1_000),
  fallbackAr: z.string().trim().max(1_000),
  restrictedTopics: z.string().max(3_000),
  citationMode: z.boolean(),
  languageBehavior: z.enum(["match_visitor", "project_default"]),
  contactEscalation: z.boolean(),
});

export const domainSchema = z.object({
  domain: z.string().trim().min(3).max(253).transform((value) => {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  }),
});
