"use client";

import { useEffect, useRef, useState } from "react";

type Format = "post" | "story";

/**
 * Share an Instagram-ready card: preview it as a 4:5 post or a 9:16 story, then share it straight
 * to an app (phones), download it, or copy a ready-made caption and link.
 */
export default function ShareCard({
  query,
  link,
  caption,
  fileName,
  label = "Share",
  className = "chip",
  icon = true,
  ariaLabel,
  tags = "#DelhiNCR #Startups #StartupIndia",
}: {
  /** Card parameters for /card, e.g. "station=cyber-city&r=1000" or "c=spinny" */
  query: string;
  /** Path of the page the card points to, e.g. "/?station=cyber-city&r=1000" */
  link: string;
  caption: string;
  fileName: string;
  label?: string;
  className?: string;
  icon?: boolean;
  ariaLabel?: string;
  /** Hashtags, placed after the link */
  tags?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("post");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");
  const [canShareFiles, setCanShareFiles] = useState(false);

  const src = `/card?${query}${query ? "&" : ""}format=${format}`;
  const url = typeof window === "undefined" ? link : new URL(link, window.location.origin).toString();
  const fullCaption = `${caption}\n${url}\n\n${tags}`;

  useEffect(() => {
    try {
      const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] })));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  useEffect(() => setLoaded(false), [src]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const flash = (s: string) => {
    setStatus(s);
    window.setTimeout(() => setStatus(""), 2200);
  };
  const imageFile = async () => {
    const res = await fetch(src);
    if (!res.ok) throw new Error("card");
    return new File([await res.blob()], `${fileName}-${format}.png`, { type: "image/png" });
  };
  const download = async () => {
    try {
      const file = await imageFile();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      flash("Image saved");
    } catch {
      flash("Couldn't make the image, try again");
    }
  };
  const shareImage = async () => {
    try {
      const file = await imageFile();
      await navigator.clipboard?.writeText(fullCaption).catch(() => {});
      await navigator.share({ files: [file], text: fullCaption });
    } catch (e) {
      if ((e as Error).name !== "AbortError") flash("Sharing didn't work: download it instead");
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied`);
    } catch {
      flash("Copying is blocked in this browser");
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={ariaLabel} title={ariaLabel}>
        {icon && <ShareIcon />}
        {label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="share-modal"
          aria-label="Share as an image"
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === dialog.current && setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
        >
          <div className="share-inner">
            <header className="share-head">
              <div>
                <h2>Share as an image</h2>
                <p className="muted">Ready for Instagram posts and stories, WhatsApp and LinkedIn.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close" autoFocus>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </header>

            <div className="seg share-format" role="group" aria-label="Format">
              <button type="button" className="chip" aria-pressed={format === "post"} onClick={() => setFormat("post")}>Post 4:5</button>
              <button type="button" className="chip" aria-pressed={format === "story"} onClick={() => setFormat("story")}>Story 9:16</button>
            </div>

            <div className={`share-preview ${format}${loaded ? " loaded" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={src} src={src} alt="Preview of the share image" onLoad={() => setLoaded(true)} data-testid="share-preview" />
              {!loaded && <span className="share-loading" aria-hidden />}
            </div>

            <div className="share-actions">
              {canShareFiles && (
                <button type="button" className="btn" onClick={shareImage}>
                  <ShareIcon /> Share to Instagram…
                </button>
              )}
              <button type="button" className={canShareFiles ? "btn ghost" : "btn"} onClick={download}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                Download image
              </button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(fullCaption)}`} target="_blank" rel="noopener">WhatsApp</a>
            </div>

            <label className="share-caption">
              <span>Caption</span>
              <textarea readOnly value={fullCaption} rows={5} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className="share-actions small">
              <button type="button" className="btn ghost small" onClick={() => copy(fullCaption, "Caption")}>Copy caption</button>
              <button type="button" className="btn ghost small" onClick={() => copy(url, "Link")}>Copy link</button>
              <span className="share-status" role="status">{status}</span>
            </div>
            {!canShareFiles && (
              <p className="muted share-tip">
                On a phone, &ldquo;Share to Instagram&rdquo; sends the image straight to the app. Here, download it and upload it as a
                post or story; the caption is ready to paste.
              </p>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
