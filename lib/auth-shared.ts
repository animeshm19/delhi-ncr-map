/** Auth helpers that don't touch the server runtime, so they can be unit-tested. */

/**
 * Where to send someone after sign-in. Only same-site paths are allowed, so a
 * crafted link can't bounce a fresh session to another site (open redirect).
 */
export function safeNext(next: string | null | undefined, fallback = "/account") {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

export const EMAIL_RE = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;
