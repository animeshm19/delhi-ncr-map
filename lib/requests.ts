/**
 * Validation for public requests (edit / claim / removal / submit).
 * Pure functions so they can be unit-tested; the database re-checks everything.
 */

export const REQUEST_TYPES = ["edit", "claim", "removal", "submit"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const MAX_FIELD = 1500;
export const MAX_FIELDS = 12;
export const MIN_FILL_MS = 3000;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const KEY_RE = /^[a-z_]{1,32}$/;
const EMAIL_RE = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,24}$/;

export type ParsedRequest = {
  type: RequestType;
  slug: string | null;
  contact: string;
  payload: Record<string, string>;
};

export type ParseResult =
  | { ok: true; value: ParsedRequest }
  | { ok: false; status: number; error: string }
  | { ok: "spam" };

/** Strip control characters (keeps newlines and tabs) and trim. */
export function cleanText(v: string, max = MAX_FIELD) {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function parseRequest(body: unknown, now = Date.now()): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Invalid request." };
  const b = body as Record<string, unknown>;

  // Spam traps: a hidden field humans never fill, and forms submitted impossibly fast.
  if (b.company_website_confirm) return { ok: "spam" };
  const startedAt = Number(b.started_at ?? 0);
  if (!Number.isFinite(startedAt) || !startedAt || now - startedAt < MIN_FILL_MS) {
    return { ok: false, status: 400, error: "That was quick. Please take a moment and try again." };
  }

  const type = String(b.type ?? "") as RequestType;
  if (!REQUEST_TYPES.includes(type)) return { ok: false, status: 400, error: "Unknown request type." };

  const needsOrg = type === "edit" || type === "claim" || type === "removal";
  const slug = needsOrg ? String(b.slug ?? "") : null;
  if (needsOrg && !SLUG_RE.test(slug!)) return { ok: false, status: 400, error: "Unknown organisation." };

  const contact = cleanText(String(b.contact ?? ""), 200).toLowerCase();
  if (!EMAIL_RE.test(contact)) return { ok: false, status: 400, error: "A valid email is required." };

  const fields = b.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { ok: false, status: 400, error: "Invalid request." };
  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (Object.keys(payload).length >= MAX_FIELDS) break;
    if (typeof v !== "string" || !KEY_RE.test(k)) continue;
    const t = cleanText(v);
    if (t) payload[k] = t;
  }
  for (const k of ["website", "source", "url"]) {
    if (payload[k] && !isHttpUrl(payload[k])) return { ok: false, status: 400, error: "Links must start with http:// or https://." };
  }
  return { ok: true, value: { type, slug, contact, payload } };
}

export function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Map database errors to messages that are safe to show. Anything unknown becomes generic. */
export function publicError(dbMessage: string | undefined) {
  const known = [
    "a valid email is required",
    "unknown organisation",
    "request is too long",
    "too many requests, try again later",
    "invalid request type",
  ];
  const m = known.find((k) => dbMessage?.includes(k));
  return m ? { status: 400, error: m[0].toUpperCase() + m.slice(1) + "." } : { status: 500, error: "Could not save the request." };
}
