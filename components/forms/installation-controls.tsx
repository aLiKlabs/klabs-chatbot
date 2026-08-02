"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Globe2, Plus } from "lucide-react";
import { addProjectDomain, type SettingsActionState } from "@/app/actions/widget-settings";

const initialState: SettingsActionState = {};

export function InstallationControls({ projectId, code }: { projectId: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(addProjectDomain.bind(null, projectId), initialState);
  async function copy() { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  return <>
    <section className="install-code-card"><div className="section-heading"><div><p className="eyebrow">Installation script</p><h2>One script tag</h2></div><button className="button button-secondary" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy code"}</button></div><pre><code>{code}</code></pre><ol><li>Copy the script.</li><li>Paste it before the closing <code>&lt;/body&gt;</code> tag.</li><li>Publish the website and open the chat bubble.</li></ol></section>
    <section className="domain-card"><div><span><Globe2 size={18} /></span><div><p className="eyebrow">Approved websites</p><h2>Add staging domains</h2><p>The main project website is always allowed. Add each staging or alternate domain that may use the widget.</p></div></div><form action={action}><label className="field"><span>Domain</span><input name="domain" placeholder="staging.example.com" required /></label><button className="button button-primary" disabled={pending}><Plus size={14} />{pending ? "Adding…" : "Add domain"}</button></form>{state.error && <p className="form-message error">{state.error}</p>}{state.success && <p className="form-message success">{state.success}</p>}</section>
  </>;
}
