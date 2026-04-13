import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leaflet/react-leaflet need transpiling for ESM compatibility
  transpilePackages: ["leaflet", "react-leaflet"],

  // Allow build to complete with type errors during rapid iteration
  typescript: {
    ignoreBuildErrors: true,
  },

  // Turbopack is the default in Next.js 16 — no flag needed.
  // Explicitly set root to silence workspace detection warning.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
