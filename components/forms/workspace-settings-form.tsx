"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateWorkspaceProfile, type WorkspaceSettingsState } from "@/app/actions/workspace";

export function WorkspaceSettingsForm({ email, fullName }: { email: string; fullName: string }) {
  const [state, action, pending] = useActionState<WorkspaceSettingsState, FormData>(updateWorkspaceProfile, {});
  return <form action={action} className="settings-card workspace-settings-card">
    <div><p className="eyebrow">Administrator profile</p><h2>Workspace identity</h2><p>This name appears in the account area of the K-Labs dashboard.</p></div>
    <div className="settings-fields">
      <label className="field"><span>Display name</span><input name="fullName" defaultValue={fullName} required />{state.fieldErrors?.fullName?.[0] ? <small className="field-error">{state.fieldErrors.fullName[0]}</small> : null}</label>
      <label className="field"><span>Administrator email</span><input type="email" value={email} disabled /><small>Authentication email changes are managed by Laravel.</small></label>
    </div>
    {state.error ? <p className="form-message error" role="alert">{state.error}</p> : null}
    {state.success ? <p className="form-message success" role="status">{state.success}</p> : null}
    <button className="button button-primary settings-save" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{pending ? "Saving…" : "Save profile"}</button>
  </form>;
}
