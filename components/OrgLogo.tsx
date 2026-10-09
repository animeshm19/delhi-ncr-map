"use client";

import { useEffect, useRef, useState } from "react";

/** Our /logo/ route answers "no logo" with a 1-pixel image (uploaded logos are never judged by size). */
export function isBlank(img: HTMLImageElement) {
  return new URL(img.src, window.location.href).pathname.startsWith("/logo/") && img.naturalWidth <= 1;
}

/**
 * How an icon reads on a white tile: "blank" (nothing visible, e.g. our 1-pixel "no logo"),
 * "light" (white or pale marks that vanish on white: shown on a dark tile instead) or "ok".
 * Only our own /logo/ images can be inspected; anything else counts as "ok".
 */
export function inspectLogo(img: HTMLImageElement): "blank" | "light" | "ok" {
  if (isBlank(img)) return "blank";
  if (!new URL(img.src, window.location.href).pathname.startsWith("/logo/")) return "ok";
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "ok";
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let opaque = 0;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;
      opaque++;
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 225) ink++;
    }
    if (opaque < 6) return "blank";
    return ink / opaque < 0.08 ? "light" : "ok";
  } catch {
    return "ok";
  }
}

export function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * An organisation's logo on a white tile, or its initials when there's no logo
 * (or the logo fails to load). Used everywhere an organisation is shown.
 */
export default function OrgLogo({
  name,
  src,
  size = 40,
  color,
  className = "",
  eager = false,
}: {
  name: string;
  src: string | null;
  size?: number;
  /** Tint for the initials tile, usually the sector colour */
  color?: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [light, setLight] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A new logo gets a fresh chance; then, since the image may finish loading before React attaches
  // onLoad (cache, fast networks), check it once mounted. (Effects run in this order.)
  const judge = (img: HTMLImageElement) => {
    const v = inspectLogo(img);
    setFailed(v === "blank");
    setLight(v === "light");
  };
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) judge(img);
    else {
      setFailed(false);
      setLight(false);
    }
  }, [src]);
  // Sizes in pixels (never percentages, which CSS would measure against the surrounding table or list).
  const style = { width: size, height: size, "--c": color } as React.CSSProperties;
  const pad = Math.max(2, Math.round(size * 0.12));
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        className={`org-logo photo${light ? " on-dark" : ""} ${className}`}
        src={src}
        alt=""
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={{ ...style, padding: pad }}
        onError={() => setFailed(true)}
        // Our logo route answers "no logo" with a 1-pixel image; pale icons go on a dark tile.
        onLoad={(e) => judge(e.currentTarget)}
      />
    );
  }
  return (
    <span className={`org-logo initials ${className}`} style={{ ...style, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials(name)}
    </span>
  );
}
