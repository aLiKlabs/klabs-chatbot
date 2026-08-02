import OpenAI from "openai";
import { getOpenAIEnvironment } from "@/lib/env";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const environment = getOpenAIEnvironment();
    client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
  }
  return client;
}
