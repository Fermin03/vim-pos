/** @type {import('next').NextConfig} */

// SEC CN-003 (Cyber Neo) — cabeceras de seguridad para el panel de administración.
// En dev, Next usa eval() para el HMR/react-refresh; sin 'unsafe-eval' la CSP rompe la
// hidratación. 'unsafe-eval' SOLO en desarrollo.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      scriptSrc,
      "connect-src 'self' https://*.supabase.co https://*.supabase.in http://127.0.0.1:54321 ws://localhost:* http://localhost:*",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Los packages del monorepo se transpilan desde TS fuente.
  transpilePackages: ["@vim/ui", "@vim/db", "@vim/config"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
