import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { processKnowledgeSource } from "@/lib/ingestion/process";
import { createClient } from "@/lib/supabase/server";
import { sourceIdSchema } from "@/lib/validation/knowledge";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  await requireAdministrator();
  const { projectId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = sourceIdSchema.safeParse({ projectId, sourceId: body?.sourceId });
  if (!parsed.success) return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  try {
    const result = await processKnowledgeSource(await createClient(), projectId, parsed.data.sourceId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed." },
      { status: 422 },
    );
  }
}
