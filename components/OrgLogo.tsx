"use client";

import { useEffect, useRef, useState } from "react";

/** Our /logo/ route answers "no logo" with a 1-pixel image (uploaded logos are never judged by size). */
export function isBlank(img: HTMLImageElement) {
  return new URL(img.src, window.location.href).pathname.startsWith("/logo/") && img.naturalWidth <= 1;
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
  const ref = useRef<HTMLImageElement>(null);
  // A new logo gets a fresh chance; then, since the image may finish loading before React attaches
  // onLoad (cache, fast networks), check it once mounted. (Effects run in this order.)
  useEffect(() => {
    const img = ref.current;
    setFailed(Boolean(img?.complete && isBlank(img)));
  }, [src]);
  const style = { width: size, height: size, "--c": color } as React.CSSProperties;
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        className={`org-logo photo ${className}`}
        src={src}
        alt=""
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={style}
        onError={() => setFailed(true)}
        // Our logo route answers "no logo" with a 1-pixel image.
        onLoad={(e) => isBlank(e.currentTarget) && setFailed(true)}
      />
    );
  }
  return (
    <span className={`org-logo initials ${className}`} style={{ ...style, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials(name)}
    </span>
  );
}
