import { NextResponse, type NextRequest } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-shared";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The magic link lands here with a one-time code; swap it for a session cookie. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const sb = await supabaseForRequest();
  if (!code || !sb) return NextResponse.redirect(new URL("/signin?error=1", SITE_URL));
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/signin?error=1", SITE_URL));
  return NextResponse.redirect(new URL(next, SITE_URL));
}
