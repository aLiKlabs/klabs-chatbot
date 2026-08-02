"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  projectSchema,
  slugifyProjectName,
  updateProjectSchema,
} from "@/lib/validation/projects";
import type { ProjectStatus } from "@/types/database";

export type ProjectActionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function strings(formData: FormData) {
  const supportedLanguages = formData
    .getAll("supportedLanguages")
    .map(String)
    .filter(Boolean);

  return {
    name: String(formData.get("name") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    defaultLanguage: String(formData.get("defaultLanguage") ?? "en"),
    supportedLanguages,
    timezone: String(formData.get("timezone") ?? "Asia/Bahrain"),
    botName: String(formData.get("botName") ?? "Website Assistant"),
    welcomeMessage: String(
      formData.get("welcomeMessage") ?? "Hello! How can I help you today?",
    ),
    primaryColor: String(formData.get("primaryColor") ?? "#6758E8"),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    whatsappNumber: String(formData.get("whatsappNumber") ?? ""),
  };
}

export async function createProject(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const administrator = await requireAdministrator();
  const parsed = projectSchema.safeParse(strings(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;
  const supabase = await createClient();
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);
  const slug = `${slugifyProjectName(input.name) || "project"}-${uniqueSuffix}`;
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      slug,
      website_url: input.websiteUrl,
      default_language: input.defaultLanguage,
      supported_languages: input.supportedLanguages,
      timezone: input.timezone,
      created_by: administrator.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !project) {
    return { error: "The project could not be created. Please try again." };
  }

  const { error: settingsError } = await supabase
    .from("chatbot_settings")
    .update({
      bot_name: input.botName,
      welcome_message: { en: input.welcomeMessage },
      primary_color: input.primaryColor,
      contact_email: input.contactEmail || null,
      whatsapp_number: input.whatsappNumber || null,
    })
    .eq("project_id", project.id);

  if (settingsError) {
    return {
      error:
        "The project was created, but its initial appearance settings could not be saved.",
    };
  }

  try {
    await supabase.from("project_domains").upsert({
      project_id: project.id,
      domain: new URL(input.websiteUrl).hostname.toLowerCase(),
      status: "active",
    }, { onConflict: "project_id,domain" });
  } catch {
    // The primary project URL remains an implicit approved domain.
  }

  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}/overview`);
}

export async function updateProject(
  projectId: string,
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  await requireAdministrator();
  const parsed = updateProjectSchema.safeParse(strings(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const input = parsed.data;
  const { error } = await supabase
    .from("projects")
    .update({
      name: input.name,
      website_url: input.websiteUrl,
      default_language: input.defaultLanguage,
      supported_languages: input.supportedLanguages,
      timezone: input.timezone,
    })
    .eq("id", projectId);

  if (error) return { error: "The project could not be updated." };
  try {
    await supabase.from("project_domains").upsert({ project_id: projectId, domain: new URL(input.websiteUrl).hostname.toLowerCase(), status: "active" }, { onConflict: "project_id,domain" });
  } catch {
    // The primary project URL remains an implicit approved domain.
  }
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}/overview`);
  return {};
}

export async function setProjectStatus(projectId: string, status: ProjectStatus) {
  await requireAdministrator();
  const allowedStatuses: ProjectStatus[] = ["draft", "active", "paused", "archived"];
  if (!allowedStatuses.includes(status)) throw new Error("Invalid project status");

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", projectId);

  if (error) throw new Error("Project status could not be updated");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}/overview`);
}
