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
