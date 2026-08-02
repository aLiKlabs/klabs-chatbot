"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "@/lib/auth";
import { cleanExtractedText } from "@/lib/ingestion/clean";
import { createContentHash } from "@/lib/ingestion/hash";
import { processKnowledgeSource } from "@/lib/ingestion/process";
import { createClient } from "@/lib/supabase/server";
import {
  faqSourceSchema,
  manualSourceSchema,
  sourceIdSchema,
} from "@/lib/validation/knowledge";

export type KnowledgeActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[]>;
};

async function insertTextSource(
  projectId: string,
  name: string,
  content: string,
  sourceType: "manual" | "faq",
) {
  const supabase = await createClient();
  const cleanText = cleanExtractedText(content);
  const { data: source, error: sourceError } = await supabase
    .from("knowledge_sources")
    .insert({
      project_id: projectId,
      source_type: sourceType,
      name,
      status: "pending",
      checksum: createContentHash(cleanText),
      metadata: { entered_in_dashboard: true },
    })
    .select("id")
    .single();
  if (sourceError || !source) throw new Error("The knowledge source could not be created.");

  const { error: pageError } = await supabase.from("source_pages").insert({
    project_id: projectId,
    knowledge_source_id: source.id,
    url: `${sourceType}://${source.id}`,
    title: name,
    raw_text: content,
    clean_text: cleanText,
    content_hash: createContentHash(cleanText),
  });
  if (pageError) {
    await supabase.from("knowledge_sources").delete().eq("id", source.id);
    throw new Error("The knowledge content could not be saved.");
  }
  await processKnowledgeSource(supabase, projectId, source.id);
}

export async function addManualSource(
  projectId: string,
  _state: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  await requireAdministrator();
  const parsed = manualSourceSchema.safeParse({
    projectId,
    name: formData.get("name"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await insertTextSource(projectId, parsed.data.name, parsed.data.content, "manual");
    revalidatePath(`/projects/${projectId}/knowledge`);
    return { success: "Text added and embedded successfully." };
  } catch (error) {
    revalidatePath(`/projects/${projectId}/knowledge`);
    return { error: error instanceof Error ? error.message : "Text processing failed." };
  }
}

export async function addFaqSource(
  projectId: string,
  _state: KnowledgeActionState,
  formData: FormData,
): Promise<KnowledgeActionState> {
  await requireAdministrator();
  const parsed = faqSourceSchema.safeParse({
    projectId,
    question: formData.get("question"),
    answer: formData.get("answer"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const { question, answer } = parsed.data;
    await insertTextSource(projectId, question, `Question: ${question}\n\nAnswer: ${answer}`, "faq");
    revalidatePath(`/projects/${projectId}/knowledge`);
    return { success: "FAQ added and embedded successfully." };
  } catch (error) {
    revalidatePath(`/projects/${projectId}/knowledge`);
    return { error: error instanceof Error ? error.message : "FAQ processing failed." };
  }
}

export async function reprocessSource(projectId: string, sourceId: string) {
  await requireAdministrator();
  try {
    const parsed = sourceIdSchema.parse({ projectId, sourceId });
    const supabase = await createClient();
    await processKnowledgeSource(supabase, parsed.projectId, parsed.sourceId);
    revalidatePath(`/projects/${projectId}/knowledge`);
    return {};
  } catch (error) {
    revalidatePath(`/projects/${projectId}/knowledge`);
    return { error: error instanceof Error ? error.message : "Reprocessing failed." };
  }
}

export async function setSourceEnabled(projectId: string, sourceId: string, enabled: boolean) {
  await requireAdministrator();
  const parsed = sourceIdSchema.parse({ projectId, sourceId });
  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_sources")
    .update({ status: enabled ? "ready" : "disabled", error_message: null })
    .eq("project_id", parsed.projectId)
    .eq("id", parsed.sourceId);
  if (error) return { error: "The source status could not be changed." };
  revalidatePath(`/projects/${projectId}/knowledge`);
  return {};
}

export async function deleteSource(projectId: string, sourceId: string) {
  await requireAdministrator();
  const parsed = sourceIdSchema.parse({ projectId, sourceId });
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("knowledge_sources")
    .select("storage_path")
    .eq("project_id", parsed.projectId)
    .eq("id", parsed.sourceId)
    .single();
  if (source?.storage_path) {
    await supabase.storage.from("chatbot-documents").remove([source.storage_path]);
  }
  const { error } = await supabase
    .from("knowledge_sources")
    .delete()
    .eq("project_id", parsed.projectId)
    .eq("id", parsed.sourceId);
  if (error) return { error: "The source could not be deleted." };
  revalidatePath(`/projects/${projectId}/knowledge`);
  return {};
}
