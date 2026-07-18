/** @type {import('next').NextConfig} */

// Content-Security-Policy: the app is fully self-contained — system fonts, local
// images, no third-party scripts or embeds (Stripe checkout is a full-page
// redirect, not an embedded widget), so everything locks to 'self'.
// 'unsafe-inline' is required by Next.js's own inline bootstrap scripts and
// inline styles. If an external service is ever embedded (e.g. a client-side
// Sentry DSN), add its origin to the matching directive here.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next's development server delivers code through eval(), so dev (and only
  // dev) needs 'unsafe-eval' or the app renders blank locally. Production
  // never gets it.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
