import "server-only";
import { logoUrl, websiteHost } from "@/lib/logos";
import type { Org } from "@/lib/types";

const MAX_BYTES = 200_000;
/** Smaller icons (16 px, Google's "no icon" globe) look blurry as logos: initials are shown instead. */
const MIN_SIZE = 32;

export type LogoImage = { type: string; bytes: Uint8Array<ArrayBuffer> };

/**
 * The image bytes of an organisation's website icon, through Google's public favicon service
 * (one fixed host, so nothing here can be pointed elsewhere). Null when there's no usable icon.
 */
export async function fetchSiteIcon(website?: string | null): Promise<LogoImage | null> {
  const host = websiteHost(website);
  if (!host) return null;
  return fetchImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, true);
}

/** The bytes of an organisation's logo: uploaded first, then its website icon. */
export async function fetchOrgLogo(o: Pick<Org, "logo_path" | "website">): Promise<LogoImage | null> {
  const uploaded = logoUrl(o.logo_path);
  if (uploaded) return fetchImage(uploaded, false);
  return fetchSiteIcon(o.website);
}

async function fetchImage(url: string, checkSize: boolean): Promise<LogoImage | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000), next: { revalidate: 2_592_000 } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!/^image\/(png|x-icon|vnd\.microsoft\.icon|jpeg|webp|gif)$/.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
    if (checkSize) {
      const size = imageSize(bytes);
      if (size && size < MIN_SIZE) return null;
    }
    return { type, bytes };
  } catch {
    return null;
  }
}

/** Width of a PNG, or the largest entry of an ICO; null if unknown. */
export function imageSize(b: Uint8Array): number | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  }
  if (b.length > 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    const n = b[4] | (b[5] << 8);
    let max = 0;
    for (let i = 0; i < n && 6 + i * 16 < b.length; i++) max = Math.max(max, b[6 + i * 16] || 256);
    return max;
  }
  return null;
}
