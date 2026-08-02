import { createClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "@/lib/env";

export function createServiceClient() {
  const environment = getServerEnvironment();
  if (!environment.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for public widget endpoints.");
  }
  return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
