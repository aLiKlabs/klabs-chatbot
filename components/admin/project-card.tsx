import Link from "next/link";
import { ArrowUpRight, BookOpenText, Globe2, MessageSquareText, MoreHorizontal } from "lucide-react";
import { setProjectStatus } from "@/app/actions/projects";
import { StatusBadge } from "@/components/admin/status-badge";
import type { Project } from "@/types/database";

export function ProjectCard({
  project,
  sourceCount,
  conversationCount,
}: {
  project: Project;
  sourceCount: number;
  conversationCount: number;
}) {
  const updated = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(project.updated_at));

  return (
    <article className="project-card">
      <div className="project-card-top">
        <span className="project-icon"><MessageSquareText size={21} /></span>
        <StatusBadge status={project.status} />
        <button className="icon-button" aria-label={`More actions for ${project.name}`}><MoreHorizontal size={19} /></button>
      </div>
      <div className="project-card-title">
        <h2>{project.name}</h2>
        <a href={project.website_url} target="_blank" rel="noreferrer"><Globe2 size={14} /> {new URL(project.website_url).hostname}</a>
      </div>
      <div className="project-stats">
        <span><BookOpenText size={16} /><strong>{sourceCount}</strong><small>sources</small></span>
        <span><MessageSquareText size={16} /><strong>{conversationCount}</strong><small>chats</small></span>
      </div>
      <div className="project-card-footer">
        <small>Updated {updated}</small>
        <div>
          {project.status !== "archived" ? (
            <form action={setProjectStatus.bind(null, project.id, project.status === "paused" ? "active" : "paused")}>
              <button className="text-button">{project.status === "paused" ? "Resume" : "Pause"}</button>
            </form>
          ) : null}
          <Link href={`/projects/${project.id}/overview`}>Open <ArrowUpRight size={15} /></Link>
        </div>
      </div>
    </article>
  );
}
