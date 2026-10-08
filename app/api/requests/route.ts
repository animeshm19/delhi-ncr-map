import { createHash } from "node:crypto";
import { supabase } from "@/lib/data";
import { parseRequest, publicError } from "@/lib/requests";

export const dynamic = "force-dynamic";
const MAX_BODY = 16_000;

/**
 * Receives edit / claim / removal / submit requests and hands them to the
 * database's submit_request() function, which validates and rate-limits them again.
 * Nothing is published automatically: every request waits in review_queue.
 */
export async function POST(req: Request) {
  if (!supabase) return Response.json({ error: "Requests are not configured on this deployment." }, { status: 503 });
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ error: "Expected JSON." }, { status: 415 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Request is too long." }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseRequest(body);
  if (parsed.ok === "spam") return Response.json({ ok: true, id: 0 });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const { type, slug, contact, payload } = parsed.value;

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = ip ? createHash("sha256").update(`${ip}|${day}|delhi-ncr-map`).digest("hex").slice(0, 32) : null;

  const { data, error } = await supabase.rpc("submit_request", {
    p_type: type,
    p_org_slug: slug,
    p_payload: payload,
    p_contact: contact,
    p_ip_hash: ipHash,
  });
  if (error) {
    const e = publicError(error.message);
    return Response.json({ error: e.error }, { status: e.status });
  }
  return Response.json({ ok: true, id: data });
}
