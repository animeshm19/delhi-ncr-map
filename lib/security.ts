/**
 * Security headers for every response. Kept in one pure module so tests can
 * check the policy without a running server.
 */

const TILE_HOST = "https://tiles.openfreemap.org";

/** Origins the browser may talk to besides our own. */
export function supabaseOrigin(url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ embeddable = false, supabase = supabaseOrigin() } = {}) {
  const sb = supabase ? ` ${supabase}` : "";
  const directives: Record<string, string> = {
    "default-src": "'self'",
    // Next.js inlines its bootstrap payload, so inline scripts are needed without per-request nonces
    // (which would make every page dynamic). No eval, no third-party script hosts.
    "script-src": "'self' 'unsafe-inline'",
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${TILE_HOST}${sb}`,
    "font-src": "'self'",
    "connect-src": `'self' ${TILE_HOST}${sb}`,
    "worker-src": "'self' blob:",
    "child-src": "'self' blob:",
    "frame-src": "'none'",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": embeddable ? "*" : "'none'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
}

export function securityHeaders({ embeddable = false } = {}) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ embeddable }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (!embeddable) headers.push({ key: "X-Frame-Options", value: "DENY" });
  return headers;
}
