import { getOpenAIEnvironment } from "@/lib/env";
import { getOpenAIClient } from "@/lib/openai/client";

export async function createGroundedResponse(prompt: string) {
  const environment = getOpenAIEnvironment();
  const maximumOutputTokens = Math.min(
    Math.max(Number(process.env.DEFAULT_MAX_OUTPUT_TOKENS) || 600, 80),
    2_000,
  );
  const response = await getOpenAIClient().responses.create({
    model: environment.OPENAI_CHAT_MODEL,
    input: prompt,
    max_output_tokens: maximumOutputTokens,
  });
  const inputDetails = response.usage?.input_tokens_details as
    | { cached_tokens?: number; cache_write_tokens?: number }
    | undefined;
  return {
    text: response.output_text.trim(),
    model: environment.OPENAI_CHAT_MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cachedInputTokens: inputDetails?.cached_tokens ?? 0,
    cacheWriteTokens: inputDetails?.cache_write_tokens ?? 0,
  };
}
