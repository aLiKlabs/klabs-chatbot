import Link from "next/link";
import {
  BarChart3,
  BookOpenText,
  Braces,
  Eye,
  MessageSquareText,
  Palette,
  Settings2,
  TestTube2,
} from "lucide-react";

const tabs = [
  ["overview", "Overview", Eye],
  ["knowledge", "Knowledge", BookOpenText],
  ["appearance", "Appearance", Palette],
  ["instructions", "Instructions", Settings2],
  ["testing", "Testing", TestTube2],
  ["conversations", "Conversations", MessageSquareText],
  ["analytics", "Analytics", BarChart3],
  ["installation", "Installation", Braces],
] as const;

export function ProjectNavigation({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav className="project-tabs" aria-label="Project settings">
      {tabs.map(([path, label, Icon]) => (
        <Link key={path} href={`/projects/${projectId}/${path}`} className={active === path ? "active" : ""}>
          <Icon size={17} /> {label}
        </Link>
      ))}
    </nav>
  );
}
