import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { crawlWebsite } from "@/lib/crawling";
import { processKnowledgeSource } from "@/lib/ingestion/process";
import { createClient } from "@/lib/supabase/server";
import { crawlImportSchema } from "@/lib/validation/crawl";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  await requireAdministrator();
  const { projectId } = await context.params;
  const parsed = crawlImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Choose at least one valid page." }, { status: 400 });

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("website_url").eq("id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let sourceId: string | undefined;
  try {
    const projectHost = new URL(project.website_url).hostname;
    const crawl = await crawlWebsite(parsed.data.url, { maxPages: 25, allowedHost: projectHost });
    const selected = new Set(parsed.data.selectedUrls.map((url) => new URL(url).toString()));
    const pages = crawl.pages.filter((page) => selected.has(page.url));
    if (!pages.length) throw new Error("The selected pages were not available when the website was checked again.");

    sourceId = crypto.randomUUID();
    const sourceName = `${new URL(crawl.startUrl).hostname} website`;
    const { error: sourceError } = await supabase.from("knowledge_sources").insert({
      id: sourceId,
      project_id: projectId,
      source_type: "website",
      name: sourceName,
      original_url: crawl.startUrl,
      status: "pending",
      metadata: { crawled_pages: pages.length, crawler_version: 1 },
    });
    if (sourceError) throw new Error("The website source could not be created.");

    const now = new Date().toISOString();
    const { error: pagesError } = await supabase.from("source_pages").insert(pages.map((page) => ({
      project_id: projectId,
      knowledge_source_id: sourceId,
      url: page.url,
      canonical_url: page.url,
      title: page.title,
      raw_text: page.text,
      clean_text: page.text,
      content_hash: page.contentHash,
      http_status: page.status,
      last_crawled_at: now,
    })));
    if (pagesError) throw new Error("The crawled pages could not be saved.");

    const processed = await processKnowledgeSource(supabase, projectId, sourceId);
    return NextResponse.json({ sourceId, pageCount: pages.length, chunkCount: processed.chunkCount });
  } catch (error) {
    if (sourceId) await supabase.from("knowledge_sources").delete().eq("project_id", projectId).eq("id", sourceId);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The website could not be imported." }, { status: 422 });
  }
}
