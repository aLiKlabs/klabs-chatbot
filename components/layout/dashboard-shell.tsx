import Link from "next/link";
import { BarChart3, Bot, FolderKanban, LogOut, Plus, Settings2 } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Brand } from "@/components/layout/brand";

export function DashboardShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/dashboard" className="nav-link nav-link-active"><FolderKanban size={19} /> Projects</Link>
          <span className="nav-link nav-link-disabled"><BarChart3 size={19} /> Analytics <small>Soon</small></span>
          <span className="nav-link nav-link-disabled"><Settings2 size={19} /> Settings <small>Soon</small></span>
        </nav>
        <div className="sidebar-note">
          <Bot size={22} />
          <strong>Built for verified answers</strong>
          <p>Each client’s knowledge stays in its own secure project.</p>
        </div>
        <div className="account-card">
          <span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span>
          <span><strong>K-Labs admin</strong><small title={email}>{email}</small></span>
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
