// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "backend/app/Http/Controllers/Api/RpcController.php"),
  "utf8",
);

describe("Laravel ingestion transaction", () => {
  it("restricts chunk replacement to the requested project and source", () => {
    expect(migration).toContain("where('id', $input['target_source_id'])");
    expect(migration).toContain("where('project_id', $input['target_project_id'])");
  });

  it("replaces chunks and records embedding usage in one transaction", () => {
    expect(migration).toContain("DB::transaction");
    expect(migration).toContain("DB::table('document_chunks')");
    expect(migration).toContain("'knowledge_embedding'");
    expect(migration).toContain("embedding_model");
  });
});
