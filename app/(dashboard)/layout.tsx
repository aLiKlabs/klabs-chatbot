import { requireAdministrator } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const administrator = await requireAdministrator();
  const { data: profile } = await (await createClient()).from("profiles").select("full_name").eq("id", administrator.id).maybeSingle();
  return <DashboardShell email={administrator.email ?? "Administrator"} name={profile?.full_name}>{children}</DashboardShell>;
}
