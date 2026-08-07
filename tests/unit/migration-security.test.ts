// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "backend/database/migrations/2026_08_03_100000_create_chatbot_tables.php"),
  "utf8",
);
const routes = readFileSync(join(process.cwd(), "backend/routes/api.php"), "utf8");
const gateway = readFileSync(join(process.cwd(), "backend/app/Http/Controllers/Api/DataController.php"), "utf8");
const storage = readFileSync(join(process.cwd(), "backend/app/Http/Controllers/Api/StorageController.php"), "utf8");

describe("Laravel and MySQL security", () => {
  it("creates every project-owned table with Laravel migrations", () => {
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
      expect(migration).toContain(`Schema::create('${table}'`);
    }
  });

  it("protects data routes with Sanctum or the internal key", () => {
    expect(routes).toContain("middleware('auth:sanctum')");
    expect(routes).toContain("middleware('internal')");
  });

  it("keeps uploaded documents on Laravel private storage with path validation", () => {
    expect(storage).toContain("Storage::disk('local')");
    expect(storage).toContain("str_contains($path, '..')");
  });

  it("allowlists tables, columns, actions, and filters", () => {
    expect(gateway).toContain("private const TABLES");
    expect(gateway).toContain("Schema::hasColumn");
    expect(gateway).toContain("['select', 'insert', 'update', 'delete', 'upsert']");
  });
});
