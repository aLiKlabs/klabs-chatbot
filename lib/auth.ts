import { cache } from "react";
import { redirect } from "next/navigation";
import { isAllowedAdministrator } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const getAdministrator = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAllowedAdministrator(data.user.email)) {
    return null;
  }

  return data.user;
});

export async function requireAdministrator() {
  const administrator = await getAdministrator();
  if (!administrator) redirect("/login");
  return administrator;
}
