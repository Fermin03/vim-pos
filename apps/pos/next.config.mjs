/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// Fase 1 (escritorio local-first): con VIM_DESKTOP_EXPORT=1 se genera un export estático
// del POS para servirlo offline desde Electron. En ese modo `headers()` no aplica (export no
// lo soporta) → la CSP la pone el servidor local del desktop. El build web/nube no cambia.
const isExport = process.env.VIM_DESKTOP_EXPORT === "1";

const nextConfig = {
  reactStrictMode: true,
  // Los packages del monorepo se transpilan desde TS fuente.
  transpilePackages: ["@vim/ui", "@vim/db", "@vim/config", "@vim/kds-core"],
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : { async headers() { return [{ source: "/:path*", headers: cabecerasSeguridad() }]; } }),
};
export default nextConfig;
