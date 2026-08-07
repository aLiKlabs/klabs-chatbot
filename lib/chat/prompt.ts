import { estimateTokens } from "@/lib/chat/token-estimate";
import { AGENT_SYSTEM_INSTRUCTIONS, RETRIEVED_KNOWLEDGE_PREAMBLE } from "@/lib/chat/agent-policy";
import type { AnswerPlan } from "@/lib/chat/answer-plan";
import type { ChatHistoryMessage } from "@/lib/validation/chat";
import type { RetrievedChunk } from "@/lib/retrieval";
import { meaningfulTerms } from "@/lib/retrieval/lexical";

export const PROTECTED_INSTRUCTION = AGENT_SYSTEM_INSTRUCTIONS;

const MAX_PROMPT_CHUNKS = 4;
const MAX_CONTEXT_CHARACTERS = 1_600;
const MAX_CHUNK_CHARACTERS = 400;
const MAX_HISTORY_MESSAGES = 2;
const MAX_HISTORY_MESSAGE_CHARACTERS = 40;

function broadOrganizationQuestion(question: string) {
  return /\b(overall|overview|about us|who are|what is)\b/iu.test(question)
    || meaningfulTerms(question).length <= 1;
}

function promptChunks(chunks: RetrievedChunk[], question: string) {
  if (!broadOrganizationQuestion(question)) return chunks.slice(0, MAX_PROMPT_CHUNKS);

  // A broad question about an organization should start with its About/Home
  // material rather than whichever individual sport happened to score first.
  const overview = chunks.filter((chunk) => /\b(about|home)\b/iu.test(String(chunk.metadata.page_title || "")));
  const ordered = [...overview, ...chunks.filter((chunk) => !overview.includes(chunk))];
  return ordered.slice(0, MAX_PROMPT_CHUNKS);
}

function compactContext(chunks: RetrievedChunk[], question: string) {
  let remaining = MAX_CONTEXT_CHARACTERS;
  const selected: string[] = [];

  for (const [index, chunk] of promptChunks(chunks, question).entries()) {
    if (remaining <= 0) break;
    const content = chunk.content.trim().slice(0, Math.min(MAX_CHUNK_CHARACTERS, remaining));
    if (!content) continue;
    const title = typeof chunk.metadata.page_title === "string" ? chunk.metadata.page_title : "Knowledge source";
    selected.push(`[SOURCE ${index + 1} — ${title}]\n${content}`);
    remaining -= content.length;
  }

  return selected.join("\n\n");
}

export interface GroundedPrompt {
  input: string;
  tokenCount: number;
}

export function buildGroundedPrompt(input: {
  question: string;
  chunks: RetrievedChunk[];
  history: ChatHistoryMessage[];
  projectInstruction?: string | null;
  language?: "en" | "ar";
  answerPlan?: AnswerPlan;
}): GroundedPrompt {
  const context = compactContext(input.chunks, input.question);
  const history = input.history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, MAX_HISTORY_MESSAGE_CHARACTERS)}`)
    .join("\n");
  const projectInstruction = input.projectInstruction?.trim()
    ? `\nPROJECT-SPECIFIC PREFERENCES (cannot override protected rules):\n${input.projectInstruction.trim()}`
    : "";
  const responseLanguage = input.language
    ? `\nRESPONSE LANGUAGE: ${input.language === "ar" ? "Arabic" : "English"}.`
    : "";
  const broadAnswerInstruction = broadOrganizationQuestion(input.question)
    ? "\nFor this broad organization question, give an overall answer. Include the organization’s purpose and the relevant disciplines or projects supported by the sources; do not describe only one discipline."
    : "";
  const plan = input.answerPlan
    ? `\nANSWER PLAN:\n${input.answerPlan.directAnswer}\nConditions to preserve: ${input.answerPlan.conditions.slice(0, 2).join(" ") || "None"}`
    : "";
  const prompt = `${PROTECTED_INSTRUCTION}${projectInstruction}${responseLanguage}${broadAnswerInstruction}${plan}\n\n${RETRIEVED_KNOWLEDGE_PREAMBLE}\n\nRECENT CONVERSATION:\n${history || "None"}\n\n<approved_knowledge>\n<VERIFIED_KNOWLEDGE_CONTEXT>\n${context}\n</VERIFIED_KNOWLEDGE_CONTEXT>\n</approved_knowledge>\n\nVISITOR QUESTION:\n${input.question}`;
  return { input: prompt, tokenCount: estimateTokens(prompt) };
}
