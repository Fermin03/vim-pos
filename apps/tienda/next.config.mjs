/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// El antirobot del envío del pedido (Cloudflare Turnstile): su script y su iframe, y nada más.
const TURNSTILE = "https://challenges.cloudflare.com";

// Las fotos de los productos y el logo viven en el almacén público de Supabase: solo ese origen
// entra a img-src. Sin la variable (o mal escrita) no entra ninguno y la tienda se ve sin fotos.
function origenDeSupabase() {
  try {
    return [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin];
  } catch {
    return [];
  }
}

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vim/ui", "@vim/config", "@vim/fecha"],
  async headers() {
    return [
      { source: "/:path*", headers: cabecerasSeguridad({ scriptExtra: TURNSTILE, frameSrc: TURNSTILE, imgSrc: origenDeSupabase() }) },
      // El enlace de seguimiento ES la llave del pedido: no sale en ningún Referer ni en buscadores.
      // Va después a propósito: en Next, la última regla que coincide gana para la misma cabecera.
      {
        source: "/:negocio/pedido/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Las pantallas de cuenta no son contenido para buscadores.
      {
        source: "/:negocio/:pantalla(entrar|registro|recuperar|cuenta)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // El enlace de recuperación lleva su token en la dirección: que no salga en ningún Referer.
      { source: "/:negocio/recuperar/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};
export default nextConfig;
