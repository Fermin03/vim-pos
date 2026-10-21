/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// Cloudflare Turnstile (captcha del registro público y del reenvío de confirmación, 0142): su
// script y su iframe vienen de challenges.cloudflare.com. Solo ese origen, solo en script-src y
// frame-src; nada más se abre.
const TURNSTILE = "https://challenges.cloudflare.com";
// El mapa de «Envío a domicilio» (tienda en línea, 0185): estilo, teselas, letras e iconos de
// OpenFreeMap, todo por fetch desde ese origen. La librería y su worker salen de public/mapa/.
const MAPA = "https://tiles.openfreemap.org";

const nextConfig = {
  reactStrictMode: true,
  // Los packages del monorepo se transpilan desde TS fuente.
  transpilePackages: ["@vim/ui", "@vim/db", "@vim/config"],
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad({ scriptExtra: TURNSTILE, frameSrc: TURNSTILE, connectExtra: [MAPA] }) }];
  },
};
export default nextConfig;
