// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608020002_ingestion_hardening.sql"),
  "utf8",
);

describe("ingestion transaction migration", () => {
  it("restricts chunk replacement to administrators and the requested project", () => {
    expect(migration).toContain("if not public.is_klabs_admin()");
    expect(migration).toContain("id = target_source_id and project_id = target_project_id");
    expect(migration).toContain("revoke all on function public.replace_source_chunks");
  });

  it("replaces chunks and records embedding usage in one transaction", () => {
    expect(migration).toContain("delete from public.document_chunks");
    expect(migration).toContain("insert into public.document_chunks");
    expect(migration).toContain("'knowledge_embedding'");
    expect(migration).toContain("embedding_model");
  });
});
