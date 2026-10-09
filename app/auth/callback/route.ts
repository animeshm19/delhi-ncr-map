import { NextResponse, type NextRequest } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-shared";

export const dynamic = "force-dynamic";

/**
 * The magic link lands here with a one-time code; swap it for a session cookie.
 * Redirects stay on the host the request came in on (`next` is already a same-site path).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const sb = await supabaseForRequest();
  if (!code || !sb) return NextResponse.redirect(new URL("/signin?error=1", request.url));
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/signin?error=1", request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
