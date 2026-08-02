import type { ProjectStatus } from "@/types/database";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status status-${status}`}><i />{status}</span>;
}
