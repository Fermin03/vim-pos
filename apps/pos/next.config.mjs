/** @type {import('next').NextConfig} */

// SEC CN-003 (Cyber Neo) — cabeceras de seguridad. El POS captura PIN y emite JWTs;
// sin estas cabeceras queda expuesto a clickjacking y XSS sin defensa en profundidad.
// connect-src permite Supabase (REST/Realtime/Functions). 'unsafe-inline' en style por
// Tailwind/JIT; se puede endurecer con nonces más adelante.
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
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in http://127.0.0.1:54321",
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
