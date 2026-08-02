import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
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
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    ...getPublicEnvironment(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
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
