import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Only this authenticated tool may be embedded by the same-origin app shell.
      { source: "/dovednosti/avatary-domu/nastroj", headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'none'" },
      ] },
    ];
  },
};

export default nextConfig;
