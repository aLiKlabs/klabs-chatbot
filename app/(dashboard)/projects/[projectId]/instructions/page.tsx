import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/admin/project-header";
import { InstructionsForm } from "@/components/forms/instructions-form";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

export default async function InstructionsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: instructions }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("chatbot_instructions").select("*").eq("project_id", projectId).single(),
  ]);
  if (!project || !instructions) notFound();
  return <main className="page-wrap project-page"><ProjectHeader project={project as Project} active="instructions" /><InstructionsForm projectId={projectId} instructions={instructions} /></main>;
}
