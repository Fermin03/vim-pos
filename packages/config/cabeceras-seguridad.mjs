// Cabeceras de seguridad de las apps de Next (SEC CN-003, Cyber Neo). UNA sola copia: antes este
// bloque estaba pegado en los cinco `next.config.mjs` y había que acordarse de tocar los cinco.
//
// Sin estas cabeceras las apps quedan expuestas a clickjacking y a XSS sin defensa en profundidad
// (el POS captura PIN y emite JWTs). `'unsafe-inline'` en style es por Tailwind/JIT.
//
// En dev, Next usa eval() para el HMR/react-refresh; sin `'unsafe-eval'` la CSP rompe la
// hidratación (los botones dejan de responder). Por eso `'unsafe-eval'` SOLO en desarrollo.

/** Supabase nube (REST/Realtime/Functions) y el stack local de desarrollo. */
const CONNECT_NUBE =
  "connect-src 'self' https://*.supabase.co https://*.supabase.in http://127.0.0.1:54321 ws://localhost:* http://localhost:*";

/**
 * Lo que cada app puede ajustar; el resto es igual para todas.
 *
 * @param {object} [o]
 * @param {string} [o.scriptExtra] Origen adicional para `script-src` (p. ej. el captcha del admin).
 * @param {string} [o.frameSrc] Origen para `frame-src`. Sin él no se emite la directiva.
 * @param {string} [o.connectSrc] Directiva `connect-src` completa, si no es la de la nube.
 * @param {boolean} [o.hsts] `false` quita Strict-Transport-Security (el KDS habla http con su hub).
 */
export function cabecerasSeguridad({ scriptExtra, frameSrc, connectSrc = CONNECT_NUBE, hsts = true } = {}) {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = ["script-src 'self' 'unsafe-inline'", isDev && "'unsafe-eval'", scriptExtra].filter(Boolean).join(" ");
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ...(hsts ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
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
        ...(frameSrc ? [`frame-src ${frameSrc}`] : []),
        connectSrc,
      ].join("; "),
    },
  ];
}
