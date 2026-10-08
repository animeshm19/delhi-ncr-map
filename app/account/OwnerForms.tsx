"use client";

import { useActionState } from "react";
import { updateProfile, uploadLogo, type FormState } from "./actions";

type Profile = {
  slug: string;
  one_liner: string | null;
  website: string | null;
  hiring: boolean | null;
  job_board: { provider: string; handle: string } | null;
  careers_url: string | null;
};

const idle: FormState = { status: "idle" };

function Status({ s }: { s: FormState }) {
  if (s.status === "idle") return null;
  return (
    <p className={s.status === "ok" ? "success" : "error"} role={s.status === "ok" ? "status" : "alert"}>
      {s.message}
    </p>
  );
}

export default function OwnerForms({ org }: { org: Profile }) {
  const [detailsState, detailsAction, savingDetails] = useActionState(updateProfile.bind(null, org.slug), idle);
  const [logoState, logoAction, savingLogo] = useActionState(uploadLogo.bind(null, org.slug), idle);
  return (
    <>
      <h2>Profile details</h2>
      <form action={detailsAction} className="form" data-testid="owner-details">
        <label>
          <span>One-line description</span>
          <textarea name="one_liner" rows={3} maxLength={280} defaultValue={org.one_liner ?? ""} />
          <small className="muted">What the company does, in plain words. 280 characters.</small>
        </label>
        <label>
          <span>Website</span>
          <input name="website" type="url" defaultValue={org.website ?? ""} placeholder="https://" />
        </label>
        <label className="check">
          <input name="hiring" type="checkbox" defaultChecked={!!org.hiring} />
          <span>We&apos;re hiring</span>
        </label>
        <label>
          <span>Careers page</span>
          <input name="careers_url" type="url" defaultValue={org.careers_url ?? ""} placeholder="https://" />
          <small className="muted">Shown on your profile and the hiring board. Use this if you hire through Keka, Darwinbox, Zoho or similar.</small>
        </label>
        <label>
          <span>Public job board</span>
          <select name="job_board_provider" defaultValue={org.job_board?.provider ?? ""}>
            <option value="">None</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
          <small className="muted">Open roles are read from it once a day and listed on the hiring board.</small>
        </label>
        <label>
          <span>Job board handle</span>
          <input name="job_board_handle" defaultValue={org.job_board?.handle ?? ""} placeholder="e.g. spinny in jobs.lever.co/spinny" maxLength={80} pattern="[A-Za-z0-9_.\-]*" />
        </label>
        <Status s={detailsState} />
        <button className="btn" type="submit" disabled={savingDetails}>
          {savingDetails ? "Saving…" : "Save details"}
        </button>
      </form>

      <h2>Logo</h2>
      <form action={logoAction} className="form" data-testid="owner-logo">
        <label>
          <span>Upload a logo</span>
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
          <small className="muted">PNG, JPEG or WebP, under 512 KB. Square works best.</small>
        </label>
        <Status s={logoState} />
        <button className="btn" type="submit" disabled={savingLogo}>
          {savingLogo ? "Uploading…" : "Upload logo"}
        </button>
      </form>
    </>
  );
}
