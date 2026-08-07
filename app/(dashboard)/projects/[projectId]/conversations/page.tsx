import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronRight, CircleHelp, Filter, Globe2, Languages, MessageSquareText, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import { ProjectHeader } from "@/components/admin/project-header";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

type Conversation = { id: string; language: string | null; page_url: string | null; status: string; started_at: string; last_message_at: string };
type Message = { id: string; conversation_id: string; role: string; content: string; model: string | null; latency_ms: number | null; is_unanswered: boolean; created_at: string };
type Feedback = { conversation_id: string; message_id: string; rating: "positive" | "negative"; comment: string | null };
type Lead = { conversation_id: string; name: string | null; email: string | null; phone: string | null; message: string | null; consent: boolean; created_at: string };

function dateLabel(value: string) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function pageLabel(value: string | null) { if (!value) return "Unknown page"; try { const url = new URL(value, "http://local"); return url.hostname === "local" ? value : `${url.hostname}${url.pathname}`; } catch { return value; } }

export default async function ConversationsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params; const query = await searchParams; const supabase = await createClient();
  const [{ data: project }, { data: conversationRows }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("conversations").select("id,language,page_url,status,started_at,last_message_at").eq("project_id", projectId).order("last_message_at", { ascending: false }).limit(250),
  ]);
  if (!project) notFound();
  const conversations = (conversationRows || []) as Conversation[]; const ids = conversations.map(({ id }) => id);
  const [messageResult, feedbackResult, leadResult] = ids.length ? await Promise.all([
    supabase.from("messages").select("id,conversation_id,role,content,model,latency_ms,is_unanswered,created_at").eq("project_id", projectId).in("conversation_id", ids).order("created_at"),
    supabase.from("feedback").select("conversation_id,message_id,rating,comment").eq("project_id", projectId).in("conversation_id", ids),
    supabase.from("leads").select("conversation_id,name,email,phone,message,consent,created_at").eq("project_id", projectId).in("conversation_id", ids).order("created_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const messages = (messageResult.data || []) as Message[]; const feedback = (feedbackResult.data || []) as Feedback[]; const leads = (leadResult.data || []) as Lead[];
  const language = typeof query.language === "string" ? query.language : "all"; const quality = typeof query.quality === "string" ? query.quality : "all";
  const from = typeof query.from === "string" ? query.from : ""; const to = typeof query.to === "string" ? query.to : ""; const selectedId = typeof query.selected === "string" ? query.selected : "";
  const summary = new Map(conversations.map((conversation) => [conversation.id, {
    messages: messages.filter(({ conversation_id }) => conversation_id === conversation.id),
    feedback: feedback.filter(({ conversation_id }) => conversation_id === conversation.id),
    leads: leads.filter(({ conversation_id }) => conversation_id === conversation.id),
  }]));
  const filtered = conversations.filter((conversation) => {
    const related = summary.get(conversation.id)!;
    if (language !== "all" && conversation.language !== language) return false;
    if (quality === "unanswered" && !related.messages.some(({ is_unanswered }) => is_unanswered)) return false;
    if (quality === "positive" && !related.feedback.some(({ rating }) => rating === "positive")) return false;
    if (quality === "negative" && !related.feedback.some(({ rating }) => rating === "negative")) return false;
    if (quality === "leads" && related.leads.length === 0) return false;
    if (from && new Date(conversation.started_at) < new Date(`${from}T00:00:00`)) return false;
    if (to && new Date(conversation.started_at) > new Date(`${to}T23:59:59`)) return false;
    return true;
  });
  const selected = conversations.find(({ id }) => id === selectedId) || filtered[0]; const selectedSummary = selected ? summary.get(selected.id)! : null;
  const linkFor = (conversationId: string) => { const values = new URLSearchParams(); if (language !== "all") values.set("language", language); if (quality !== "all") values.set("quality", quality); if (from) values.set("from", from); if (to) values.set("to", to); values.set("selected", conversationId); return `?${values}` as Route; };

  return <main className="page-wrap project-page"><ProjectHeader project={project as Project} active="conversations" />
    <section className="conversation-hero"><div><p className="eyebrow">Visitor conversations</p><h2>Review answer quality and follow-ups.</h2><p>Transcripts, feedback, unanswered questions, and submitted leads stay isolated to this project.</p></div><span><MessageSquareText size={20} /><strong>{conversations.length}</strong><small>stored conversations</small></span></section>
    <form className="conversation-filters"><span><Filter size={15} /> Filters</span><label>Language<select name="language" defaultValue={language}><option value="all">All languages</option><option value="en">English</option><option value="ar">Arabic</option></select></label><label>Quality<select name="quality" defaultValue={quality}><option value="all">Everything</option><option value="unanswered">Unanswered</option><option value="positive">Positive feedback</option><option value="negative">Negative feedback</option><option value="leads">Has lead</option></select></label><label>From<input name="from" type="date" defaultValue={from} /></label><label>To<input name="to" type="date" defaultValue={to} /></label><button className="button button-secondary">Apply</button>{(language !== "all" || quality !== "all" || from || to) && <Link href="?">Clear</Link>}</form>
    <div className="conversation-layout"><section className="conversation-list"><header><strong>{filtered.length} result{filtered.length === 1 ? "" : "s"}</strong></header>{filtered.length ? filtered.map((conversation) => { const related = summary.get(conversation.id)!; const firstQuestion = related.messages.find(({ role }) => role === "user")?.content || "Conversation started"; const unanswered = related.messages.some(({ is_unanswered }) => is_unanswered); return <Link href={linkFor(conversation.id)} className={selected?.id === conversation.id ? "active" : ""} key={conversation.id}><span className="conversation-list-icon"><MessageSquareText size={15} /></span><div><strong>{firstQuestion}</strong><small><CalendarDays size={11} />{dateLabel(conversation.started_at)}</small><p><Languages size={11} />{conversation.language?.toUpperCase() || "—"}<Globe2 size={11} />{pageLabel(conversation.page_url)}</p><div>{unanswered && <em className="tag unanswered"><CircleHelp size={10} />Unanswered</em>}{related.feedback.map((item) => <em className={`tag ${item.rating}`} key={item.message_id}>{item.rating === "positive" ? <ThumbsUp size={10} /> : <ThumbsDown size={10} />}{item.rating}</em>)}{related.leads.length > 0 && <em className="tag lead"><UserRound size={10} />Lead</em>}</div></div><ChevronRight size={15} /></Link>; }) : <div className="conversation-empty"><MessageSquareText size={25} /><strong>No matching conversations</strong><p>Try a wider date range or clear the filters.</p></div>}</section>
      <section className="transcript-panel">{selected && selectedSummary ? <><header><div><p className="eyebrow">Conversation transcript</p><h2>{dateLabel(selected.started_at)}</h2><span><Languages size={12} />{selected.language?.toUpperCase() || "Unknown"}<Globe2 size={12} />{pageLabel(selected.page_url)}</span></div><em className={`conversation-state ${selected.status}`}>{selected.status}</em></header><div className="admin-transcript">{selectedSummary.messages.map((message) => <article className={message.role === "user" ? "visitor" : "assistant"} key={message.id}><span>{message.role === "user" ? <UserRound size={14} /> : <MessageSquareText size={14} />}</span><div><small>{message.role === "user" ? "Visitor" : "Assistant"} · {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><p>{message.content}</p>{message.role === "assistant" && <footer>{message.is_unanswered && <em className="tag unanswered">Unanswered</em>}{message.model && <span>{message.model}</span>}{message.latency_ms != null && <span>{message.latency_ms} ms</span>}{selectedSummary.feedback.filter(({ message_id }) => message_id === message.id).map((item) => <em className={`tag ${item.rating}`} key={item.message_id}>{item.rating}</em>)}</footer>}</div></article>)}</div>{selectedSummary.leads.length > 0 && <div className="lead-details"><p className="eyebrow">Submitted contact details</p>{selectedSummary.leads.map((lead, index) => <article key={`${lead.created_at}-${index}`}><UserRound size={17} /><div><strong>{lead.name || "Website visitor"}</strong><p>{[lead.email, lead.phone].filter(Boolean).join(" · ")}</p>{lead.message && <blockquote>{lead.message}</blockquote>}<small>{lead.consent ? "Consent recorded" : "Consent not recorded"} · {dateLabel(lead.created_at)}</small></div></article>)}</div>}</> : <div className="transcript-empty"><MessageSquareText size={28} /><strong>Select a conversation</strong><p>The full transcript will appear here.</p></div>}</section>
    </div>
  </main>;
}
