import { notFound } from "next/navigation";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { ProjectHeader } from "@/components/admin/project-header";
import { ChatbotTester } from "@/components/chatbot/chatbot-tester";
import { createClient } from "@/lib/laravel/server";
import type { Project } from "@/types/database";

type Localized = Record<string, string>;

function localized(value: unknown, language: string, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const messages = value as Localized;
  if (messages[language]) return messages[language];
  if (language === "ar") return fallback;
  return messages.en || Object.values(messages).find(Boolean) || fallback;
}

export default async function TestingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const [{ data: projectData }, { data: settings }, { data: sources }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("chatbot_settings").select("*").eq("project_id", projectId).single(),
    supabase
      .from("knowledge_sources")
      .select("name")
      .eq("project_id", projectId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  if (!projectData || !settings) notFound();
  const project = projectData as Project;
  const configuredSuggestions = settings.suggested_questions as Record<string, string[]> | null;
  const englishSourceSuggestions = (sources || []).map(({ name }: { name: string }) => `What does the knowledge say about ${name}?`);
  const arabicSourceSuggestions = (sources || []).map(({ name }: { name: string }) => `ماذا تقول قاعدة المعرفة عن ${name}؟`);
  const englishSuggestions = configuredSuggestions?.en?.filter(Boolean) || [];
  const arabicSuggestions = configuredSuggestions?.ar?.filter(Boolean) || [];

  return (
    <main className="page-wrap project-page testing-page">
      <ProjectHeader project={project} active="testing" />
      <section className="testing-hero">
        <div><p className="eyebrow">Phase 3 · Live testing</p><h2>Ask the assistant using this project’s knowledge.</h2><p>Every answer is retrieved only from ready sources belonging to this project. Missing information uses a safe fallback.</p></div>
        <span><FlaskConical size={22} /><strong>Private preview</strong><small>Debug details are visible only to administrators.</small></span>
      </section>
      {process.env.MOCK_EMBEDDINGS === "true" && (
        <div className="mock-mode-banner"><ShieldCheck size={16} /><span><strong>Free local answer mode is active.</strong> Answers are extracted from matching verified text without OpenAI charges.</span></div>
      )}
      <ChatbotTester
        projectId={projectId}
        botName={settings.bot_name || "Website Assistant"}
        defaultLanguage={project.default_language === "ar" ? "ar" : "en"}
        welcomeMessages={{
          en: localized(settings.welcome_message, "en", "Hello! How can I help you today?"),
          ar: localized(settings.welcome_message, "ar", "مرحباً! كيف يمكنني مساعدتك اليوم؟"),
        }}
        placeholderTexts={{
          en: localized(settings.placeholder_text, "en", "Ask about the website…"),
          ar: localized(settings.placeholder_text, "ar", "اسأل عن الموقع…"),
        }}
        primaryColor={settings.primary_color || "#6758E8"}
        suggestions={{
          en: (englishSuggestions.length ? englishSuggestions : englishSourceSuggestions).slice(0, 3),
          ar: (arabicSuggestions.length ? arabicSuggestions : arabicSourceSuggestions).slice(0, 3),
        }}
        mockMode={process.env.MOCK_EMBEDDINGS === "true"}
      />
    </main>
  );
}
