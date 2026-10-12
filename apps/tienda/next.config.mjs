/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// El antirobot del envío del pedido (Cloudflare Turnstile): su script y su iframe, y nada más.
const TURNSTILE = "https://challenges.cloudflare.com";

// Pago en línea: MercadoPago.js y sus campos de tarjeta (Secure Fields), que son iframes de Mercado
// Pago. Mercado Pago no publica esta lista: es lo que se vio pedir al navegador al montar los campos
// y crear un token con una public key de prueba (11 oct 2026). Si un día cambian de dominio, el
// formulario no carga y la tienda lo dice («No pudimos cargar el pago con tarjeta»): ahí se revisa.
const MERCADO_PAGO = {
  script: ["https://sdk.mercadopago.com"],
  // Los tres campos de tarjeta son iframes servidos desde aquí.
  frame: ["https://api.mercadopago.com", "https://api-static.mercadopago.com", "https://secure-fields.mercadopago.com"],
  // api: marca y banco de la tarjeta, y el token. secure-fields: los campos. mercadolibre: el Device ID
  // (la huella del dispositivo que Mercado Pago usa contra el fraude; ayuda a que el banco apruebe).
  connect: ["https://api.mercadopago.com", "https://api-static.mercadopago.com", "https://secure-fields.mercadopago.com", "https://www.mercadolibre.com"],
  img: ["https://www.mercadolibre.com"],
};

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
      { source: "/:path*", headers: cabecerasSeguridad({
        scriptExtra: [TURNSTILE, ...MERCADO_PAGO.script].join(" "), frameSrc: [TURNSTILE, ...MERCADO_PAGO.frame].join(" "),
        connectExtra: MERCADO_PAGO.connect, imgSrc: [...origenDeSupabase(), ...MERCADO_PAGO.img],
      }) },
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
      // El token de recuperación va en el fragmento (`#t=`), que no viaja en el Referer ni llega al
      // servidor; esto es el cinturón por si un día alguien lo pone en la consulta.
      { source: "/:negocio/recuperar/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};
export default nextConfig;
