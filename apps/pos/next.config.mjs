/** @type {import('next').NextConfig} */

// SEC CN-003 (Cyber Neo) — cabeceras de seguridad. El POS captura PIN y emite JWTs;
// sin estas cabeceras queda expuesto a clickjacking y XSS sin defensa en profundidad.
// connect-src permite Supabase (REST/Realtime/Functions). 'unsafe-inline' en style por
// Tailwind/JIT; se puede endurecer con nonces más adelante.
// En dev, Next usa eval() para el HMR/react-refresh; sin 'unsafe-eval' la CSP rompe la
// hidratación (los botones/inputs dejan de responder). 'unsafe-eval' SOLO en desarrollo.
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

// Fase 1 (escritorio local-first): con VIM_DESKTOP_EXPORT=1 se genera un export estático
// del POS para servirlo offline desde Electron. En ese modo `headers()` no aplica (export no
// lo soporta) → la CSP la pone el servidor local del desktop. El build web/nube no cambia.
const isExport = process.env.VIM_DESKTOP_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  // Los packages del monorepo se transpilan desde TS fuente.
  transpilePackages: ["@vim/ui", "@vim/db", "@vim/config"],
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : { async headers() { return [{ source: "/:path*", headers: securityHeaders }]; } }),
};
export default nextConfig;
