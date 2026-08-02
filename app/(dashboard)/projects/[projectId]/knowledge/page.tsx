import { notFound } from "next/navigation";
import { BookOpenText, Boxes, CalendarClock, Database, File, FileQuestion, FileText, ShieldCheck } from "lucide-react";
import { ProjectHeader } from "@/components/admin/project-header";
import { SourceActions } from "@/components/admin/source-actions";
import { KnowledgeForms } from "@/components/forms/knowledge-forms";
import { createClient } from "@/lib/supabase/server";
import type { KnowledgeSource, Project } from "@/types/database";

function sourceIcon(type: KnowledgeSource["source_type"]) {
  if (type === "faq") return FileQuestion;
  if (type === "pdf" || type === "docx") return File;
  return FileText;
}

function formatDate(value: string | null) {
  if (!value) return "Not processed yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function KnowledgePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const [{ data: projectData }, { data: sourceData }, chunksResult, tokensResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("knowledge_sources")
      .select("*,document_chunks(count)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase.from("document_chunks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("usage_events").select("embedding_tokens").eq("project_id", projectId),
  ]);
  if (!projectData) notFound();
  const project = projectData as Project;
  const sources = (sourceData || []) as KnowledgeSource[];
  const readySources = sources.filter(({ status }) => status === "ready").length;
  const embeddingTokens = (tokensResult.data || []).reduce((total, event) => total + (event.embedding_tokens || 0), 0);

  return (
    <main className="page-wrap project-page">
      <ProjectHeader project={project} active="knowledge" />

      <section className="knowledge-hero">
        <div><p className="eyebrow">Knowledge base</p><h2>Teach the assistant with verified content.</h2><p>Documents and entries are cleaned, split into semantic chunks, and embedded for grounded answers.</p></div>
        <span><ShieldCheck size={22} /><strong>Private by default</strong><small>Files are accessible only to approved administrators.</small></span>
      </section>

      <div className="knowledge-metrics">
        <article><BookOpenText size={18} /><div><strong>{readySources}</strong><small>ready sources</small></div></article>
        <article><Boxes size={18} /><div><strong>{chunksResult.count ?? 0}</strong><small>knowledge chunks</small></div></article>
        <article><Database size={18} /><div><strong>{embeddingTokens.toLocaleString()}</strong><small>embedding tokens</small></div></article>
      </div>

      <KnowledgeForms projectId={projectId} />

      <section className="source-library">
        <div className="section-heading"><div><p className="eyebrow">Source library</p><h2>Project knowledge</h2></div><span>{sources.length} source{sources.length === 1 ? "" : "s"}</span></div>
        {sources.length ? (
          <div className="source-table">
            {sources.map((source) => {
              const Icon = sourceIcon(source.source_type);
              const count = source.document_chunks?.[0]?.count ?? 0;
              return (
                <article className="source-row" key={source.id}>
                  <span className="source-icon"><Icon size={18} /></span>
                  <div className="source-main"><strong>{source.name}</strong><small>{source.source_type.toUpperCase()} · {count} chunk{count === 1 ? "" : "s"}</small>{source.error_message && <p>{source.error_message}</p>}</div>
                  <span className={`source-status source-status-${source.status}`}><i />{source.status}</span>
                  <span className="source-date"><CalendarClock size={13} />{formatDate(source.last_processed_at)}</span>
                  <SourceActions projectId={projectId} sourceId={source.id} status={source.status} />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="source-empty"><BookOpenText size={29} /><strong>No knowledge sources yet</strong><p>Upload a document, paste approved text, or add your first FAQ above.</p></div>
        )}
      </section>
    </main>
  );
}
