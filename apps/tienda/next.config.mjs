/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

// El antirobot del envío del pedido (Cloudflare Turnstile): su script y su iframe, y nada más.
const TURNSTILE = "https://challenges.cloudflare.com";

// Pago en línea: MercadoPago.js y sus campos de tarjeta (Secure Fields), que son iframes de Mercado
// Pago. Mercado Pago no publica esta lista: es lo que se vio pedir al navegador al montar los campos
// y crear un token con una public key de prueba (11 y 12 oct 2026), escuchando las violaciones de la
// CSP hasta que no quedó ninguna. Sin comodines: cada origen está porque el SDK lo pidió.
// OJO: `api.mercadolibre.com` (connect) y `www.mercadolivre.com` (img) estuvieron BLOQUEADOS hasta el
// 12 oct 2026 por parecer «telemetría»: son la huella de dispositivo del antifraude de Mercado Pago,
// y sin ella los cobros reales salían `high_risk`. No se quitan. Si un día cambian de dominio, el
// formulario no carga y la tienda lo dice («No pudimos cargar el pago con tarjeta»): ahí se revisa.
const MERCADO_PAGO = {
  // sdk: MercadoPago.js. www.mercadopago.com: su script de seguridad (`/v2/security.js`), que calcula la
  // huella del dispositivo; sin él no hay `MP_DEVICE_SESSION_ID` que mandar con el cobro.
  script: ["https://sdk.mercadopago.com", "https://www.mercadopago.com"],
  // Los tres campos de tarjeta son iframes servidos desde aquí. www.mercadopago.com.mx: la página del
  // reto del banco (3D Secure), que se abre en un marco en la pantalla de la tarjeta. VERIFICADO (12
  // oct 2026): Mercado Pago la sirve desde ese origen y es el único que hace falta aquí; lo que esa
  // página carga por dentro (el marco anidado del banco, sus scripts) lo gobierna SU política, no la
  // nuestra. Es la misma lista cerrada de `HOSTS_DEL_RETO` (app/lib/verificacion.ts): si cambia una, cambia la otra.
  frame: ["https://api.mercadopago.com", "https://api-static.mercadopago.com", "https://secure-fields.mercadopago.com", "https://www.mercadopago.com.mx"],
  // api.mercadopago: marca y banco de la tarjeta, el token y el registro del dispositivo (`/v1/devices`,
  // `/v1/device_sessions`). secure-fields: los campos. www.mercadolibre y api.mercadolibre (`/tracks`):
  // la huella del dispositivo que Mercado Pago usa contra el fraude.
  connect: ["https://api.mercadopago.com", "https://api-static.mercadopago.com", "https://secure-fields.mercadopago.com", "https://www.mercadolibre.com", "https://api.mercadolibre.com"],
  // Las dos «imágenes» son balizas de esa misma huella (una por dominio de Mercado Libre).
  img: ["https://www.mercadolibre.com", "https://www.mercadolivre.com"],
};

// El mapa del envío por distancia (0185): MapLibre pide a OpenFreeMap el estilo, las teselas, las
// letras y los iconos, todo con fetch desde ese único origen (visto en el navegador, escuchando las
// violaciones de la CSP). La librería y su worker se sirven de aquí mismo (public/mapa/): no abren nada.
const MAPA = "https://tiles.openfreemap.org";

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
        connectExtra: [...MERCADO_PAGO.connect, MAPA], imgSrc: [...origenDeSupabase(), ...MERCADO_PAGO.img],
        // «Usar mi ubicación» (envío por distancia): solo esta página, ningún marco ajeno.
        geolocalizacion: true,
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
