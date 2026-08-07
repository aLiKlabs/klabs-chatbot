import type { LaravelClient } from "@/lib/laravel/client";

export type LocalizedValue = Record<string, string>;

export function localized(value: unknown, language: string, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const entries = value as LocalizedValue;
  if (entries[language]?.trim()) return entries[language];
  // Do not put English copy into an RTL Arabic widget when the optional
  // Arabic field is empty. Use the supplied Arabic interface fallback.
  if (language === "ar") return fallback;
  return entries.en || Object.values(entries).find(Boolean) || fallback;
}

function comparableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export async function getPublicWidgetProject(supabase: LaravelClient, publicKey: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,public_key,website_url,status,default_language,supported_languages")
    .eq("public_key", publicKey)
    .eq("status", "active")
    .is("archived_at", null)
    .single();
  if (!project) return null;

  const [{ data: settings }, { data: instructions }, { data: domains }] = await Promise.all([
    supabase.from("chatbot_settings").select("*").eq("project_id", project.id).single(),
    supabase.from("chatbot_instructions").select("*").eq("project_id", project.id).single(),
    supabase.from("project_domains").select("domain").eq("project_id", project.id).eq("status", "active"),
  ]);
  if (!settings || !instructions) return null;
  return { project, settings, instructions, domains: domains || [] };
}

export function isApprovedWidgetPage(pageUrl: string | undefined, websiteUrl: string, domains: Array<{ domain: string }>) {
  if (!pageUrl) return false;
  try {
    const requested = new URL(pageUrl);
    if (!['http:', 'https:'].includes(requested.protocol)) return false;
    const websiteHost = comparableHost(new URL(websiteUrl).hostname);
    const approved = new Set([websiteHost, ...domains.map(({ domain }) => comparableHost(domain))]);
    return approved.has(comparableHost(requested.hostname));
  } catch {
    return false;
  }
}
