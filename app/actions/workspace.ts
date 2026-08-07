"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/laravel/server";

export type WorkspaceSettingsState = { error?: string; success?: string; fieldErrors?: Record<string, string[]> };

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Keep the name under 80 characters."),
});

export async function updateWorkspaceProfile(_previousState: WorkspaceSettingsState, formData: FormData): Promise<WorkspaceSettingsState> {
  const administrator = await requireAdministrator();
  const parsed = profileSchema.safeParse({ fullName: String(formData.get("fullName") || "") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const { error } = await (await createClient()).from("profiles").update({ full_name: parsed.data.fullName }).eq("id", administrator.id);
  if (error) return { error: "Your workspace profile could not be updated." };

  revalidatePath("/", "layout");
  return { success: "Workspace profile saved." };
}
