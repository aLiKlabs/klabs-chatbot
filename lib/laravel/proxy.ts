import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdministrator } from "@/lib/env";
import { LARAVEL_TOKEN_COOKIE } from "@/lib/laravel/server";

export async function updateSession(request: NextRequest) {
  const token = request.cookies.get(LARAVEL_TOKEN_COOKIE)?.value;
  const protectedRoute = request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/projects");
  let user: { email?: string } | null = null;

  if (token) {
    try {
      const response = await fetch(`${process.env.LARAVEL_API_URL ?? "http://127.0.0.1:8000"}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
      });
      if (response.ok) user = (await response.json()).user ?? null;
    } catch {
      user = null;
    }
  }

  if (protectedRoute && (!user || !isAllowedAdministrator(user.email))) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (request.nextUrl.pathname === "/login" && user && isAllowedAdministrator(user.email)) {
    const url = request.nextUrl.clone(); url.pathname = "/dashboard"; url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request });
}
