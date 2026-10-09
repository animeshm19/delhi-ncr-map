/** Public URL for a stored logo path like "spinny/logo.png?v=123". Safe on the client. */
export function logoUrl(path?: string | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base || !/^[a-z0-9-]+\/logo\.(png|jpg|webp)(\?v=\d+)?$/.test(path)) return null;
  return `${base}/storage/v1/object/public/logos/${path}`;
}

/**
 * The logo to show for an organisation: an uploaded one if there is one, otherwise the icon
 * from its own website (served through /logo/[slug]), otherwise none (initials are shown).
 */
export function orgLogo(o: { slug: string; logo_path?: string | null; website?: string | null }) {
  return logoUrl(o.logo_path) ?? (websiteHost(o.website) ? `/logo/${o.slug}` : null);
}

/** The bare host of a website URL (no www.), or null if it isn't a plain public http(s) URL. */
export function websiteHost(website?: string | null) {
  if (!website) return null;
  try {
    const u = new URL(website);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // A real public domain name: letters, digits, hyphens and dots, with a TLD. No IPs, no localhost.
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}
