import { notFound } from "next/navigation";
import { Activity, AlertTriangle, BookOpenText, Bot, Braces, CheckCircle2, CircleHelp, MessageSquareText, MousePointerClick, ThumbsDown, UserRound } from "lucide-react";
import { setProjectStatus } from "@/app/actions/projects";
import { ProjectHeader } from "@/components/admin/project-header";
import { EditProjectForm } from "@/components/forms/edit-project-form";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!data) notFound();
  const project = data as Project;

  const [sources, chunks, conversations, feedback, answered, unanswered, leads, recentUsage, recentJobs] = await Promise.all([
    supabase.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "ready"),
    supabase.from("document_chunks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("feedback").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("rating", "negative"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("role", "assistant").eq("is_unanswered", false),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("role", "assistant").eq("is_unanswered", true),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("usage_events").select("event_type,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
    supabase.from("ingestion_jobs").select("job_type,status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(5),
  ]);

  const cards = [
    ["Ready sources", sources.count ?? 0, BookOpenText, "violet"],
    ["Knowledge chunks", chunks.count ?? 0, Braces, "blue"],
    ["Conversations", conversations.count ?? 0, MessageSquareText, "teal"],
    ["Questions answered", answered.count ?? 0, Bot, "blue"],
    ["Unanswered", unanswered.count ?? 0, CircleHelp, "amber"],
    ["Negative feedback", feedback.count ?? 0, ThumbsDown, "amber"],
    ["Leads collected", leads.count ?? 0, UserRound, "teal"],
    ["Widget status", project.status === "active" ? "Live" : "Offline", CheckCircle2, project.status === "active" ? "teal" : "violet"],
  ] as const;
  const recentActivity = [
    ...(recentUsage.data || []).map((item: { event_type: string; created_at: string }) => ({ label: item.event_type.replaceAll("_", " "), created_at: item.created_at, tone: "chat" })),
    ...(recentJobs.data || []).map((item: { job_type: string; status: string; created_at: string }) => ({ label: `${item.job_type} ${item.status}`, created_at: item.created_at, tone: "knowledge" })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6);

  return (
    <main className="page-wrap project-page">
      <ProjectHeader project={project} active="overview" />
      <div className="overview-grid">
        {cards.map(([label, value, Icon, tone]) => <article className="metric-card" key={label}><span className={`metric-icon ${tone}`}><Icon size={19} /></span><strong>{value}</strong><p>{label}</p></article>)}
      </div>
      <div className="overview-columns">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Readiness</p><h2>Setup progress</h2></div><span className="progress-label">1 of 4</span></div>
          <div className="progress-track"><i style={{ width: "25%" }} /></div>
          <ul className="setup-list">
            <li className="done"><span>✓</span><div><strong>Project created</strong><small>Identity and language settings are ready.</small></div></li>
            <li><span>2</span><div><strong>Add verified knowledge</strong><small>Manual text, documents, or website pages.</small></div></li>
            <li><span>3</span><div><strong>Test grounded answers</strong><small>Review retrieval before going live.</small></div></li>
            <li><span>4</span><div><strong>Install the widget</strong><small>Add one secure script to the client website.</small></div></li>
          </ul>
        </section>
        <section className="panel project-control">
          <div><p className="eyebrow">Publishing</p><h2>Project status</h2><p>Public endpoints only serve active projects. Keep this project in draft while configuring it.</p></div>
          <div className="status-callout"><MousePointerClick size={20} /><span><strong>Current state: {project.status}</strong><small>{project.status === "active" ? "The public chatbot may answer approved domains." : "The public chatbot cannot answer visitors."}</small></span></div>
          <div className="control-actions">
            {project.status !== "archived" ? <form action={setProjectStatus.bind(null, project.id, project.status === "active" ? "paused" : "active")}><button className="button button-secondary">{project.status === "active" ? "Pause project" : "Activate project"}</button></form> : null}
            {project.status !== "archived" ? <form action={setProjectStatus.bind(null, project.id, "archived")}><button className="text-button danger"><AlertTriangle size={15} /> Archive</button></form> : null}
          </div>
        </section>
      </div>
      <section className="panel recent-activity-panel"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Latest project events</h2></div><Activity size={18} /></div>{recentActivity.length ? <ul>{recentActivity.map((item, index) => <li key={`${item.created_at}-${index}`}><span className={item.tone}><Activity size={13} /></span><div><strong>{item.label}</strong><small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small></div></li>)}</ul> : <p className="empty-copy">Activity will appear after knowledge processing or chatbot testing.</p>}</section>
      <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">Configuration</p><h2>Project details</h2></div></div><EditProjectForm project={project} /></section>
    </main>
  );
}
