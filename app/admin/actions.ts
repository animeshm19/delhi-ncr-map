"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const id = (f: FormData) => {
  const n = Number(f.get("id"));
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("bad request id");
  return n;
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(result: { error: { message: string } | null }, ok: string) {
  if (result.error) {
    const m = result.error.message;
    const safe = /^(invalid slug|slug already exists|unknown area|request already reviewed|a source is required for this change|invalid url|field \w+ cannot be edited|wrong request type|unknown organisation)/.exec(m);
    redirect(`/admin?error=${encodeURIComponent(safe ? safe[0] : "That didn't work.")}`);
  }
  revalidatePath("/", "layout");
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
