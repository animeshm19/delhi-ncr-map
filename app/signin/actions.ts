"use server";

import { supabaseForRequest } from "@/lib/supabase/server";
import { EMAIL_RE, safeNext } from "@/lib/auth-shared";
import { SITE_URL } from "@/lib/site";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: "error", message: "Enter a valid email address." };
  const sb = await supabaseForRequest();
  if (!sb) return { status: "error", message: "Sign-in isn't configured on this deployment." };
  const next = safeNext(String(form.get("next") ?? ""));
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    const limited = /rate|too many|security purposes/i.test(error.message);
    return { status: "error", message: limited ? "Too many sign-in emails. Wait a minute and try again." : "Couldn't send the email. Try again shortly." };
  }
  // Same answer whether or not the address has any role, so the form can't be used to probe who's an admin.
  return { status: "sent" };
}
