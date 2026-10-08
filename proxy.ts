import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps the Supabase session cookie fresh on the signed-in parts of the site.
 * Public pages don't run this, so they stay static and fast.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await sb.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/account/:path*", "/admin/:path*"] };
