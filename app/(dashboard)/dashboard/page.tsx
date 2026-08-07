import Link from "next/link";
import { ArrowRight, FolderPlus, Plus, Search, Sparkles } from "lucide-react";
import { ProjectCard } from "@/components/admin/project-card";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, knowledge_sources(count), conversations(count)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  const projects = (data ?? []) as Array<
    Project & {
      knowledge_sources?: Array<{ count: number }>;
      conversations?: Array<{ count: number }>;
    }
  >;

  return (
    <main className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">Workspace</p><h1>Your chatbot projects</h1><p>Build reliable assistants with completely isolated client knowledge.</p></div>
        <Link className="button button-primary desktop-create" href="/projects/new"><Plus size={18} /> Create project</Link>
      </div>

      {error ? <div className="notice notice-error">Projects could not be loaded. Check your Laravel API and MySQL connection.</div> : null}

      {projects.length ? (
        <>
          <div className="toolbar">
            <label className="search-box"><Search size={17} /><span className="sr-only">Search projects</span><input placeholder="Search projects" disabled /></label>
            <span>{projects.length} active workspace{projects.length === 1 ? "" : "s"}</span>
          </div>
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                sourceCount={project.knowledge_sources?.[0]?.count ?? 0}
                conversationCount={project.conversations?.[0]?.count ?? 0}
              />
            ))}
          </div>
        </>
      ) : !error ? (
        <section className="empty-state">
          <div className="empty-visual" aria-hidden="true">
            <span className="empty-glow" />
            <span className="empty-icon"><FolderPlus size={30} /></span>
            <span className="empty-chip empty-chip-one">Knowledge</span>
            <span className="empty-chip empty-chip-two">Widget</span>
            <span className="empty-chip empty-chip-three"><Sparkles size={13} /> AI answers</span>
          </div>
          <p className="eyebrow">Your first assistant</p>
          <h2>Give a client website its own expert</h2>
          <p>Create an isolated project, add verified business knowledge, then install it with one script.</p>
          <Link className="button button-primary" href="/projects/new">Create your first project <ArrowRight size={17} /></Link>
          <div className="steps"><span><b>1</b> Create</span><i /><span><b>2</b> Add knowledge</span><i /><span><b>3</b> Install</span></div>
        </section>
      ) : null}
    </main>
  );
}
