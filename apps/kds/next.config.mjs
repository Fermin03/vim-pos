/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// KDS: cliente delgado del hub (la caja). El hub vive en la LAN (IP:puerto arbitrarios). CSP no
// soporta CIDR, así que se permiten los esquemas http/ws (red interna) además de Supabase nube. En
// el KDS EMPAQUETADO la CSP la pone el ui-server del desktop con el host exacto del hub; esta
// cabecera solo aplica al build web.
const CONNECT_HUB = "connect-src 'self' https://*.supabase.co https://*.supabase.in http: https: ws: wss:";

// Con VIM_DESKTOP_EXPORT=1 se genera un export estático servido offline desde Electron (rol
// COCINA). En ese modo headers() no aplica: la CSP la pone el ui-server del desktop.
const isExport = process.env.VIM_DESKTOP_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vim/kds-core", "@vim/ui"],
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : { async headers() { return [{ source: "/:path*", headers: cabecerasSeguridad({ connectSrc: CONNECT_HUB, hsts: false }) }]; } }),
};
export default nextConfig;
