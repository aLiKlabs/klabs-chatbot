import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeStorageFilename, uploadRequestSchema } from "@/lib/validation/knowledge";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  await requireAdministrator();
  const { projectId } = await context.params;
  const parsed = uploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid upload." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const sourceId = crypto.randomUUID();
  const filename = safeStorageFilename(parsed.data.filename);
  const path = `${projectId}/${sourceId}/${filename}`;
  const type = filename.endsWith(".pdf") ? "pdf" : filename.endsWith(".docx") ? "docx" : "text";
  const { error: sourceError } = await supabase.from("knowledge_sources").insert({
    id: sourceId,
    project_id: projectId,
    source_type: type,
    name: parsed.data.filename,
    storage_path: path,
    status: "pending",
    metadata: { mime_type: parsed.data.mimeType, size_bytes: parsed.data.size },
  });
  if (sourceError) return NextResponse.json({ error: "The upload could not be prepared." }, { status: 500 });

  const { data, error } = await supabase.storage.from("chatbot-documents").createSignedUploadUrl(path);
  if (error || !data) {
    await supabase.from("knowledge_sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: "A secure upload URL could not be created." }, { status: 500 });
  }
  return NextResponse.json({ sourceId, path, token: data.token });
}
