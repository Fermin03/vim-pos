/** @type {import('next').NextConfig} */

// KDS: cliente delgado del hub (la caja). Cabeceras de seguridad como el POS; connect-src permite
// el hub por LAN (http/ws a cualquier host:puerto de la red interna) además de Supabase nube.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
      // El hub vive en la LAN (IP:puerto arbitrarios). CSP no soporta CIDR, así que se permiten los
      // esquemas http/ws (red interna) además de Supabase nube. En el KDS EMPAQUETADO la CSP la pone
      // el ui-server del desktop con el host exacto del hub; esta cabecera solo aplica al build web.
      "connect-src 'self' https://*.supabase.co https://*.supabase.in http: https: ws: wss:",
    ].join("; "),
  },
];

// Con VIM_DESKTOP_EXPORT=1 se genera un export estático servido offline desde Electron (rol
// COCINA). En ese modo headers() no aplica: la CSP la pone el ui-server del desktop.
const isExport = process.env.VIM_DESKTOP_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vim/kds-core", "@vim/ui"],
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : { async headers() { return [{ source: "/:path*", headers: securityHeaders }]; } }),
};
export default nextConfig;
