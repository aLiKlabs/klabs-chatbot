"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appearanceSchema, domainSchema, instructionsSchema } from "@/lib/validation/settings";

export type SettingsActionState = { error?: string; success?: string; fieldErrors?: Record<string, string[]> };

function checkbox(formData: FormData, name: string) { return formData.get(name) === "on"; }
function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 8); }

export async function updateAppearance(projectId: string, _state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdministrator();
  const parsed = appearanceSchema.safeParse({
    botName: formData.get("botName"), welcomeEn: formData.get("welcomeEn"), welcomeAr: formData.get("welcomeAr"),
    placeholderEn: formData.get("placeholderEn"), placeholderAr: formData.get("placeholderAr"), primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"), textColor: formData.get("textColor"), launcherPosition: formData.get("launcherPosition"),
    launcherIcon: formData.get("launcherIcon"), logoUrl: formData.get("logoUrl"), avatarUrl: formData.get("avatarUrl"), borderRadius: formData.get("borderRadius"),
    showBranding: checkbox(formData, "showBranding"), collectLeads: checkbox(formData, "collectLeads"), requireLeadConsent: checkbox(formData, "requireLeadConsent"), suggestedEn: formData.get("suggestedEn"), suggestedAr: formData.get("suggestedAr"),
    contactEmail: formData.get("contactEmail"), contactPhone: formData.get("contactPhone"), whatsappNumber: formData.get("whatsappNumber"),
    contactPageUrl: formData.get("contactPageUrl"), contactLabelEn: formData.get("contactLabelEn"), contactLabelAr: formData.get("contactLabelAr"),
    privacyUrl: formData.get("privacyUrl"), termsUrl: formData.get("termsUrl"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const input = parsed.data;
  const { error } = await (await createClient()).from("chatbot_settings").update({
    bot_name: input.botName, welcome_message: { en: input.welcomeEn, ar: input.welcomeAr }, placeholder_text: { en: input.placeholderEn, ar: input.placeholderAr },
    primary_color: input.primaryColor, secondary_color: input.secondaryColor, text_color: input.textColor, launcher_position: input.launcherPosition,
    launcher_icon: input.launcherIcon, logo_url: input.logoUrl || null, avatar_url: input.avatarUrl || null, border_radius: input.borderRadius,
    show_branding: input.showBranding, collect_leads: input.collectLeads, require_lead_consent: input.requireLeadConsent, suggested_questions: { en: lines(input.suggestedEn), ar: lines(input.suggestedAr) }, contact_email: input.contactEmail || null,
    contact_phone: input.contactPhone || null, whatsapp_number: input.whatsappNumber || null, contact_page_url: input.contactPageUrl || null,
    contact_button_label: { en: input.contactLabelEn, ar: input.contactLabelAr }, privacy_url: input.privacyUrl || null, terms_url: input.termsUrl || null,
  }).eq("project_id", projectId);
  if (error) return { error: "Appearance settings could not be saved." };
  revalidatePath(`/projects/${projectId}/appearance`);
  return { success: "Appearance settings saved." };
}

export async function updateInstructions(projectId: string, _state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdministrator();
  const parsed = instructionsSchema.safeParse({
    systemInstruction: formData.get("systemInstruction"), tone: formData.get("tone"), answerLength: formData.get("answerLength"),
    fallbackEn: formData.get("fallbackEn"), fallbackAr: formData.get("fallbackAr"), restrictedTopics: formData.get("restrictedTopics"),
    citationMode: checkbox(formData, "citationMode"), languageBehavior: formData.get("languageBehavior"), contactEscalation: checkbox(formData, "contactEscalation"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const input = parsed.data;
  const { error } = await (await createClient()).from("chatbot_instructions").update({
    system_instruction: input.systemInstruction, tone: input.tone, answer_length: input.answerLength,
    fallback_message: { en: input.fallbackEn, ar: input.fallbackAr }, restricted_topics: lines(input.restrictedTopics),
    citation_mode: input.citationMode, language_behavior: input.languageBehavior, contact_escalation: input.contactEscalation,
  }).eq("project_id", projectId);
  if (error) return { error: "Chatbot instructions could not be saved." };
  revalidatePath(`/projects/${projectId}/instructions`);
  return { success: "Instructions saved." };
}

export async function addProjectDomain(projectId: string, _state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  await requireAdministrator();
  const parsed = domainSchema.safeParse({ domain: formData.get("domain") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Enter a valid domain." };
  const { error } = await (await createClient()).from("project_domains").upsert({ project_id: projectId, domain: parsed.data.domain, status: "active" }, { onConflict: "project_id,domain" });
  if (error) return { error: "The approved domain could not be added." };
  revalidatePath(`/projects/${projectId}/installation`);
  return { success: `${parsed.data.domain} is approved.` };
}

export async function removeProjectDomain(projectId: string, domainId: string) {
  await requireAdministrator();
  await (await createClient()).from("project_domains").delete().eq("project_id", projectId).eq("id", domainId);
  revalidatePath(`/projects/${projectId}/installation`);
}
