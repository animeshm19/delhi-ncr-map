/** Site-wide names, in one place so the brand and region can change without hunting. */
export const SITE_NAME = "Delhi NCR Map";
export const SITE_TAGLINE = "Startups and tech companies across Delhi NCR, mapped";
export const REGION = "Delhi NCR";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Cities the map covers, in the order they're being added. */
export const CITIES = [
  { slug: "gurugram", name: "Gurugram", center: [77.06, 28.46] as [number, number], live: true },
  { slug: "noida", name: "Noida", center: [77.36, 28.56] as [number, number], live: false },
  { slug: "delhi", name: "Delhi", center: [77.21, 28.63] as [number, number], live: false },
];
