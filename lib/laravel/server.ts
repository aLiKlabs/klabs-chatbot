import { cookies } from "next/headers";
import { LaravelClient } from "@/lib/laravel/client";

export const LARAVEL_TOKEN_COOKIE = "klabs_admin_token";

export async function createClient() {
  const cookieStore = await cookies();
  return new LaravelClient({
    token: cookieStore.get(LARAVEL_TOKEN_COOKIE)?.value,
    onToken: async (token) => {
      if (token) {
        cookieStore.set(LARAVEL_TOKEN_COOKIE, token, {
          httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
        });
      } else {
        cookieStore.delete(LARAVEL_TOKEN_COOKIE);
      }
    },
  });
}
