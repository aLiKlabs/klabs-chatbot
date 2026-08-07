import { NextResponse } from "next/server";
import { consumeWidgetRateLimit, requestAddress } from "@/lib/rate-limit/widget";
import { createServiceClient } from "@/lib/laravel/service";
import { feedbackSchema } from "@/lib/validation/widget";
import { getPublicWidgetProject } from "@/lib/widget/project";

export async function POST(request: Request) {
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  if (!consumeWidgetRateLimit(`feedback:${requestAddress(request)}`, 20).allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const supabase = createServiceClient();
  const widget = await getPublicWidgetProject(supabase, parsed.data.publicKey);
  if (!widget) return NextResponse.json({ error: "Chatbot unavailable." }, { status: 404 });
  const { data: message } = await supabase.from("messages").select("id,conversation_id").eq("id", parsed.data.messageId).eq("project_id", widget.project.id).eq("role", "assistant").single();
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  const { data: conversation } = await supabase.from("conversations").select("id").eq("id", message.conversation_id).eq("session_id", parsed.data.sessionId).single();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const { error } = await supabase.from("feedback").upsert({ project_id: widget.project.id, conversation_id: conversation.id, message_id: message.id, rating: parsed.data.rating }, { onConflict: "message_id" });
  if (error) return NextResponse.json({ error: "Feedback could not be saved." }, { status: 500 });
  return NextResponse.json({ success: true });
}
