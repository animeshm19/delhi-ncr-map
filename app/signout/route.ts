import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** POST only, so a link or image elsewhere can't sign people out. */
export async function POST() {
  const sb = await supabaseForRequest();
  await sb?.auth.signOut();
  return NextResponse.redirect(new URL("/", SITE_URL), { status: 303 });
}
