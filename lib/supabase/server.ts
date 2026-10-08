import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * A Supabase client acting as the signed-in visitor (or anonymous), using the
 * session cookie. Every query it makes is subject to row-level security.
 */
export async function supabaseForRequest() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component render, where cookies are read-only; the proxy refreshes them.
        }
      },
    },
  });
}
