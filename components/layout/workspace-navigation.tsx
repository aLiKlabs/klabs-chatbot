"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderKanban, Settings2 } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Projects", Icon: FolderKanban },
  { href: "/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings2 },
] as const;

export function WorkspaceNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/projects"));
        return <Link key={href} href={href} className={`nav-link${active ? " nav-link-active" : ""}`}><Icon size={19} /> {label}</Link>;
      })}
    </nav>
  );
}
