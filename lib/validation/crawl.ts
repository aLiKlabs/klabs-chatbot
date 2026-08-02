import { z } from "zod";

const websiteUrl = z.string().trim().min(4).max(2_048);

export const crawlPreviewSchema = z.object({
  url: websiteUrl,
  maxPages: z.number().int().min(1).max(25).default(20),
});

export const crawlImportSchema = z.object({
  url: websiteUrl,
  selectedUrls: z.array(z.string().url().max(2_048)).min(1).max(25),
});
