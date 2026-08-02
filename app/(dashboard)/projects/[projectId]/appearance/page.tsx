import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/admin/project-header";
import { AppearanceForm } from "@/components/forms/appearance-form";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

export default async function AppearancePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const [{ data: project }, { data: settings }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("chatbot_settings").select("*").eq("project_id", projectId).single(),
  ]);
  if (!project || !settings) notFound();
  return <main className="page-wrap project-page"><ProjectHeader project={project as Project} active="appearance" /><AppearanceForm projectId={projectId} settings={settings} /></main>;
}
