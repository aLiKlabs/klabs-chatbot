import Link from "next/link";
import { Activity, BarChart3, Bot, CircleHelp, Coins, FolderKanban, MessageCircleQuestion, MessageSquareText, UserRound } from "lucide-react";
import { buildDailySeries, calculateUsage, type AnalyticsMessage, type UsageRow } from "@/lib/analytics";
import { UsageCalculator } from "@/components/admin/usage-calculator";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

type ConversationRow = { id: string; project_id: string; started_at: string };
type WorkspaceMessage = AnalyticsMessage & { project_id: string };

function validDate(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
function shortDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`)); }
function compact(value: number) { return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }

export default async function WorkspaceAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const today = new Date();
  const defaultFromDate = new Date(today); defaultFromDate.setDate(defaultFromDate.getDate() - 29);
  const from = validDate(query.from) || defaultFromDate.toISOString().slice(0, 10);
  const to = validDate(query.to) || today.toISOString().slice(0, 10);
  const start = `${from}T00:00:00.000Z`; const end = `${to}T23:59:59.999Z`;
  const supabase = await createClient();

  const [projectResult, conversationResult, messageResult, feedbackResult, leadResult, usageResult] = await Promise.all([
    supabase.from("projects").select("*").neq("status", "archived").order("name"),
    supabase.from("conversations").select("id,project_id,started_at").gte("started_at", start).lte("started_at", end),
    supabase.from("messages").select("project_id,role,content,is_unanswered,latency_ms,sources,created_at").gte("created_at", start).lte("created_at", end),
    supabase.from("feedback").select("rating,created_at").gte("created_at", start).lte("created_at", end),
    supabase.from("leads").select("id,created_at").gte("created_at", start).lte("created_at", end),
    supabase.from("usage_events").select("input_tokens,output_tokens,embedding_tokens,estimated_cost,created_at").gte("created_at", start).lte("created_at", end),
  ]);

  const projects = (projectResult.data || []) as Project[];
  const conversations = (conversationResult.data || []) as ConversationRow[];
  const messages = (messageResult.data || []) as WorkspaceMessage[];
  const questions = messages.filter(({ role }) => role === "user");
  const answers = messages.filter(({ role }) => role === "assistant");
  const unanswered = answers.filter(({ is_unanswered }) => is_unanswered).length;
  const usage = calculateUsage((usageResult.data || []) as UsageRow[]);
  const days = Math.min(90, Math.max(1, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1));
  const daily = buildDailySeries(conversations, messages, days, new Date(`${to}T00:00:00.000Z`));
  const maxDaily = Math.max(1, ...daily.map(({ questions: count }) => count));
  const answerRate = questions.length ? Math.round(((questions.length - unanswered) / questions.length) * 100) : 0;
  const metrics = [
    ["Active projects", projects.filter(({ status }) => status === "active").length, FolderKanban, "violet"],
    ["Conversations", conversations.length, MessageSquareText, "blue"],
    ["Visitor questions", questions.length, MessageCircleQuestion, "teal"],
    ["Unanswered", unanswered, CircleHelp, "amber"],
    ["Leads collected", leadResult.data?.length || 0, UserRound, "teal"],
    ["Feedback received", feedbackResult.data?.length || 0, Activity, "violet"],
  ] as const;
  const projectRows = projects.map((project) => {
    const projectConversations = conversations.filter(({ project_id }) => project_id === project.id).length;
    const projectQuestions = questions.filter(({ project_id }) => project_id === project.id);
    const projectUnanswered = answers.filter(({ project_id, is_unanswered }) => project_id === project.id && is_unanswered).length;
    return { project, conversations: projectConversations, questions: projectQuestions.length, answerRate: projectQuestions.length ? Math.round(((projectQuestions.length - projectUnanswered) / projectQuestions.length) * 100) : 0 };
  }).sort((a, b) => b.questions - a.questions || a.project.name.localeCompare(b.project.name));

  return <main className="page-wrap">
    <section className="analytics-hero workspace-analytics-hero"><div><p className="eyebrow">Workspace analytics</p><h1>Performance across every chatbot.</h1><p>Compare project activity, answer coverage, leads, and AI usage from one place.</p></div><form><label>From<input name="from" type="date" defaultValue={from} /></label><label>To<input name="to" type="date" defaultValue={to} /></label><button className="button button-secondary">Update</button></form></section>
    <div className="workspace-analytics-metrics">{metrics.map(([label, value, Icon, tone]) => <article key={label}><span className={`metric-icon ${tone}`}><Icon size={18} /></span><div><strong>{compact(value)}</strong><small>{label}</small></div></article>)}</div>
    <div className="analytics-grid"><section className="analytics-panel trend-panel"><header><div><p className="eyebrow">Workspace activity</p><h2>Questions by day</h2></div><span>{from} — {to}</span></header><div className="trend-chart" role="img" aria-label="Daily visitor questions across all projects">{daily.map((day, index) => <div key={day.date} title={`${day.date}: ${day.questions} questions`}><span style={{ height: `${Math.max(day.questions ? 8 : 2, (day.questions / maxDaily) * 100)}%` }} className={day.unanswered ? "has-unanswered" : ""}><i>{day.questions || ""}</i></span><small>{daily.length <= 14 || day.date.endsWith("01") || index % 5 === 0 ? shortDate(day.date) : ""}</small></div>)}</div></section>
      <section className="analytics-panel quality-panel"><header><div><p className="eyebrow">Answer coverage</p><h2>{answerRate}% answered</h2></div><BarChart3 size={20} /></header><div className="quality-ring" style={{ "--quality": `${answerRate * 3.6}deg` } as React.CSSProperties}><span><strong>{answerRate}%</strong><small>answer rate</small></span></div><ul><li><span>Assistant answers</span><strong>{answers.length}</strong></li><li><span>Unanswered questions</span><strong>{unanswered}</strong></li><li><span>Estimated API cost</span><strong>${usage.estimatedCost.toFixed(4)}</strong></li></ul></section></div>
    <section className="analytics-panel workspace-project-performance"><header><div><p className="eyebrow">Project comparison</p><h2>Chatbot performance</h2></div><Bot size={20} /></header>{projectRows.length ? <div className="performance-table"><div className="performance-row performance-head"><span>Project</span><span>Status</span><span>Conversations</span><span>Questions</span><span>Answer rate</span><span /></div>{projectRows.map(({ project, conversations: count, questions: questionCount, answerRate: rate }) => <div className="performance-row" key={project.id}><span><strong>{project.name}</strong><small>{project.website_url}</small></span><span><i className={`status status-${project.status}`}>{project.status}</i></span><span>{count}</span><span>{questionCount}</span><span>{rate}%</span><Link href={`/projects/${project.id}/analytics`}>View <BarChart3 size={13} /></Link></div>)}</div> : <div className="analytics-empty">Create a project to start tracking workspace performance.</div>}</section>
    <section className="analytics-panel workspace-usage-strip"><header><div><p className="eyebrow">Combined AI usage</p><h2>Usage for this date range</h2></div><Coins size={20} /></header><div><span><strong>{usage.inputTokens.toLocaleString()}</strong><small>input tokens</small></span><span><strong>{usage.outputTokens.toLocaleString()}</strong><small>output tokens</small></span><span><strong>{usage.embeddingTokens.toLocaleString()}</strong><small>embedding tokens</small></span><span><strong>${usage.estimatedCost.toFixed(6)}</strong><small>projected Luna cost</small></span></div></section>
    <UsageCalculator inputTokens={usage.inputTokens} outputTokens={usage.outputTokens} embeddingTokens={usage.embeddingTokens} title="Workspace Luna cost calculator" />
  </main>;
}
