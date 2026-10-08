import "server-only";
import { redirect } from "next/navigation";
import { supabaseForRequest } from "./supabase/server";

/** The signed-in user, verified with the auth server (not just read from the cookie). */
export async function currentUser() {
  const sb = await supabaseForRequest();
  if (!sb) return { sb: null, user: null };
  const { data } = await sb.auth.getUser();
  return { sb, user: data.user ?? null };
}

export async function requireUser(next: string) {
  const { sb, user } = await currentUser();
  if (!sb || !user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return { sb, user };
}

/** Admin pages: signed in AND listed in private.admins (checked by the database). */
export async function requireAdmin() {
  const { sb, user } = await requireUser("/admin");
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (isAdmin !== true) redirect("/account?denied=1");
  return { sb, user };
}
