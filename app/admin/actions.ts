"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runJobSync } from "@/lib/job-sync";
import { isHttpUrl } from "@/lib/requests";
import { istLocalToIso } from "@/lib/time";

const id = (f: FormData) => {
  const n = Number(f.get("id"));
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("bad request id");
  return n;
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(result: { error: { message: string } | null }, ok: string) {
  if (result.error) {
    const m = result.error.message;
    const safe = /^(invalid slug|slug already exists|unknown area|request already reviewed|a source is required for this change|invalid url|field \w+ cannot be edited|wrong request type|unknown organisation|unknown job board|invalid job board handle|a title is required|a link to the event page is required|invalid date|event date is out of range|invalid end time|unknown event)/.exec(m);
    redirect(`/admin?error=${encodeURIComponent(safe ? safe[0] : "That didn't work.")}`);
  }
  revalidatePath("/", "layout");
  // Feeds are route handlers, refreshed separately from pages.
  for (const feed of ["/events.ics", "/feed.xml"]) revalidatePath(feed);
  redirect(`/admin?done=${encodeURIComponent(ok)}`);
}

export async function approveSubmission(form: FormData) {
  const { sb } = await requireAdmin();
  const sectors = str(form, "sectors").split(",").map((s) => s.trim()).filter(Boolean);
  const org = {
    slug: str(form, "slug"),
    name: str(form, "name"),
    kind: str(form, "kind") || "company",
    one_liner: str(form, "one_liner"),
    website: str(form, "website"),
    municipality: str(form, "municipality"),
    area: str(form, "area"),
    sectors,
    source: str(form, "source"),
  };
  done(await sb.rpc("admin_approve_submission", { p_request_id: id(form), p_org: org }), `Published ${org.name || org.slug}.`);
}

const EDITABLE = new Set(["name", "one_liner", "website", "founded_year", "sectors", "status", "funding_note", "area", "municipality", "published"]);

export async function applyEdit(form: FormData) {
  const { sb } = await requireAdmin();
  const field = str(form, "field");
  if (!EDITABLE.has(field)) redirect(`/admin?error=${encodeURIComponent("Pick a field to change.")}`);
  const raw = str(form, "value");
  const value = field === "sectors" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : field === "published" ? raw === "true" : raw;
  done(
    await sb.rpc("admin_apply_edit", { p_request_id: id(form), p_slug: str(form, "slug"), p_changes: { [field]: value }, p_source: str(form, "source") }),
    "Change applied.",
  );
}

export async function approveClaim(form: FormData) {
  const { sb } = await requireAdmin();
  done(await sb.rpc("admin_approve_claim", { p_request_id: id(form) }), "Claim approved. They can now sign in and edit the profile.");
}

export async function reject(form: FormData) {
  const { sb } = await requireAdmin();
  done(await sb.rpc("admin_reject", { p_request_id: id(form), p_note: str(form, "note") }), "Request rejected.");
}

export async function setHiring(form: FormData) {
  const { sb } = await requireAdmin();
  const careers = str(form, "careers_url");
  if (careers && !isHttpUrl(careers)) redirect(`/admin?error=${encodeURIComponent("invalid url")}#hiring`);
  const provider = str(form, "job_board_provider");
  const hiring = str(form, "hiring");
  const changes: Record<string, unknown> = {
    careers_url: careers,
    job_board_provider: provider,
    job_board_handle: provider ? str(form, "job_board_handle") : "",
  };
  if (hiring === "yes" || hiring === "no") changes.hiring = hiring === "yes";
  done(await sb.rpc("admin_set_hiring", { p_slug: str(form, "slug"), p_changes: changes }), "Hiring details saved.");
}

export async function syncJobsNow() {
  await requireAdmin();
  let message: string;
  try {
    const r = await runJobSync();
    message = `Read ${r.boards} job boards: ${r.roles} open roles${r.failed ? `, ${r.failed} boards failed` : ""}.`;
  } catch {
    redirect(`/admin?error=${encodeURIComponent("The job sync isn't configured.")}`);
  }
  revalidatePath("/", "layout");
  redirect(`/admin?done=${encodeURIComponent(message)}`);
}

export async function publishEvent(form: FormData) {
  const { sb } = await requireAdmin();
  const starts = istLocalToIso(str(form, "starts_at"));
  if (!starts) redirect(`/admin?error=${encodeURIComponent("invalid date")}`);
  const endsRaw = str(form, "ends_at");
  const ends = endsRaw ? istLocalToIso(endsRaw) : "";
  if (ends === null) redirect(`/admin?error=${encodeURIComponent("invalid end time")}`);
  const event = {
    title: str(form, "title"),
    starts_at: starts,
    ends_at: ends,
    venue: str(form, "venue"),
    area: str(form, "area"),
    city: str(form, "city"),
    url: str(form, "url"),
    organizer: str(form, "organizer"),
    description: str(form, "description"),
  };
  done(await sb.rpc("admin_publish_event", { p_request_id: id(form), p_event: event }), `Published “${event.title}”.`);
}

export async function unpublishEvent(form: FormData) {
  const { sb } = await requireAdmin();
  done(await sb.rpc("admin_unpublish_event", { p_event_id: id(form) }), "Event taken down.");
}
