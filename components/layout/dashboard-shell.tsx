import Link from "next/link";
import { Bot, LogOut, Plus } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Brand } from "@/components/layout/brand";
import { WorkspaceNavigation } from "@/components/layout/workspace-navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function DashboardShell({
  email,
  name,
  children,
}: {
  email: string;
  name?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-top"><Brand /><ThemeToggle /></div>
        <WorkspaceNavigation />
        <div className="sidebar-note">
          <Bot size={22} />
          <strong>Built for verified answers</strong>
          <p>Each client’s knowledge stays in its own secure project.</p>
        </div>
        <div className="account-card">
          <span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span>
          <span><strong>{name?.trim() || "K-Labs admin"}</strong><small title={email}>{email}</small></span>
          <form action={logout}>
            <button className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </form>
        </div>
      </aside>
      <div className="dashboard-content">
        <header className="mobile-header">
          <Brand />
          <Link className="button button-primary button-small" href="/projects/new"><Plus size={16} /> New</Link>
        </header>
        {children}
      </div>
    </div>
  );
}
