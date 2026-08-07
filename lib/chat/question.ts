import type { ChatHistoryMessage } from "@/lib/validation/chat";
import { meaningfulTerms } from "@/lib/retrieval/lexical";

export type QuestionIntent =
  | "greeting"
  | "general"
  | "knowledge"
  | "policy"
  | "product"
  | "troubleshooting"
  | "comparison"
  | "follow-up"
  | "action"
  | "account"
  | "human-support"
  | "unsupported"
  | "ambiguous";

export interface QuestionUnderstanding {
  intent: QuestionIntent;
  subquestions: string[];
  resolvedQuestion: string;
  searchQueries: string[];
  entities: {
    identifiers: string[];
    dates: string[];
    quotedPhrases: string[];
  };
  requiresKnowledge: boolean;
  requiresTool: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const BUSINESS_TERMS = /\b(price|pricing|product|service|policy|return|refund|delivery|hours?|location|address|eligib|membership|plan|promotion|availability|warranty|contact|phone|email|order|account|website|app|support|procedure|how do i|can i)\b/iu;
const ARABIC_BUSINESS_TERMS = /(سعر|أسعار|خدمة|خدمات|منتج|سياسة|استرجاع|استرداد|توصيل|دوام|موقع|عنوان|عضوية|خطة|عرض|متوفر|ضمان|تواصل|رقم|ايميل|طلب|حساب|دعم|كيف|هل يمكن)/u;
const ACTION_TERMS = /\b(cancel|book|reserve|purchase|buy|refund my|update my|delete my|submit|send|change my)\b/iu;
const ACCOUNT_TERMS = /\b(my order|my account|my balance|order status|subscription status|account balance|login|password)\b/iu;
const TROUBLESHOOTING_TERMS = /\b(error|failed|failure|not working|can't|cannot|unable|issue|problem|bug|timeout|error code)\b/iu;
const POLICY_TERMS = /\b(return|refund|delivery|privacy|terms|warranty|eligib|cancell?ation|policy|membership)\b/iu;
const PRODUCT_TERMS = /\b(product|service|plan|package|model|version|feature|headphones|app)\b/iu;
const HUMAN_TERMS = /\b(human|agent|representative|person|call me|speak to someone)\b/iu;

function normalize(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function splitSubquestions(message: string) {
  const pieces = message
    .split(/\?+/u)
    .flatMap((piece) => piece.split(/\s+and\s+(?=(?:can|what|how|does|is|are|do|will|where|when)\b)/iu))
    .map(normalize)
    .filter(Boolean);
  return pieces.length > 1 ? pieces : [normalize(message)];
}

function extractEntities(message: string) {
  return {
    identifiers: [...new Set(message.match(/\b(?:[A-Z]{2,}[\w-]*\d[\w-]*|\d{3,})\b/gu) || [])],
    dates: [...new Set(message.match(/\b(?:today|tomorrow|yesterday|next week|last week|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/giu) || [])],
    quotedPhrases: [...new Set([...message.matchAll(/["“”']([^"“”']+)["“”']/gu)].map((match) => match[1]))],
  };
}

function resolveReference(message: string, history: ChatHistoryMessage[]) {
  const reference = /\b(?:it|its|that|this|they|their|them)\b/iu.test(message)
    || /(عندهم|عندها|فريقهم|فرقهم|عنهم|عنها|هذ[اا]|هذي|هذولا)/u.test(message)
    || /^(?:the first|the second|does it|what about|and what about|شنو عندهم|وش عندهم)/iu.test(message.trim());
  if (!reference) return { question: message, ambiguous: false };
  const priorUser = [...history].reverse().find((item) => item.role === "user" && item.content.trim());
  const priorAssistant = [...history].reverse().find((item) => item.role === "assistant" && item.content.trim());
  const hasExplicitEntity = /\b(?:product|item|order|plan|service|model|version|headphones|phone|app)\b/iu.test(message)
    || /\b[A-Z]{2,}[\w-]*\d[\w-]*\b/u.test(message);
  if (!priorUser && !priorAssistant && !hasExplicitEntity) return { question: message, ambiguous: true };
  if (!priorUser && !priorAssistant) return { question: message, ambiguous: false };

  // The assistant normally names the entity a visitor refers to with “they”,
  // “it”, or “that”. Prefer it over vague user wording such as “the whole
  // organization”, so the follow-up retrieves the same subject.
  const context = priorAssistant?.content.trim() || priorUser?.content.trim();
  return { question: `${context} — follow-up: ${message.trim()}`, ambiguous: false };
}

function classify(message: string, resolved: string): QuestionIntent {
  const value = message.toLocaleLowerCase().trim();
  if (/^(hi|hello|hey|thanks|thank you|bye|goodbye|ok|okay)\b/iu.test(value) && !BUSINESS_TERMS.test(value)) return "greeting";
  if (HUMAN_TERMS.test(value)) return "human-support";
  if (ACTION_TERMS.test(value)) return "action";
  if (ACCOUNT_TERMS.test(value)) return "account";
  if (TROUBLESHOOTING_TERMS.test(value)) return "troubleshooting";
  if (resolved !== message) return "follow-up";
  if (/\b(compare|comparison|versus|vs|difference)\b/iu.test(value) || /قارن|مقارنة|الفرق/u.test(value)) return "comparison";
  if (POLICY_TERMS.test(value) || /سياسة|استرجاع|استرداد|توصيل/u.test(value)) return "policy";
  if (PRODUCT_TERMS.test(value) || /منتج|خدمة|خطة/u.test(value)) return "product";
  if (BUSINESS_TERMS.test(value) || ARABIC_BUSINESS_TERMS.test(value)) return "knowledge";
  return "general";
}

export function understandQuestion(message: string, history: ChatHistoryMessage[] = []): QuestionUnderstanding {
  const normalizedMessage = normalize(message);
  const resolved = resolveReference(normalizedMessage, history);
  const subquestions = splitSubquestions(resolved.question);
  const entities = extractEntities(resolved.question);
  const intent = resolved.ambiguous ? "ambiguous" : classify(normalizedMessage, resolved.question);
  const requiresTool = intent === "action" || intent === "account";
  const requiresKnowledge = intent !== "greeting" && intent !== "general" && intent !== "ambiguous";
  const keywords = meaningfulTerms(resolved.question).slice(0, 16).join(" ");
  const searchQueries = [...new Set([
    normalizedMessage,
    resolved.question,
    keywords,
    entities.quotedPhrases.join(" "),
  ].map(normalize).filter((query) => query.length > 2))].slice(0, 4);

  return {
    intent,
    subquestions,
    resolvedQuestion: resolved.question,
    searchQueries,
    entities,
    requiresKnowledge,
    requiresTool,
    needsClarification: resolved.ambiguous,
    clarificationQuestion: resolved.ambiguous
      ? "To make sure I answer the right question, what product, order, or policy are you referring to?"
      : undefined,
  };
}
