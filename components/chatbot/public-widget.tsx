"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ExternalLink, Mail, MessageCircle, Minus, Phone, RefreshCw, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";

type WidgetConfig = {
  language: "en" | "ar"; supportedLanguages: string[]; botName: string; welcomeMessage: string; placeholderText: string;
  primaryColor: string; secondaryColor: string; textColor: string; launcherPosition: string; launcherIcon: string;
  logoUrl: string | null; avatarUrl: string | null; borderRadius: number; showBranding: boolean; suggestedQuestions: string[];
  contact: { email: string | null; phone: string | null; whatsapp: string | null; pageUrl: string | null; label: string };
  privacyUrl: string | null; termsUrl: string | null; showSources: boolean;
  collectLeads: boolean; requireLeadConsent: boolean;
};
type Source = { title: string; url: string };
type Message = { id: string; role: "user" | "assistant"; content: string; messageId?: string; unanswered?: boolean; sources?: Source[]; rating?: "positive" | "negative" };

function uuid() { return crypto.randomUUID(); }
function parentResize(open: boolean) { window.parent.postMessage({ type: "klabs-widget-resize", open }, "*"); }

export function PublicWidget({ publicKey, pageUrl, initialLanguage }: { publicKey: string; pageUrl: string; initialLanguage: string }) {
  const [config, setConfig] = useState<WidgetConfig>();
  const [language, setLanguage] = useState(initialLanguage === "ar" ? "ar" : "en");
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const storageKey = `klabs-chat-session:${publicKey}`;
  const [sessionId, setSessionId] = useState(() => { try { return localStorage.getItem(storageKey) || uuid(); } catch { return uuid(); } });
  const [messages, setMessages] = useState<Message[]>([]);
  const rtl = language === "ar";

  const openWidget = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
  }, []);

  const closeWidget = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 220);
  }, [closing]);

  const loadConfig = useCallback(async (selectedLanguage: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/widget-config/${encodeURIComponent(publicKey)}?pageUrl=${encodeURIComponent(pageUrl)}&language=${selectedLanguage}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chatbot unavailable.");
      setConfig(result); setLanguage(result.language);
      setMessages((current) => current.length ? current : [{ id: uuid(), role: "assistant", content: result.welcomeMessage }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Chatbot unavailable."); }
    finally { setLoading(false); }
  }, [pageUrl, publicKey]);

  useEffect(() => { try { localStorage.setItem(storageKey, sessionId); } catch {} }, [sessionId, storageKey]);
  useEffect(() => { const timer = window.setTimeout(() => void loadConfig(language), 0); return () => window.clearTimeout(timer); }, [language, loadConfig]);
  useEffect(() => { parentResize(open); }, [open]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape" && open) closeWidget(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [closeWidget, open]);
  useEffect(() => () => { if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current); }, []);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  const theme = useMemo(() => ({ "--widget-brand": config?.primaryColor || "#6758E8", "--widget-bg": config?.secondaryColor || "#FFFFFF", "--widget-text": config?.textColor || "#172033", "--widget-radius": `${config?.borderRadius ?? 16}px` }) as React.CSSProperties, [config]);

  function restart() {
    const next = uuid(); setSessionId(next); setMessages(config ? [{ id: uuid(), role: "assistant", content: config.welcomeMessage }] : []); setError(""); setShowLeadForm(false);
  }

  async function send(text = input) {
    const content = text.trim();
    if (!content || sending || !config) return;
    setInput(""); setError(""); setSending(true);
    const userMessage: Message = { id: uuid(), role: "user", content };
    const assistantId = uuid();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    try {
      const history = messages.slice(-8).map(({ role, content: historyContent }) => ({ role, content: historyContent }));
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicKey, message: content, sessionId, pageUrl, language, history }) });
      if (!response.ok || !response.body) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "The chatbot could not answer."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const event of events) {
          const eventName = event.match(/^event: (.+)$/m)?.[1]; const raw = event.match(/^data: (.+)$/m)?.[1]; if (!raw) continue;
          const data = JSON.parse(raw);
          if (eventName === "meta") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, messageId: data.messageId, unanswered: data.unanswered, sources: data.sources } : message));
          if (eventName === "delta") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + data.text } : message));
        }
      }
    } catch (reason) {
      setMessages((current) => current.filter(({ id }) => id !== assistantId)); setError(reason instanceof Error ? reason.message : "The chatbot could not answer.");
    } finally { setSending(false); }
  }

  async function rate(message: Message, rating: "positive" | "negative") {
    if (!message.messageId) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, rating } : item));
    await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicKey, sessionId, messageId: message.messageId, rating }) });
  }

  if (!open) return <div className="public-widget-root widget-closed" style={theme}><button className="public-launcher" aria-label={rtl ? "فتح المحادثة" : "Open chat"} onClick={openWidget}>{config?.launcherIcon === "bot" ? <Bot /> : <MessageCircle />}</button></div>;
  return <div className="public-widget-root" style={theme} dir={rtl ? "rtl" : "ltr"}>
    <section className={`public-chat${closing ? " widget-closing" : ""}`} aria-label={config?.botName || "Website chatbot"}>
      <header className="public-chat-header"><span className="public-avatar">{config?.avatarUrl ? <img src={config.avatarUrl} alt="" /> /* eslint-disable-line @next/next/no-img-element */ : <Bot size={22} />}</span><div><strong>{config?.botName || "Website Assistant"}</strong><small><i /> {rtl ? "متصل" : "Online"}</small></div>{config?.supportedLanguages.includes("ar") && config.supportedLanguages.includes("en") && <button className="language-toggle" onClick={() => { setMessages([]); setLanguage(rtl ? "en" : "ar"); }}>{rtl ? "EN" : "ع"}</button>}<button aria-label={rtl ? "بدء محادثة جديدة" : "Restart conversation"} onClick={restart}><RefreshCw size={16} /></button><button aria-label={rtl ? "تصغير" : "Minimize"} onClick={closeWidget}><Minus size={17} /></button></header>
      <div className="public-transcript" ref={transcriptRef} aria-live="polite">
        {loading && <div className="public-state"><span className="widget-spinner" />{rtl ? "جارٍ التحميل…" : "Loading…"}</div>}
        {!loading && error && messages.length === 0 && <div className="public-state public-unavailable"><X size={23} /><strong>{rtl ? "المساعد غير متاح" : "Chatbot unavailable"}</strong><p>{error}</p></div>}
        {messages.map((message) => <div className={`public-message ${message.role}`} key={message.id}><div className="public-bubble">{message.content || <span className="typing-dots"><i /><i /><i /></span>}</div>{message.role === "assistant" && message.messageId && message.content && <div className="public-message-actions"><button aria-label="Helpful" className={message.rating === "positive" ? "active" : ""} onClick={() => rate(message, "positive")}><ThumbsUp size={12} /></button><button aria-label="Not helpful" className={message.rating === "negative" ? "active" : ""} onClick={() => rate(message, "negative")}><ThumbsDown size={12} /></button></div>}{config?.showSources && message.sources?.length ? <div className="public-sources">{message.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${source.title}`}>{source.title}<ExternalLink size={10} /></a>)}</div> : null}{message.unanswered && config && <ContactOptions config={config} rtl={rtl} onLead={() => setShowLeadForm(true)} />}</div>)}
        {showLeadForm && config && <LeadForm publicKey={publicKey} sessionId={sessionId} rtl={rtl} requireConsent={config.requireLeadConsent} onClose={() => setShowLeadForm(false)} />}
      </div>
      {!loading && config?.suggestedQuestions.length && messages.length <= 1 ? <div className="public-suggestions">{config.suggestedQuestions.slice(0, 4).map((question) => <button key={question} onClick={() => send(question)}>{question}</button>)}</div> : null}
      {error && messages.length > 0 && <p className="public-error">{error}</p>}
      <form className="public-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><textarea aria-label={config?.placeholderText || "Message"} placeholder={config?.placeholderText || "Type your message…"} value={input} disabled={!config || sending} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} /><button aria-label={rtl ? "إرسال" : "Send"} disabled={!input.trim() || sending}><Send size={18} /></button></form>
      <footer className="public-footer">{config?.showBranding && <span>Powered by <strong>K-Labs</strong></span>}<nav>{config?.privacyUrl && <a href={config.privacyUrl} target="_blank" rel="noreferrer">{rtl ? "الخصوصية" : "Privacy"}</a>}{config?.termsUrl && <a href={config.termsUrl} target="_blank" rel="noreferrer">{rtl ? "الشروط" : "Terms"}</a>}</nav></footer>
    </section>
  </div>;
}

function ContactOptions({ config, rtl, onLead }: { config: WidgetConfig; rtl: boolean; onLead: () => void }) {
  const { contact } = config;
  if (!contact.email && !contact.phone && !contact.whatsapp && !contact.pageUrl && !config.collectLeads) return null;
  const whatsApp = contact.whatsapp?.replace(/\D/g, "");
  return <div className="public-contact"><strong>{contact.label}</strong><div>{whatsApp && <a href={`https://wa.me/${whatsApp}`} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>}{contact.email && <a href={`mailto:${contact.email}`}><Mail size={13} />{rtl ? "البريد" : "Email"}</a>}{contact.phone && <a href={`tel:${contact.phone}`}><Phone size={13} />{rtl ? "اتصال" : "Call"}</a>}{contact.pageUrl && <a href={contact.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />{rtl ? "تواصل" : "Contact"}</a>}{config.collectLeads && <button onClick={onLead}><Mail size={13} />{rtl ? "اترك بياناتك" : "Leave details"}</button>}</div></div>;
}

function LeadForm({ publicKey, sessionId, rtl, requireConsent, onClose }: { publicKey: string; sessionId: string; rtl: boolean; requireConsent: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle"); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("sending"); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicKey, sessionId, name: form.get("name"), email: form.get("email"), phone: form.get("phone"), message: form.get("message"), consent: form.get("consent") === "on" }) });
    const result = await response.json(); if (!response.ok) { setError(result.error || "Could not send details."); setStatus("idle"); return; } setStatus("sent");
  }
  if (status === "sent") return <div className="public-lead-form sent"><strong>{rtl ? "تم إرسال بياناتك" : "Your details were sent"}</strong><button onClick={onClose}>{rtl ? "إغلاق" : "Close"}</button></div>;
  return <form className="public-lead-form" onSubmit={submit}><div><strong>{rtl ? "اطلب من الفريق التواصل معك" : "Ask the team to contact you"}</strong><button type="button" aria-label="Close contact form" onClick={onClose}><X size={14} /></button></div><input name="name" placeholder={rtl ? "الاسم" : "Name"} /><input name="email" type="email" placeholder={rtl ? "البريد الإلكتروني" : "Email"} /><input name="phone" placeholder={rtl ? "رقم الهاتف" : "Telephone"} /><textarea name="message" rows={2} placeholder={rtl ? "كيف يمكننا مساعدتك؟" : "How can we help?"} />{requireConsent && <label><input name="consent" type="checkbox" required />{rtl ? "أوافق على مشاركة بياناتي مع الفريق." : "I agree to share these details with the team."}</label>}{error && <p>{error}</p>}<button className="lead-submit" disabled={status === "sending"}>{status === "sending" ? (rtl ? "جارٍ الإرسال…" : "Sending…") : (rtl ? "إرسال" : "Send details")}</button></form>;
}
