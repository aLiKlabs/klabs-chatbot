import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectForm } from "@/components/forms/project-form";

export default function NewProjectPage() {
  return (
    <main className="page-wrap narrow-page">
      <Link className="back-link" href="/dashboard"><ArrowLeft size={16} /> Back to projects</Link>
      <div className="page-heading"><div><p className="eyebrow">New project</p><h1>Create a website assistant</h1><p>Start with the client identity. Knowledge and installation come next.</p></div></div>
      <ProjectForm />
    </main>
  );
}
