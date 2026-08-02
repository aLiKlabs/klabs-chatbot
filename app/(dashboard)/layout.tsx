import { requireAdministrator } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const administrator = await requireAdministrator();
  return <DashboardShell email={administrator.email ?? "Administrator"}>{children}</DashboardShell>;
}
