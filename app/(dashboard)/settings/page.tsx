import { Bot, CheckCircle2, Database, KeyRound, LockKeyhole, ServerCog, ShieldCheck } from "lucide-react";
import { WorkspaceSettingsForm } from "@/components/forms/workspace-settings-form";
import { requireAdministrator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceSettingsPage() {
  const administrator = await requireAdministrator();
  const supabase = await createClient();
  const [{ data: profile }, { count: projectCount }] = await Promise.all([
    supabase.from("profiles").select("full_name,role").eq("id", administrator.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).neq("status", "archived"),
  ]);
  const mockMode = process.env.MOCK_EMBEDDINGS === "true";
  const runtimeItems = [
    { label: "Database", value: "Supabase connected", Icon: Database, good: true },
    { label: "AI answer mode", value: mockMode ? "Free local testing" : "OpenAI enabled", Icon: Bot, good: true },
    { label: "Chat model", value: mockMode ? "Local safe fallback" : process.env.OPENAI_CHAT_MODEL || "Not configured", Icon: ServerCog, good: mockMode || Boolean(process.env.OPENAI_CHAT_MODEL) },
    { label: "Embedding model", value: mockMode ? "Local lexical retrieval" : process.env.OPENAI_EMBEDDING_MODEL || "Not configured", Icon: KeyRound, good: mockMode || Boolean(process.env.OPENAI_EMBEDDING_MODEL) },
  ];

  return <main className="page-wrap">
    <div className="page-heading workspace-settings-heading"><div><p className="eyebrow">Workspace settings</p><h1>Manage your admin workspace.</h1><p>Update your profile and review the services that power every K-Labs chatbot.</p></div><span className="workspace-security-badge"><ShieldCheck size={18} /> Administrator only</span></div>
    <div className="workspace-settings-layout">
      <WorkspaceSettingsForm email={administrator.email || "Administrator"} fullName={profile?.full_name || "K-Labs admin"} />
      <section className="settings-card workspace-runtime-card"><div><p className="eyebrow">Runtime status</p><h2>Platform services</h2><p>Configuration status is shown without exposing secret keys.</p></div><div className="runtime-list">{runtimeItems.map(({ label, value, Icon, good }) => <article key={label}><span><Icon size={18} /></span><div><strong>{label}</strong><small>{value}</small></div><i className={good ? "ready" : "warning"}>{good ? "Ready" : "Check setup"}</i></article>)}</div></section>
      <section className="settings-card workspace-security-card"><div className="settings-intro"><span><LockKeyhole size={22} /></span><div><p className="eyebrow">Security</p><h2>Protected administration</h2><p>Access stays restricted to approved administrator accounts.</p></div></div><ul><li><CheckCircle2 size={16} /><span><strong>Role verified</strong><small>{profile?.role || "administrator"}</small></span></li><li><CheckCircle2 size={16} /><span><strong>Email allowlist active</strong><small>{administrator.email}</small></span></li><li><CheckCircle2 size={16} /><span><strong>Project isolation enabled</strong><small>{projectCount || 0} active workspace{projectCount === 1 ? "" : "s"} protected by row-level security</small></span></li></ul></section>
    </div>
  </main>;
}
