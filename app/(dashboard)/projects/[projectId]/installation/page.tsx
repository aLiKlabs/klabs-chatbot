import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Globe2, Trash2 } from "lucide-react";
import { removeProjectDomain } from "@/app/actions/widget-settings";
import { ProjectHeader } from "@/components/admin/project-header";
import { InstallationControls } from "@/components/forms/installation-controls";
import { getPublicEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

export default async function InstallationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; const supabase = await createClient();
  const [{ data: project }, { data: domains }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("project_domains").select("id,domain,status").eq("project_id", projectId).order("created_at"),
  ]);
  if (!project) notFound();
  const typedProject = project as Project; const base = getPublicEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const code = `<script\n  src="${base}/widget.js"\n  data-chatbot-key="${typedProject.public_key}"\n  data-position="bottom-right"\n  data-language="auto"\n  async>\n</script>`;
  const websiteHost = new URL(typedProject.website_url).hostname;
  return <main className="page-wrap project-page"><ProjectHeader project={typedProject} active="installation" />
    <section className={`install-status ${typedProject.status === "active" ? "active" : "inactive"}`}>{typedProject.status === "active" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}<div><strong>{typedProject.status === "active" ? "Public widget is active" : "Activate this project before publishing"}</strong><p>{typedProject.status === "active" ? "Approved websites can load the chatbot now." : "The installation code is ready, but public endpoints reject draft and paused projects."}</p></div></section>
    <div className="installation-grid"><div><InstallationControls projectId={projectId} code={code} /></div><aside className="approved-domain-list"><p className="eyebrow">Domain allowlist</p><h2>Allowed origins</h2><article><span><Globe2 size={15} /></span><div><strong>{websiteHost}</strong><small>Main project website</small></div><em>Always allowed</em></article>{(domains || []).map((domain) => <article key={domain.id}><span><Globe2 size={15} /></span><div><strong>{domain.domain}</strong><small>Additional domain</small></div><form action={removeProjectDomain.bind(null, projectId, domain.id)}><button aria-label={`Remove ${domain.domain}`}><Trash2 size={13} /></button></form></article>)}</aside></div>
  </main>;
}
