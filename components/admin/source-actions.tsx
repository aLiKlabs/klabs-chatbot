"use client";

import { useState, useTransition } from "react";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { deleteSource, reprocessSource, setSourceEnabled } from "@/app/actions/knowledge";
import type { KnowledgeSourceStatus } from "@/types/database";

export function SourceActions({ projectId, sourceId, status }: { projectId: string; sourceId: string; status: KnowledgeSourceStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  function run(action: () => Promise<{ error?: string }>) {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) setError(result.error);
      }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed."); }
    });
  }

  return (
    <div className="source-action-wrap">
      <div className="source-actions">
        <button title="Reprocess source" disabled={pending || status === "processing"} onClick={() => run(() => reprocessSource(projectId, sourceId))}><RefreshCw size={14} /></button>
        <button title={status === "disabled" ? "Enable source" : "Disable source"} disabled={pending || status === "processing"} onClick={() => run(() => setSourceEnabled(projectId, sourceId, status === "disabled"))}>{status === "disabled" ? <Play size={14} /> : <Pause size={14} />}</button>
        <button className="danger" title="Delete source" disabled={pending} onClick={() => { if (window.confirm("Delete this source, its stored file, and all embeddings?")) run(() => deleteSource(projectId, sourceId)); }}><Trash2 size={14} /></button>
      </div>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
