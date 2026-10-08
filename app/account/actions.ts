"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { checkLogo } from "@/lib/images";
import { isHttpUrl } from "@/lib/requests";

export type FormState = { status: "idle" | "ok" | "error"; message?: string };

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

function friendly(msg?: string) {
  if (!msg) return "Something went wrong.";
  if (msg.includes("forbidden")) return "You don't manage this profile.";
  for (const known of ["invalid url", "unknown job board", "invalid job board handle", "invalid logo path"]) {
    if (msg.includes(known)) return known[0].toUpperCase() + known.slice(1) + ".";
  }
  return "Couldn't save. Try again.";
}

export async function updateProfile(slug: string, _: FormState, form: FormData): Promise<FormState> {
  if (!SLUG_RE.test(slug)) return { status: "error", message: "Unknown profile." };
  const { sb } = await requireUser(`/account/${slug}`);
  const website = String(form.get("website") ?? "").trim();
  if (website && !isHttpUrl(website)) return { status: "error", message: "The website must start with https://." };
  const careers = String(form.get("careers_url") ?? "").trim();
  if (careers && !isHttpUrl(careers)) return { status: "error", message: "The careers page must start with https://." };
  const provider = String(form.get("job_board_provider") ?? "");
  const changes = {
    one_liner: String(form.get("one_liner") ?? "").slice(0, 280),
    website,
    hiring: form.get("hiring") === "on",
    careers_url: careers,
    job_board_provider: provider,
    job_board_handle: provider ? String(form.get("job_board_handle") ?? "").trim() : "",
  };
  const { error } = await sb.rpc("owner_update_org", { p_slug: slug, p_changes: changes });
  if (error) return { status: "error", message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { status: "ok", message: "Saved. The public profile updates within a minute." };
}

export async function uploadLogo(slug: string, _: FormState, form: FormData): Promise<FormState> {
  if (!SLUG_RE.test(slug)) return { status: "error", message: "Unknown profile." };
  const { sb } = await requireUser(`/account/${slug}`);
  const file = form.get("logo");
  if (!(file instanceof File)) return { status: "error", message: "Choose an image file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkLogo(bytes);
  if (!check.ok) return { status: "error", message: check.error };
  const path = `${slug}/logo.${check.kind.ext}`;
  const { error: upErr } = await sb.storage.from("logos").upload(path, bytes, { contentType: check.kind.mime, upsert: true });
  if (upErr) return { status: "error", message: "Upload refused. Only the profile's owner can change its logo." };
  const { error } = await sb.rpc("owner_update_org", { p_slug: slug, p_changes: { logo_path: `${path}?v=${Date.now()}` } });
  if (error) return { status: "error", message: friendly(error.message) };
  revalidatePath("/", "layout");
  return { status: "ok", message: "Logo updated." };
}
