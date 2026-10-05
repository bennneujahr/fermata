import type { NextConfig } from "next";

// Sicherheits-Header, die nicht von der Anfrage abhängen. Die CSP mit Nonce setzt src/proxy.ts.
const securityHeaders = [
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Mikrofon bleibt für das Gespräch mit Viola (M3) auf der eigenen Seite erlaubt.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@fermata/tokens", "@fermata/brand"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
