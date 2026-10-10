/** Site-wide names, in one place so the brand and region can change without hunting. */
export const SITE_NAME = "Delhi Tech Map";
export const SITE_TAGLINE = "Startups and tech companies across Delhi NCR, mapped";
export const REGION = "Delhi NCR";
/**
 * The site's public address, for links that leave the site (share images, feeds, sitemap, embed snippets).
 * On Vercel production it's the project's real production domain, which Vercel provides to every build
 * (and which becomes a custom domain automatically if one is added), so it can't be mistyped.
 * Elsewhere (local, tests) NEXT_PUBLIC_SITE_URL sets it.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env) {
  const prod = env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercelEnv = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV;
  if (vercelEnv === "production" && prod && /^[a-z0-9.-]+$/i.test(prod)) return `https://${prod}`;
  return (env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
export const SITE_URL = resolveSiteUrl({
  // Spelled out so Next.js inlines them into browser code too.
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

/** Cities the map covers, in the order they're being added. */
export const CITIES = [
  { slug: "gurugram", name: "Gurugram", center: [77.06, 28.46] as [number, number], live: true },
  { slug: "noida", name: "Noida", center: [77.36, 28.56] as [number, number], live: true },
  { slug: "greater-noida", name: "Greater Noida", center: [77.51, 28.47] as [number, number], live: true },
  { slug: "delhi", name: "Delhi", center: [77.21, 28.63] as [number, number], live: false },
];
