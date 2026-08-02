import { NextResponse } from "next/server";
import { consumeWidgetRateLimit, requestAddress } from "@/lib/rate-limit/widget";
import { createServiceClient } from "@/lib/supabase/service";
import { leadSchema } from "@/lib/validation/widget";
import { getPublicWidgetProject } from "@/lib/widget/project";

export async function POST(request: Request) {
  const parsed = leadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid contact details." }, { status: 400 });
  if (!consumeWidgetRateLimit(`lead:${requestAddress(request)}`, 5, 15 * 60_000).allowed) return NextResponse.json({ error: "Too many requests. Please try later." }, { status: 429 });
  const supabase = createServiceClient(); const widget = await getPublicWidgetProject(supabase, parsed.data.publicKey);
  if (!widget || !widget.settings.collect_leads) return NextResponse.json({ error: "Contact form unavailable." }, { status: 404 });
  if (widget.settings.require_lead_consent && !parsed.data.consent) return NextResponse.json({ error: "Consent is required." }, { status: 400 });
  const { data: conversation } = await supabase.from("conversations").select("id").eq("project_id", widget.project.id).eq("session_id", parsed.data.sessionId).single();
  if (!conversation) return NextResponse.json({ error: "Start a conversation first." }, { status: 409 });
  const { error } = await supabase.from("leads").insert({ project_id: widget.project.id, conversation_id: conversation.id, name: parsed.data.name || null, email: parsed.data.email || null, phone: parsed.data.phone || null, message: parsed.data.message || null, consent: parsed.data.consent });
  if (error) return NextResponse.json({ error: "Your details could not be sent." }, { status: 500 });
  return NextResponse.json({ success: true });
}
