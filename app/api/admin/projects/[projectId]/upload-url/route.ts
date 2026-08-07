import { NextResponse } from "next/server";
import { getAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/laravel/server";
import { safeStorageFilename, uploadRequestSchema } from "@/lib/validation/knowledge";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!(await getAdministrator())) {
    return NextResponse.json({ error: "Your administrator session expired. Refresh the page and sign in again." }, { status: 401 });
  }
  const { projectId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  }
  const parsed = uploadRequestSchema.safeParse({ filename: file.name, mimeType: file.type, size: file.size });
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

  // Detach the uploaded bytes from Next's incoming multipart request before
  // forwarding them to Laravel. Reusing that request-backed File can leave the
  // PHP development server waiting on a stream until its execution timeout.
  const storedFile = new Blob([await file.arrayBuffer()], { type: parsed.data.mimeType });
  const { error } = await supabase.storage.from("chatbot-documents").upload(path, storedFile, file.name);
  if (error) {
    await supabase.from("knowledge_sources").delete().eq("id", sourceId);
    return NextResponse.json({ error: error.message || "The document could not be stored." }, { status: 500 });
  }
  return NextResponse.json({ sourceId, path });
}
