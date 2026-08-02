"use client";

import { useActionState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { updateInstructions, type SettingsActionState } from "@/app/actions/widget-settings";

const initialState: SettingsActionState = {};
const localized = (value: unknown, language: string, fallback = "") => value && typeof value === "object" ? String((value as Record<string, unknown>)[language] || fallback) : fallback;

export function InstructionsForm({ projectId, instructions }: { projectId: string; instructions: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(updateInstructions.bind(null, projectId), initialState);
  return <form action={action} className="settings-card instruction-form">
    <div className="settings-intro"><span><ShieldCheck size={22} /></span><div><p className="eyebrow">Answer behaviour</p><h2>Instructions and safety</h2><p>These settings shape responses but never allow answers outside retrieved project knowledge.</p></div></div>
    <div className="settings-fields">
      <label className="field field-wide"><span>System instruction</span><textarea name="systemInstruction" rows={5} defaultValue={String(instructions.system_instruction || "")} placeholder="Be friendly, clear, and concise…" /></label>
      <label className="field"><span>Tone</span><input name="tone" defaultValue={String(instructions.tone || "professional")} /></label>
      <label className="field"><span>Answer length</span><select name="answerLength" defaultValue={String(instructions.answer_length || "concise")}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
      <label className="field field-wide"><span>Fallback message — English</span><textarea name="fallbackEn" rows={2} defaultValue={localized(instructions.fallback_message, "en", "I’m sorry, but I don’t have information about that.")} /></label>
      <label className="field field-wide"><span>Fallback message — Arabic</span><textarea name="fallbackAr" rows={2} dir="rtl" defaultValue={localized(instructions.fallback_message, "ar")} /></label>
      <label className="field field-wide"><span>Restricted topics <em>One per line</em></span><textarea name="restrictedTopics" rows={3} defaultValue={Array.isArray(instructions.restricted_topics) ? instructions.restricted_topics.join("\n") : ""} /></label>
      <label className="field"><span>Language behaviour</span><select name="languageBehavior" defaultValue={String(instructions.language_behavior || "match_visitor")}><option value="match_visitor">Match visitor</option><option value="project_default">Always project default</option></select></label>
      <div className="toggle-stack"><label className="toggle-row"><input name="citationMode" type="checkbox" defaultChecked={Boolean(instructions.citation_mode)} /><span><strong>Show source links</strong><small>Only public webpage links are displayed.</small></span></label><label className="toggle-row"><input name="contactEscalation" type="checkbox" defaultChecked={Boolean(instructions.contact_escalation)} /><span><strong>Offer contact escalation</strong><small>Show configured contact options when an answer is unavailable.</small></span></label></div>
    </div>
    {state.error && <p className="form-message error">{state.error}</p>}{state.success && <p className="form-message success">{state.success}</p>}
    <button className="button button-primary settings-save" disabled={pending}><Save size={15} />{pending ? "Saving…" : "Save instructions"}</button>
  </form>;
}
