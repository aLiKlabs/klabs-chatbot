// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608020001_initial_schema.sql"),
  "utf8",
);

describe("database security migration", () => {
  it("enables RLS on every project-owned table", () => {
    const tables = [
      "projects",
      "chatbot_settings",
      "chatbot_instructions",
      "project_domains",
      "knowledge_sources",
      "source_pages",
      "document_chunks",
      "conversations",
      "messages",
      "feedback",
      "leads",
      "ingestion_jobs",
      "usage_events",
    ];

    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("enforces project filtering inside vector search", () => {
    expect(migration).toContain("dc.project_id = target_project_id");
    expect(migration).toContain("ks.project_id = target_project_id");
    expect(migration).toContain("public.is_klabs_admin()");
  });

  it("keeps both storage buckets private", () => {
    expect(migration).toContain("'chatbot-documents', 'chatbot-documents', false");
    expect(migration).toContain("'chatbot-branding', 'chatbot-branding', false");
  });

  it("revokes anonymous table access and grants authenticated access explicitly", () => {
    expect(migration).toContain("from anon;");
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain("Data API exposure is disabled");
  });
});
