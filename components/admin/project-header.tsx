import Link from "next/link";
import { ArrowLeft, Globe2 } from "lucide-react";
import { ProjectNavigation } from "@/components/admin/project-navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import type { Project } from "@/types/database";

export function ProjectHeader({ project, active }: { project: Project; active: string }) {
  return (
    <>
      <Link href="/dashboard" className="back-link"><ArrowLeft size={16} /> All projects</Link>
      <div className="project-heading">
        <div><span className="project-heading-icon">{project.name.slice(0, 1).toUpperCase()}</span><div><div className="title-row"><h1>{project.name}</h1><StatusBadge status={project.status} /></div><a href={project.website_url} target="_blank" rel="noreferrer"><Globe2 size={14} /> {project.website_url}</a></div></div>
      </div>
      <ProjectNavigation projectId={project.id} active={active} />
    </>
  );
}
