"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/laravel/server";
import { isAllowedAdministrator } from "@/lib/env";

export type LoginState = { error?: string };

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };
  if (!isAllowedAdministrator(email)) {
    return { error: "This account is not approved for K-Labs administration." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (/email or password is incorrect/i.test(error.message)) {
      return { error: "The email or password is incorrect." };
    }
    if (/not approved|administrator access/i.test(error.message)) {
      return { error: "This account is not approved for K-Labs administration." };
    }
    return { error: "The sign-in service is temporarily unavailable. Please try again." };
  }
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
