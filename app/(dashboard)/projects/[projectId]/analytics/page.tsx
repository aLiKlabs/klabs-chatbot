import { notFound } from "next/navigation";
import { BarChart3, Bot, CircleHelp, Clock3, Coins, Database, MessageCircleQuestion, MessageSquareText, ThumbsDown, ThumbsUp, UserRound, UsersRound } from "lucide-react";
import { ProjectHeader } from "@/components/admin/project-header";
import { UsageCalculator } from "@/components/admin/usage-calculator";
import { averageLatency, buildDailySeries, calculateUsage, commonQuestions, commonSources, type AnalyticsMessage, type UsageRow } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/database";

type ConversationRow = { id: string; session_id: string; language: string | null; started_at: string };
type FeedbackRow = { rating: "positive" | "negative" };

function validDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
function shortDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`)); }
function compact(value: number) { return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params; const query = await searchParams; const supabase = await createClient();
  const today = new Date(); const defaultFromDate = new Date(today); defaultFromDate.setDate(defaultFromDate.getDate() - 29);
  const from = validDate(query.from) || defaultFromDate.toISOString().slice(0, 10); const to = validDate(query.to) || today.toISOString().slice(0, 10);
  const start = `${from}T00:00:00.000Z`; const end = `${to}T23:59:59.999Z`;
  const [{ data: project }, conversationResult, messageResult, feedbackResult, leadResult, usageResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("conversations").select("id,session_id,language,started_at").eq("project_id", projectId).gte("started_at", start).lte("started_at", end).order("started_at"),
    supabase.from("messages").select("role,content,is_unanswered,latency_ms,sources,created_at").eq("project_id", projectId).gte("created_at", start).lte("created_at", end).order("created_at"),
    supabase.from("feedback").select("rating,created_at").eq("project_id", projectId).gte("created_at", start).lte("created_at", end),
    supabase.from("leads").select("id,created_at").eq("project_id", projectId).gte("created_at", start).lte("created_at", end),
    supabase.from("usage_events").select("input_tokens,output_tokens,embedding_tokens,estimated_cost,created_at").eq("project_id", projectId).gte("created_at", start).lte("created_at", end),
  ]);
  if (!project) notFound();
  const conversations = (conversationResult.data || []) as ConversationRow[]; const messages = (messageResult.data || []) as AnalyticsMessage[];
  const feedback = (feedbackResult.data || []) as FeedbackRow[]; const usage = calculateUsage((usageResult.data || []) as UsageRow[]);
  const questions = messages.filter(({ role }) => role === "user"); const answers = messages.filter(({ role }) => role === "assistant");
  const unanswered = answers.filter(({ is_unanswered }) => is_unanswered).length; const positive = feedback.filter(({ rating }) => rating === "positive").length; const negative = feedback.filter(({ rating }) => rating === "negative").length;
  const uniqueSessions = new Set(conversations.map(({ session_id }) => session_id)).size; const latency = averageLatency(answers);
  const daily = buildDailySeries(conversations, messages, Math.min(90, Math.max(1, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1)), new Date(`${to}T00:00:00.000Z`));
  const maxDaily = Math.max(1, ...daily.map(({ questions: count }) => count)); const topQuestions = commonQuestions(messages); const topSources = commonSources(messages);
  const answerRate = questions.length ? Math.round(((questions.length - unanswered) / questions.length) * 100) : 0;
  const metrics = [
    ["Conversations", conversations.length, MessageSquareText, "violet"], ["Unique sessions", uniqueSessions, UsersRound, "blue"],
    ["Visitor questions", questions.length, MessageCircleQuestion, "teal"], ["Assistant answers", answers.length, Bot, "violet"],
    ["Unanswered", unanswered, CircleHelp, "amber"], ["Leads collected", leadResult.data?.length || 0, UserRound, "teal"],
    ["Positive feedback", positive, ThumbsUp, "teal"], ["Negative feedback", negative, ThumbsDown, "amber"],
  ] as const;

  return <main className="page-wrap project-page"><ProjectHeader project={project as Project} active="analytics" />
    <section className="analytics-hero"><div><p className="eyebrow">Project analytics</p><h2>Understand usage and answer quality.</h2><p>Aggregated from project conversations only—without invasive visitor tracking.</p></div><form><label>From<input name="from" type="date" defaultValue={from} /></label><label>To<input name="to" type="date" defaultValue={to} /></label><button className="button button-secondary">Update</button></form></section>
    <div className="analytics-metrics">{metrics.map(([label, value, Icon, tone]) => <article key={label}><span className={`metric-icon ${tone}`}><Icon size={17} /></span><div><strong>{compact(value)}</strong><small>{label}</small></div></article>)}</div>
    <div className="analytics-grid"><section className="analytics-panel trend-panel"><header><div><p className="eyebrow">Activity trend</p><h2>Questions by day</h2></div><span>{from} — {to}</span></header><div className="trend-chart" role="img" aria-label="Daily visitor question volume">{daily.map((day) => <div key={day.date} title={`${day.date}: ${day.questions} questions`}><span style={{ height: `${Math.max(day.questions ? 8 : 2, (day.questions / maxDaily) * 100)}%` }} className={day.unanswered ? "has-unanswered" : ""}><i>{day.questions || ""}</i></span><small>{daily.length <= 14 || day.date.endsWith("01") || daily.indexOf(day) % 5 === 0 ? shortDate(day.date) : ""}</small></div>)}</div></section>
      <section className="analytics-panel quality-panel"><header><div><p className="eyebrow">Answer quality</p><h2>{answerRate}% answered</h2></div><BarChart3 size={20} /></header><div className="quality-ring" style={{ "--quality": `${answerRate * 3.6}deg` } as React.CSSProperties}><span><strong>{answerRate}%</strong><small>answer rate</small></span></div><ul><li><span>Answered questions</span><strong>{Math.max(0, questions.length - unanswered)}</strong></li><li><span>Unanswered questions</span><strong>{unanswered}</strong></li><li><span>Feedback response rate</span><strong>{answers.length ? Math.round((feedback.length / answers.length) * 100) : 0}%</strong></li></ul></section>
    </div>
    <div className="analytics-grid lower"><section className="analytics-panel ranking-panel"><header><div><p className="eyebrow">Visitor intent</p><h2>Most common questions</h2></div></header>{topQuestions.length ? <ol>{topQuestions.map((item, index) => <li key={`${item.question}-${index}`}><span>{index + 1}</span><p>{item.question}</p><strong>{item.count}×</strong></li>)}</ol> : <div className="analytics-empty">No questions in this date range.</div>}</section><section className="analytics-panel ranking-panel"><header><div><p className="eyebrow">Retrieval</p><h2>Most used knowledge</h2></div></header>{topSources.length ? <ol>{topSources.map((item, index) => <li key={`${item.title}-${index}`}><span>{index + 1}</span><p>{item.title}</p><strong>{item.count}×</strong></li>)}</ol> : <div className="analytics-empty">No retrieved sources in this date range.</div>}</section></div>
    <section className="analytics-panel usage-panel"><header><div><p className="eyebrow">AI usage</p><h2>Tokens, latency, and projected cost</h2></div><Coins size={20} /></header><div><article><Clock3 size={17} /><span><strong>{latency.toLocaleString()} ms</strong><small>average response latency</small></span></article><article><MessageCircleQuestion size={17} /><span><strong>{usage.inputTokens.toLocaleString()}</strong><small>input tokens</small></span></article><article><Bot size={17} /><span><strong>{usage.outputTokens.toLocaleString()}</strong><small>output tokens</small></span></article><article><Database size={17} /><span><strong>{usage.embeddingTokens.toLocaleString()}</strong><small>embedding tokens</small></span></article><article><Coins size={17} /><span><strong>${usage.estimatedCost.toFixed(6)}</strong><small>projected Luna cost</small></span></article></div><p>The estimate uses GPT-5.6 Luna standard short-context pricing. Use the calculator below to test cache savings and growth scenarios.</p></section>
    <UsageCalculator inputTokens={usage.inputTokens} outputTokens={usage.outputTokens} embeddingTokens={usage.embeddingTokens} title={`${project.name} Luna cost calculator`} />
  </main>;
}
