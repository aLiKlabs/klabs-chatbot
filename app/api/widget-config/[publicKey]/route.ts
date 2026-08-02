import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicWidgetProject, isApprovedWidgetPage, localized } from "@/lib/widget/project";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await context.params;
  const pageUrl = new URL(request.url).searchParams.get("pageUrl") || undefined;
  try {
    const widget = await getPublicWidgetProject(createServiceClient(), publicKey);
    if (!widget || !isApprovedWidgetPage(pageUrl, widget.project.website_url, widget.domains)) {
      return NextResponse.json({ error: "Chatbot unavailable." }, { status: 404 });
    }
    const language = new URL(request.url).searchParams.get("language") === "ar" ? "ar" : widget.project.default_language === "ar" ? "ar" : "en";
    const { settings, instructions, project } = widget;
    return NextResponse.json({
      projectName: project.name,
      language,
      supportedLanguages: project.supported_languages,
      botName: settings.bot_name,
      welcomeMessage: localized(settings.welcome_message, language, language === "ar" ? "مرحباً! كيف يمكنني مساعدتك؟" : "Hello! How can I help you?"),
      placeholderText: localized(settings.placeholder_text, language, language === "ar" ? "اكتب رسالتك…" : "Type your message…"),
      primaryColor: settings.primary_color,
      secondaryColor: settings.secondary_color,
      textColor: settings.text_color,
      launcherPosition: settings.launcher_position,
      launcherIcon: settings.launcher_icon,
      logoUrl: settings.logo_url,
      avatarUrl: settings.avatar_url,
      borderRadius: settings.border_radius,
      showBranding: settings.show_branding,
      suggestedQuestions: Array.isArray(settings.suggested_questions?.[language]) ? settings.suggested_questions[language] : [],
      contact: {
        email: settings.contact_email,
        phone: settings.contact_phone,
        whatsapp: settings.whatsapp_number,
        pageUrl: settings.contact_page_url,
        label: localized(settings.contact_button_label, language, language === "ar" ? "تواصل مع الفريق" : "Contact the team"),
      },
      privacyUrl: settings.privacy_url,
      termsUrl: settings.terms_url,
      showSources: Boolean(instructions.citation_mode),
      collectLeads: Boolean(settings.collect_leads),
      requireLeadConsent: Boolean(settings.require_lead_consent),
    }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Widget configuration failed", { category: "widget-config", error });
    return NextResponse.json({ error: "Chatbot unavailable." }, { status: 503 });
  }
}
