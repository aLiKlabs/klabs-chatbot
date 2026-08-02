"use client";

import { useActionState, useState } from "react";
import { Bot, MessageCircle, Save, Send } from "lucide-react";
import { updateAppearance, type SettingsActionState } from "@/app/actions/widget-settings";

const initialState: SettingsActionState = {};
const value = (localized: unknown, language: string, fallback = "") => localized && typeof localized === "object" ? String((localized as Record<string, unknown>)[language] || fallback) : fallback;
const questions = (localized: unknown, language: string) => localized && typeof localized === "object" && Array.isArray((localized as Record<string, unknown>)[language]) ? ((localized as Record<string, string[]>)[language] || []).join("\n") : "";

export function AppearanceForm({ projectId, settings }: { projectId: string; settings: Record<string, unknown> }) {
  const [state, action, pending] = useActionState(updateAppearance.bind(null, projectId), initialState);
  const [botName, setBotName] = useState(String(settings.bot_name || "Website Assistant"));
  const [welcome, setWelcome] = useState(value(settings.welcome_message, "en", "Hello! How can I help you today?"));
  const [placeholder, setPlaceholder] = useState(value(settings.placeholder_text, "en", "Type your message…"));
  const [primary, setPrimary] = useState(String(settings.primary_color || "#6758E8"));
  const [textColor, setTextColor] = useState(String(settings.text_color || "#172033"));
  const [radius, setRadius] = useState(Number(settings.border_radius ?? 16));
  const [branding, setBranding] = useState(Boolean(settings.show_branding));

  return (
    <div className="appearance-layout">
      <form action={action} className="settings-card appearance-form">
        <div><p className="eyebrow">Widget identity</p><h2>Appearance and messages</h2><p>Changes apply to every website using this project key.</p></div>
        <div className="settings-fields">
          <label className="field"><span>Bot name</span><input name="botName" value={botName} onChange={(e) => setBotName(e.target.value)} required /></label>
          <label className="field"><span>Launcher position</span><select name="launcherPosition" defaultValue={String(settings.launcher_position || "bottom-right")}><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select></label>
          <label className="field"><span>Launcher icon</span><select name="launcherIcon" defaultValue={String(settings.launcher_icon || "message")}><option value="message">Message bubble</option><option value="bot">Robot</option></select></label>
          <label className="field"><span>Corner radius: {radius}px</span><input name="borderRadius" type="range" min="0" max="32" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
          <label className="field color-field"><span>Main colour</span><input name="primaryColor" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label>
          <label className="field color-field"><span>Background colour</span><input name="secondaryColor" type="color" defaultValue={String(settings.secondary_color || "#FFFFFF")} /></label>
          <label className="field color-field"><span>Text colour</span><input name="textColor" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>
          <label className="field"><span>Logo URL <em>Optional</em></span><input name="logoUrl" type="url" defaultValue={String(settings.logo_url || "")} placeholder="https://…/logo.png" /></label>
          <label className="field"><span>Avatar URL <em>Optional</em></span><input name="avatarUrl" type="url" defaultValue={String(settings.avatar_url || "")} placeholder="https://…/avatar.png" /></label>
          <label className="field field-wide"><span>Welcome message — English</span><textarea name="welcomeEn" rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} required /></label>
          <label className="field field-wide"><span>Welcome message — Arabic</span><textarea name="welcomeAr" rows={2} dir="rtl" defaultValue={value(settings.welcome_message, "ar")} /></label>
          <label className="field"><span>Input placeholder — English</span><input name="placeholderEn" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} required /></label>
          <label className="field"><span>Input placeholder — Arabic</span><input name="placeholderAr" dir="rtl" defaultValue={value(settings.placeholder_text, "ar")} /></label>
          <label className="field field-wide"><span>Suggested questions — English <em>One per line</em></span><textarea name="suggestedEn" rows={3} defaultValue={questions(settings.suggested_questions, "en")} /></label>
          <label className="field field-wide"><span>Suggested questions — Arabic <em>One per line</em></span><textarea name="suggestedAr" rows={3} dir="rtl" defaultValue={questions(settings.suggested_questions, "ar")} /></label>
        </div>
        <div className="settings-divider"><p className="eyebrow">Contact escalation</p></div>
        <div className="settings-fields">
          <label className="field"><span>Contact email</span><input name="contactEmail" type="email" defaultValue={String(settings.contact_email || "")} /></label>
          <label className="field"><span>Telephone</span><input name="contactPhone" defaultValue={String(settings.contact_phone || "")} /></label>
          <label className="field"><span>WhatsApp number</span><input name="whatsappNumber" defaultValue={String(settings.whatsapp_number || "")} /></label>
          <label className="field"><span>Contact page URL</span><input name="contactPageUrl" type="url" defaultValue={String(settings.contact_page_url || "")} /></label>
          <label className="field"><span>Contact label — English</span><input name="contactLabelEn" defaultValue={value(settings.contact_button_label, "en", "Contact the team")} /></label>
          <label className="field"><span>Contact label — Arabic</span><input name="contactLabelAr" dir="rtl" defaultValue={value(settings.contact_button_label, "ar", "تواصل مع الفريق")} /></label>
          <label className="field"><span>Privacy URL</span><input name="privacyUrl" type="url" defaultValue={String(settings.privacy_url || "")} /></label>
          <label className="field"><span>Terms URL</span><input name="termsUrl" type="url" defaultValue={String(settings.terms_url || "")} /></label>
          <label className="toggle-row field-wide"><input name="showBranding" type="checkbox" checked={branding} onChange={(e) => setBranding(e.target.checked)} /><span><strong>Show “Powered by K-Labs”</strong><small>Display a small attribution below the composer.</small></span></label>
          <label className="toggle-row"><input name="collectLeads" type="checkbox" defaultChecked={Boolean(settings.collect_leads)} /><span><strong>Enable contact form</strong><small>Let visitors leave contact details after an unanswered question.</small></span></label>
          <label className="toggle-row"><input name="requireLeadConsent" type="checkbox" defaultChecked={Boolean(settings.require_lead_consent)} /><span><strong>Require consent</strong><small>Visitors must agree before submitting details.</small></span></label>
        </div>
        {state.error && <p className="form-message error">{state.error}</p>}{state.success && <p className="form-message success">{state.success}</p>}
        <button className="button button-primary settings-save" disabled={pending}><Save size={15} />{pending ? "Saving…" : "Save appearance"}</button>
      </form>

      <aside className="live-preview-wrap"><p className="eyebrow">Live preview</p><div className="mini-widget" style={{ "--preview-brand": primary, "--preview-text": textColor, "--preview-radius": `${radius}px` } as React.CSSProperties}>
        <header><span><Bot size={18} /></span><div><strong>{botName || "Website Assistant"}</strong><small><i /> Online</small></div></header>
        <main><div className="mini-message"><Bot size={14} /><p>{welcome || "Hello!"}</p></div><button>How can you help me?</button></main>
        <footer><span>{placeholder || "Type your message…"}</span><button><Send size={14} /></button></footer>
        {branding && <small className="mini-branding">Powered by K-Labs</small>}
      </div><div className="mini-launcher" style={{ background: primary }}><MessageCircle size={21} /></div></aside>
    </div>
  );
}
