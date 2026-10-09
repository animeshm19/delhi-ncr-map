"use client";

import { isSaved, toggleSaved, useSaved } from "@/lib/saved";

/** Save / unsave a company on this device. */
export default function SaveButton({
  slug,
  name,
  variant = "icon",
}: {
  slug: string;
  name: string;
  /** "icon": a small bookmark; "chip": a labelled button */
  variant?: "icon" | "chip" | "btn";
}) {
  const saved = isSaved(useSaved(), slug);
  const label = saved ? `Remove ${name} from saved` : `Save ${name}`;
  return (
    <button
      type="button"
      className={`save-btn ${variant}${saved ? " on" : ""}${variant === "chip" ? " chip" : variant === "btn" ? " btn ghost small" : " icon-btn"}`}
      aria-pressed={saved}
      aria-label={variant === "icon" ? label : undefined}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSaved(slug);
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {variant !== "icon" && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
