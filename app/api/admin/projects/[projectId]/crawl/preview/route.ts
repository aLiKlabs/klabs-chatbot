import { NextResponse } from "next/server";
import { requireAdministrator } from "@/lib/auth";
import { crawlWebsite } from "@/lib/crawling";
import { createClient } from "@/lib/supabase/server";
import { crawlPreviewSchema } from "@/lib/validation/crawl";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  await requireAdministrator();
  const { projectId } = await context.params;
  const parsed = crawlPreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid website URL." }, { status: 400 });

  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("website_url").eq("id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    const projectHost = new URL(project.website_url).hostname;
    const result = await crawlWebsite(parsed.data.url, { maxPages: parsed.data.maxPages, allowedHost: projectHost });
    return NextResponse.json({
      startUrl: result.startUrl,
      pages: result.pages.map(({ text, ...page }) => ({ ...page, excerpt: text.slice(0, 240), characterCount: text.length })),
      skipped: result.skipped.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The website could not be crawled." }, { status: 422 });
  }
}
