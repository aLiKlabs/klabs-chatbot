import { z } from "zod";

const languageCode = z.string().trim().min(2).max(10);

export const projectSchema = z.object({
  name: z.string().trim().min(2, "Enter a project name.").max(100),
  websiteUrl: z
    .string()
    .trim()
    .url("Enter a valid website URL.")
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "Only HTTP and HTTPS URLs are allowed.",
    }),
  defaultLanguage: languageCode.default("en"),
  supportedLanguages: z.array(languageCode).min(1).max(10),
  timezone: z.string().trim().min(1).max(100).default("Asia/Bahrain"),
  botName: z.string().trim().min(2).max(80),
  welcomeMessage: z.string().trim().min(2).max(500),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour."),
  contactEmail: z.union([z.literal(""), z.string().email()]),
  whatsappNumber: z.string().trim().max(30),
});

export const updateProjectSchema = projectSchema.pick({
  name: true,
  websiteUrl: true,
  defaultLanguage: true,
  supportedLanguages: true,
  timezone: true,
});

export function slugifyProjectName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}
