"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { MessageContent } from "@/components/chatbot/message-content";

type Source = { title: string; url: string | null; pageNumber: number | null };
type DebugChunk = Source & { content: string; similarity: number };
type DebugInfo = {
  retrievalMode: string;
  chunks: DebugChunk[];
  promptTokens: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  latencyMs: number;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  unanswered?: boolean;
};

export interface ChatbotTesterProps {
  projectId: string;
  botName: string;
  defaultLanguage: "en" | "ar";
  welcomeMessages: Record<"en" | "ar", string>;
  placeholderTexts: Record<"en" | "ar", string>;
  primaryColor: string;
  suggestions: Record<"en" | "ar", string[]>;
  mockMode: boolean;
}

function id() {
  return crypto.randomUUID();
}

export function ChatbotTester(props: ChatbotTesterProps) {
  const [language, setLanguage] = useState<"en" | "ar">(props.defaultLanguage);
  const rtl = language === "ar";
  const initialMessage = useMemo<Message>(
    () => ({ id: "welcome", role: "assistant", content: props.welcomeMessages[language] }),
    [language, props.welcomeMessages],
  );
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const sessionId = useRef<string | null>(null);
  const style = { "--chat-brand": props.primaryColor } as CSSProperties;

  async function sendMessage(question: string) {
    const content = question.trim();
    if (content.length < 2 || sending) return;
    const userMessage: Message = { id: id(), role: "user", content };
    const history = messages
      .filter(({ id: messageId }) => messageId !== "welcome")
      .slice(-8)
      .map(({ role, content: historyContent }) => ({ role, content: historyContent }));
    sessionId.current ||= id();
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError(null);
    setSending(true);

    try {
      const response = await fetch(`/api/admin/projects/${props.projectId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: content, sessionId: sessionId.current, language, history }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "The chatbot could not answer.");
      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: "assistant",
          content: payload.answer,
          unanswered: payload.unanswered,
        },
      ]);
      setDebug(payload.debug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The chatbot could not answer.");
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function inputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function restart() {
    sessionId.current = null;
    setMessages([initialMessage]);
    setDebug(null);
    setError(null);
    setDraft("");
  }

  function switchLanguage() {
    const nextLanguage = rtl ? "en" : "ar";
    setLanguage(nextLanguage);
    sessionId.current = null;
    setMessages([{ id: "welcome", role: "assistant", content: props.welcomeMessages[nextLanguage] }]);
    setDebug(null);
    setError(null);
    setDraft("");
  }

  return (
    <div className="testing-layout" style={style}>
      <section className="chat-preview" aria-label={`${props.botName} testing chatbot`} dir={rtl ? "rtl" : "ltr"}>
        <header className="chat-preview-header">
          <span className="chat-avatar"><Bot size={22} /></span>
          <div><strong>{props.botName}</strong><small><i /> {rtl ? "متصل بقاعدة معرفة المشروع" : "Connected to project knowledge"}</small></div>
          <div className="chat-preview-actions">
            <button className="chat-language-toggle" type="button" onClick={switchLanguage} title={rtl ? "Switch to English" : "التبديل إلى العربية"} aria-label={rtl ? "Switch to English" : "التبديل إلى العربية"}>{rtl ? "EN" : "ع"}</button>
            <button type="button" onClick={restart} title={rtl ? "بدء محادثة جديدة" : "Restart conversation"} aria-label={rtl ? "بدء محادثة جديدة" : "Restart conversation"}><RefreshCw size={17} /></button>
          </div>
        </header>

        <div className="chat-transcript" aria-live="polite">
          <div className="chat-date"><span>{rtl ? "معاينة خاصة للمسؤول" : "Private administrator preview"}</span></div>
          {messages.map((message) => (
            <article className={`chat-message chat-message-${message.role}`} key={message.id}>
              <span className="message-avatar">{message.role === "assistant" ? <Bot size={15} /> : <User size={15} />}</span>
              <div>
                <MessageContent content={message.content} />
                {message.unanswered && <small className="fallback-label"><ShieldCheck size={12} /> {rtl ? "تم استخدام الرد الآمن" : "Safe fallback used"}</small>}
              </div>
            </article>
          ))}
          {sending && (
            <article className="chat-message chat-message-assistant">
              <span className="message-avatar"><Bot size={15} /></span>
              <div className="typing-indicator" aria-label="Generating an answer"><i /><i /><i /></div>
            </article>
          )}
        </div>

        {messages.length === 1 && props.suggestions[language].length > 0 && (
          <div className="chat-suggestions">
            {props.suggestions[language].slice(0, 3).map((suggestion) => (
              <button
                type="button"
                onClick={() => void sendMessage(suggestion)}
                key={suggestion}
                style={{ color: props.primaryColor, borderColor: props.primaryColor, backgroundColor: "transparent" }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {error && <p className="chat-error" role="alert">{error}</p>}
        <form className="chat-composer" onSubmit={submit}>
          <textarea
            aria-label={rtl ? "اكتب رسالة للمساعد" : "Message the chatbot"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={inputKeyDown}
            placeholder={props.placeholderTexts[language]}
            maxLength={2_000}
            rows={1}
            disabled={sending}
          />
          <button type="submit" disabled={sending || draft.trim().length < 2} aria-label={rtl ? "إرسال" : "Send message"}><Send size={17} /></button>
          <small>{rtl ? "Enter للإرسال · Shift + Enter لسطر جديد" : "Enter to send · Shift + Enter for a new line"}</small>
        </form>
      </section>

      <aside className="chat-debug" aria-label="Retrieval debug information">
        <div className="debug-heading">
          <div><p className="eyebrow">Administrator only</p><h2>Retrieval debug</h2></div>
          <button type="button" onClick={() => setShowDebug((value) => !value)} aria-expanded={showDebug}>
            {showDebug ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
        {showDebug && (
          debug ? (
            <div className="debug-content">
              <div className="debug-metrics">
                <article><Sparkles size={15} /><span><strong>{debug.model}</strong><small>answer model</small></span></article>
                <article><Clock3 size={15} /><span><strong>{debug.latencyMs} ms</strong><small>response latency</small></span></article>
                <article><Database size={15} /><span><strong>{debug.chunks.length}</strong><small>retrieved chunks</small></span></article>
                <article><MessageCircleMore size={15} /><span><strong>{debug.promptTokens}</strong><small>prompt tokens</small></span></article>
              </div>
              <div className="debug-usage">
                <span>Retrieval <b>{debug.retrievalMode}</b></span>
                <span>Input <b>{debug.inputTokens}</b></span>
                <span>Output <b>{debug.outputTokens}</b></span>
                <span>Embedding <b>{debug.embeddingTokens}</b></span>
              </div>
              <div className="debug-chunks">
                <h3>Retrieved knowledge</h3>
                {debug.chunks.length ? debug.chunks.map((chunk, index) => (
                  <article key={`${chunk.title}-${index}`}>
                    <header><strong>{index + 1}. {chunk.title}</strong><span>{Math.round(chunk.similarity * 100)}%</span></header>
                    <p>{chunk.content}</p>
                  </article>
                )) : <div className="debug-empty"><ShieldCheck size={22} /><strong>No matching knowledge</strong><p>The safe fallback was returned instead of an invented answer.</p></div>}
              </div>
            </div>
          ) : (
            <div className="debug-placeholder"><Database size={30} /><strong>Ask a question to inspect retrieval</strong><p>You’ll see matched chunks, similarity, prompt size, model, tokens, and latency here.</p></div>
          )
        )}
      </aside>
    </div>
  );
}
