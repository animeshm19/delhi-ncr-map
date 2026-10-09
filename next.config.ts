import type { NextConfig } from "next";
import { badgeHeaders, securityHeaders } from "./lib/security";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Instagram cards read their fonts from disk at runtime.
  outputFileTracingIncludes: { "/card": ["./assets/fonts/*.woff"] },
  images: {
    // Logos live in Supabase Storage (public "logos" bucket).
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  // The app was renamed from delhi-ncr-map to delhincr-map: the old address sends people (and links) to the new one.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "delhi-ncr-map-pink.vercel.app" }],
        destination: "https://delhincr-map.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      // Everything is un-frameable except the embeddable map and badges.
      { source: "/((?!embed|badge).*)", headers: securityHeaders() },
      { source: "/embed/:path*", headers: securityHeaders({ embeddable: true }) },
      { source: "/embed", headers: securityHeaders({ embeddable: true }) },
      { source: "/badge/:path*", headers: badgeHeaders() },
    ];
  },
};

export default nextConfig;
