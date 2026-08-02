import { PublicWidget } from "@/components/chatbot/public-widget";

export default async function EmbedPage({ params, searchParams }: { params: Promise<{ publicKey: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { publicKey } = await params; const query = await searchParams;
  const pageUrl = typeof query.pageUrl === "string" ? query.pageUrl : "";
  const language = typeof query.language === "string" ? query.language : "en";
  return <PublicWidget publicKey={publicKey} pageUrl={pageUrl} initialLanguage={language} />;
}
