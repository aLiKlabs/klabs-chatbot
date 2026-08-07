import { notFound } from "next/navigation";
import { Construction, Sparkles } from "lucide-react";
import { ProjectHeader } from "@/components/admin/project-header";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

const sections: Record<string, { title: string; description: string; phase: string }> = {
  knowledge: { title: "Knowledge", description: "Add and process the verified content this assistant can use.", phase: "Phase 2" },
  appearance: { title: "Appearance", description: "Shape the widget identity, messages, colours, and contact actions.", phase: "Phase 5" },
  instructions: { title: "Instructions", description: "Control tone and response behaviour without weakening security rules.", phase: "Phase 3" },
  testing: { title: "Testing", description: "Test project-scoped retrieval with private administrator debug details.", phase: "Phase 3" },
  conversations: { title: "Conversations", description: "Review transcripts, feedback, leads, and unanswered questions.", phase: "Phase 6" },
  analytics: { title: "Analytics", description: "Understand usage, answer quality, latency, and AI cost per project.", phase: "Phase 6" },
  installation: { title: "Installation", description: "Generate the isolated widget script for approved domains.", phase: "Phase 5" },
};

export default async function ProjectSectionPage({ params }: { params: Promise<{ projectId: string; section: string }> }) {
  const { projectId, section } = await params;
  const content = sections[section];
  if (!content) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (!data) notFound();

  return (
    <main className="page-wrap project-page">
      <ProjectHeader project={data as Project} active={section} />
      <section className="coming-panel"><span><Construction size={25} /></span><p className="eyebrow">{content.phase}</p><h2>{content.title} is planned next</h2><p>{content.description}</p><div><Sparkles size={16} /> Phase 1 keeps this route protected and project-scoped, ready for its implementation phase.</div></section>
    </main>
  );
}
