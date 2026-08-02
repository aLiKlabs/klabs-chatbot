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
  welcomeMessage: string;
  placeholderText: string;
  primaryColor: string;
  suggestions: string[];
  mockMode: boolean;
}

function id() {
  return crypto.randomUUID();
}

export function ChatbotTester(props: ChatbotTesterProps) {
  const initialMessage = useMemo<Message>(
    () => ({ id: "welcome", role: "assistant", content: props.welcomeMessage }),
    [props.welcomeMessage],
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
        body: JSON.stringify({ message: content, sessionId: sessionId.current, history }),
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

  return (
    <div className="testing-layout" style={style}>
      <section className="chat-preview" aria-label={`${props.botName} testing chatbot`}>
        <header className="chat-preview-header">
          <span className="chat-avatar"><Bot size={22} /></span>
          <div><strong>{props.botName}</strong><small><i /> Connected to project knowledge</small></div>
          <button type="button" onClick={restart} title="Restart conversation" aria-label="Restart conversation"><RefreshCw size={17} /></button>
        </header>

        <div className="chat-transcript" aria-live="polite">
          <div className="chat-date"><span>Private administrator preview</span></div>
          {messages.map((message) => (
            <article className={`chat-message chat-message-${message.role}`} key={message.id}>
              <span className="message-avatar">{message.role === "assistant" ? <Bot size={15} /> : <User size={15} />}</span>
              <div>
                <p>{message.content}</p>
                {message.unanswered && <small className="fallback-label"><ShieldCheck size={12} /> Safe fallback used</small>}
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

        {messages.length === 1 && props.suggestions.length > 0 && (
          <div className="chat-suggestions">
            {props.suggestions.slice(0, 3).map((suggestion) => (
              <button type="button" onClick={() => void sendMessage(suggestion)} key={suggestion}>{suggestion}</button>
            ))}
          </div>
        )}
        {error && <p className="chat-error" role="alert">{error}</p>}
        <form className="chat-composer" onSubmit={submit}>
          <textarea
            aria-label="Message the chatbot"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={inputKeyDown}
            placeholder={props.placeholderText}
            maxLength={2_000}
            rows={1}
            disabled={sending}
          />
          <button type="submit" disabled={sending || draft.trim().length < 2} aria-label="Send message"><Send size={17} /></button>
          <small>Enter to send · Shift + Enter for a new line</small>
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
