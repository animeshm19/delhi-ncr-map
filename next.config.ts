import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Logos live in Supabase Storage, like the Edmonton map (public "logos" bucket).
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
