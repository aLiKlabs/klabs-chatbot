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
