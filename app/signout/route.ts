import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST only, so a link or image elsewhere can't sign people out. */
export async function POST(request: Request) {
  const sb = await supabaseForRequest();
  await sb?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
