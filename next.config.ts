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
  // A document may be 25 MB; proxy buffers multipart requests before the route sees them.
  experimental: { cpus: 2, proxyClientMaxBodySize: "32mb" },
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
