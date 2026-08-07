import type { LaravelClient } from "@/lib/laravel/client";

export const MAX_CONSECUTIVE_GENERAL_TURNS = 3;
export const GENERAL_CONVERSATION_MODEL = "general-conversation";
export const GENERAL_LIMIT_FALLBACK_MODEL = "general-limit-fallback";

export function hasCompanyLocationRestriction(value: unknown) {
  return Array.isArray(value) && value.some((topic) =>
    typeof topic === "string" && /^(company[_ -]?location|office[_ -]?location|company address)$/iu.test(topic.trim()),
  );
}

export function isRestrictedCompanyLocationQuestion(message: string) {
  const normalized = message.toLocaleLowerCase().trim();
  const englishCompany = /\b(k-?labs?|company|business|you|your|office|headquarters)\b/u.test(normalized);
  const englishLocation = /\b(where|location|located|based|address|headquarters|office)\b/u.test(normalized);
  const arabicCompany = /(كلابس|كي\s*لابس|الشركة|شركتكم|مكانكم|موقعكم|عنوانكم|وينكم)/u.test(normalized);
  const arabicLocation = /(وين|أين|اين|مكان|موقع|عنوان|مقر|مكتب)/u.test(normalized);
  return (englishCompany && englishLocation) || (arabicCompany && arabicLocation);
}

export function isLikelyBusinessQuestion(message: string) {
  const normalized = message.toLocaleLowerCase();
  return /\b(k-?labs?|company|business|service|services|product|products|price|pricing|cost|contact|phone|number|email|address|location|located|based|headquarters|hours|policy|website|app|apps|development|design|founder|founded|team)\b/u.test(normalized)
    || /(كلابس|الشركة|شركتكم|خدمات|خدمة|منتج|منتجات|سعر|اسعار|أسعار|تكلفة|تواصل|رقم|هاتف|ايميل|إيميل|بريد|عنوان|موقع|دوام|سياسة|تطبيق|تطبيقات|برمجة|تصميم)/u.test(normalized);
}

export function isClearlyOffTopicKnowledgeRequest(message: string) {
  const normalized = message.toLocaleLowerCase().trim();
  // "Tell me about …" and "explain …" are common ways visitors ask about a
  // page in the project's own knowledge base. They are not evidence that the
  // topic is external, so allow retrieval to decide whether we have a source.
  return /\b(compare|comparison|difference between|country|countries|politics|political|economy|economic|travel|tourism|weather|capital|population|war|iran|iraq|saudi arabia|qatar|kuwait|oman|uae|united arab emirates)\b/u.test(normalized)
    || /(قارن|مقارنة|الفرق بين|اشرح|دولة|دول|سياسة|سياسي|اقتصاد|سفر|سياحة|طقس|عاصمة|سكان|حرب|إيران|ايران|العراق|السعودية|قطر|الكويت|عمان|الإمارات|الامارات)/u.test(normalized);
}

export async function countConsecutiveGeneralTurns(
  client: LaravelClient,
  conversationId: string | undefined,
) {
  if (!conversationId) return 0;
  const { data, error } = await client
    .from("messages")
    .select("model")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(MAX_CONSECUTIVE_GENERAL_TURNS + 1);
  if (error) throw error;

  let count = 0;
  for (const row of data || []) {
    if (![GENERAL_CONVERSATION_MODEL, GENERAL_LIMIT_FALLBACK_MODEL].includes(row.model as string)) break;
    count += 1;
  }
  return count;
}
