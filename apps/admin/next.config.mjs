/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// Cloudflare Turnstile (captcha del registro público y del reenvío de confirmación, 0142): su
// script y su iframe vienen de challenges.cloudflare.com. Solo ese origen, solo en script-src y
// frame-src; nada más se abre.
const TURNSTILE = "https://challenges.cloudflare.com";

const nextConfig = {
  reactStrictMode: true,
  // Los packages del monorepo se transpilan desde TS fuente.
  transpilePackages: ["@vim/ui", "@vim/db", "@vim/config"],
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad({ scriptExtra: TURNSTILE, frameSrc: TURNSTILE }) }];
  },
};
export default nextConfig;
