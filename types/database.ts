export type ProjectStatus = "draft" | "active" | "paused" | "archived";

export interface Project {
  id: string;
  name: string;
  slug: string;
  public_key: string;
  website_url: string;
  status: ProjectStatus;
  default_language: string;
  supported_languages: string[];
  timezone: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type KnowledgeSourceType =
  | "website"
  | "webpage"
  | "pdf"
  | "docx"
  | "text"
  | "faq"
  | "manual";

export type KnowledgeSourceStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "disabled";

export interface KnowledgeSource {
  id: string;
  project_id: string;
  source_type: KnowledgeSourceType;
  name: string;
  original_url: string | null;
  storage_path: string | null;
  status: KnowledgeSourceStatus;
  checksum: string | null;
  content_hash: string | null;
  error_message: string | null;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  document_chunks?: Array<{ count: number }>;
}
