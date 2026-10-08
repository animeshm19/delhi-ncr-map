/** Logo uploads: identify the file from its bytes, never from its name or declared type. */

export const MAX_LOGO_BYTES = 512 * 1024;

export type ImageKind = { ext: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) {
    return { ext: "png", mime: "image/png" };
  }
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export function checkLogo(bytes: Uint8Array): { ok: true; kind: ImageKind } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "Choose an image file." };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "Logos must be under 512 KB." };
  const kind = sniffImage(bytes);
  if (!kind) return { ok: false, error: "Logos must be PNG, JPEG or WebP images." };
  return { ok: true, kind };
}
