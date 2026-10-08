"use client";

import { useState } from "react";
import { SECTORS } from "@/lib/taxonomy";
import type { RequestType } from "@/lib/requests";

type Field = {
  name: string;
  label: string;
  kind?: "text" | "textarea" | "select" | "url";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
};

const SECTOR_OPTIONS = Object.entries(SECTORS).map(([value, s]) => ({ value, label: s.label }));

const FIELDS: Record<RequestType, Field[]> = {
  edit: [
    {
      name: "field",
      label: "What should change?",
      kind: "select",
      required: true,
      options: [
        { value: "description", label: "Description" },
        { value: "website", label: "Website" },
        { value: "sector", label: "Sector" },
        { value: "founded", label: "Founding year" },
        { value: "location", label: "Office location" },
        { value: "status", label: "Status (acquired, closed…)" },
        { value: "funding", label: "Funding" },
        { value: "other", label: "Something else" },
      ],
    },
    { name: "correct_value", label: "What it should say", kind: "textarea", required: true },
    { name: "source", label: "Where can we check this?", kind: "url", hint: "A public page that states it. Edits with a source are reviewed first.", placeholder: "https://" },
  ],
  claim: [
    { name: "name", label: "Your name", required: true },
    { name: "role", label: "Your role at the organisation", required: true },
    { name: "note", label: "Anything you'd like to update after claiming", kind: "textarea" },
  ],
  removal: [
    {
      name: "what",
      label: "What should be removed?",
      kind: "select",
      required: true,
      options: [
        { value: "location", label: "The map pin / location" },
        { value: "detail", label: "A specific detail" },
        { value: "listing", label: "The whole listing" },
      ],
    },
    { name: "reason", label: "Reason", kind: "textarea", required: true },
  ],
  submit: [
    { name: "company_name", label: "Organisation name", required: true },
    { name: "website", label: "Website", kind: "url", required: true, placeholder: "https://" },
    {
      name: "city",
      label: "City",
      kind: "select",
      required: true,
      options: ["Gurugram", "Noida", "Delhi", "Faridabad", "Ghaziabad", "Other NCR"].map((c) => ({ value: c, label: c })),
    },
    { name: "sector", label: "Sector", kind: "select", options: SECTOR_OPTIONS },
    { name: "description", label: "What it does, in a sentence", kind: "textarea", required: true },
    { name: "office", label: "Office sector or area (optional)", hint: "e.g. Sector 44 or Udyog Vihar. Only the sector is ever shown, never a street address or a home." },
    { name: "source", label: "A public page that shows it's based here", kind: "url", placeholder: "https://" },
  ],
};

const TITLES: Record<RequestType, string> = {
  edit: "Send the correction",
  claim: "Claim this profile",
  removal: "Send the removal request",
  submit: "Submit for review",
};

export default function RequestForm({ type, slug, emailHint }: { type: RequestType; slug?: string; emailHint?: string }) {
  const [startedAt] = useState(() => Date.now());
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fields: Record<string, string> = {};
    for (const f of FIELDS[type]) fields[f.name] = String(form.get(f.name) ?? "");
    setState("sending");
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          slug,
          contact: form.get("contact"),
          fields,
          started_at: startedAt,
          company_website_confirm: form.get("company_website_confirm"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setState("done");
      setMessage(data.id ? `Reference #${data.id}.` : "");
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  }

  if (state === "done") {
    return (
      <div className="card" role="status">
        <h2 style={{ marginTop: 0 }}>Thanks, it&apos;s in the review queue.</h2>
        <p className="muted">A person checks every request against public sources before anything changes on the map. {message}</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} data-testid={`form-${type}`}>
      {FIELDS[type].map((f) => (
        <label key={f.name}>
          <span>
            {f.label}
            {f.required && <span className="req"> *</span>}
          </span>
          {f.kind === "textarea" ? (
            <textarea name={f.name} required={f.required} rows={4} maxLength={1500} placeholder={f.placeholder} />
          ) : f.kind === "select" ? (
            <select name={f.name} required={f.required} defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {f.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input name={f.name} type={f.kind === "url" ? "url" : "text"} required={f.required} maxLength={300} placeholder={f.placeholder} />
          )}
          {f.hint && <small className="muted">{f.hint}</small>}
        </label>
      ))}
      <label>
        <span>
          Your email<span className="req"> *</span>
        </span>
        <input name="contact" type="email" required maxLength={200} autoComplete="email" />
        <small className="muted">{emailHint ?? "Only used to follow up on this request. Never published."}</small>
      </label>
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <label className="hp" aria-hidden="true">
        <span>Leave this empty</span>
        <input name="company_website_confirm" tabIndex={-1} autoComplete="off" />
      </label>
      {state === "error" && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className="btn" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : TITLES[type]}
      </button>
    </form>
  );
}
