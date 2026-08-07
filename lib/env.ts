import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  LARAVEL_API_URL: z.string().url().default("http://127.0.0.1:8000"),
  LARAVEL_INTERNAL_KEY: z.string().min(32),
  ADMIN_ALLOWED_EMAILS: z.string().default(""),
});

const openAIEnvironmentSchema = z.object({
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_CHAT_MODEL: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().min(1),
  OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().max(4096),
  MOCK_EMBEDDINGS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type OpenAIEnvironment = z.infer<typeof openAIEnvironmentSchema>;

export function getPublicEnvironment(): PublicEnvironment {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    ...getPublicEnvironment(),
    LARAVEL_API_URL: process.env.LARAVEL_API_URL,
    LARAVEL_INTERNAL_KEY: process.env.LARAVEL_INTERNAL_KEY,
    ADMIN_ALLOWED_EMAILS: process.env.ADMIN_ALLOWED_EMAILS,
  });
}

export function getOpenAIEnvironment(): OpenAIEnvironment {
  const environment = openAIEnvironmentSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    OPENAI_EMBEDDING_DIMENSIONS: process.env.OPENAI_EMBEDDING_DIMENSIONS,
    MOCK_EMBEDDINGS: process.env.MOCK_EMBEDDINGS,
  });

  if (environment.MOCK_EMBEDDINGS && process.env.VERCEL_ENV === "production") {
    throw new Error("Mock embeddings are disabled in production deployments.");
  }
  return environment;
}

export function isAllowedAdministrator(email: string | undefined): boolean {
  if (!email) return false;

  const allowlist = (process.env.ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.toLowerCase());
}
