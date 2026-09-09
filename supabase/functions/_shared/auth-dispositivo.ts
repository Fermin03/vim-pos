// Verificación local del token de dispositivo (optimización 2026-09-09).
//
// POR QUÉ EXISTE. Las funciones que la caja llama en bucle —espejo, latido, sync-push, sync-pull,
// delivery-accion— empezaban TODAS con `admin.auth.getUser(token)`: un viaje HTTP a GoTrue que a
// su vez consulta la base, en cada llamada, solo para validar una firma. Y después leían los
// claims del token sin verificarlos, confiando en que ese viaje los avalaba ("Lee los claims de
// un JWT cuya firma YA validó getUser", decía el comentario en cinco archivos).
//
// Los tokens del proyecto van firmados HS256 con el JWT secret, que estas funciones ya tienen a
// mano (`VIM_JWT_SECRET`, el mismo que usa pin-login para acuñarlos). Verificar la firma aquí
// cuesta microsegundos y, de paso, los claims dejan de ser palabra dada: quedan verificados.
//
// QUÉ SE PIERDE Y QUÉ SE GANA. `getUser` preguntaba a GoTrue, así que borrar o banear al usuario
// del dispositivo cortaba el acceso al instante; ahora ese usuario entraría hasta que expire su
// token (una hora como mucho). A cambio, la autorización pasa a resolverse contra la base en cada
// función —`cajas.activa`—, que corta al instante y es la palanca que el negocio ya usa. Antes
// sync-push y sync-pull no consultaban NINGUNA fila: una caja desactivada seguía subiendo ventas.
// Es el mismo criterio que ya sigue el escritorio en `desktop/src/auth.mjs`: la firma se verifica
// con el secreto, la identidad se resuelve contra la base.
//
// Se usa Web Crypto y no djwt para que el módulo corra tal cual bajo `node --test`: la seguridad
// de esto tiene que estar cubierta por pruebas, incluida la trampa de alg:none.

/** El correo sintético del dispositivo lleva dentro su caja (1F §1.1). El dispositivo ES una caja. */
const EMAIL_DISPOSITIVO = /^caja-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

export type Carga = Record<string, unknown>;
export type Dispositivo = { sub: string; tenantId: string; cajaId: string; email: string };
export type Motivo = "SIN_TOKEN" | "AUTH_INVALIDA" | "NO_ES_DISPOSITIVO";
export type Fallo = { ok: false; motivo: Motivo; status: number; error: string; detalle?: string };
export type Resultado = ({ ok: true } & Dispositivo) | Fallo;

/**
 * El código y el texto con los que contesta cada función. Son los MISMOS que devolvía el camino
 * de getUser, y eso no es cosmético: el agente del escritorio distingue el 401 (tira el token y
 * pide uno nuevo) del 403 (deja de insistir). Cambiar un 403 por un 401 pondría a la flota a
 * pedir tokens en bucle contra una nube que ya dijo que no.
 */
const FALLOS: Record<Motivo, { status: number; error: string }> = {
  SIN_TOKEN: { status: 401, error: "NO_AUTH" },
  AUTH_INVALIDA: { status: 401, error: "AUTH_INVALIDA" },
  NO_ES_DISPOSITIVO: { status: 403, error: "NO_ES_DISPOSITIVO" },
};

const fallo = (motivo: Motivo, detalle?: string): Fallo => ({ ok: false, motivo, ...FALLOS[motivo], ...(detalle ? { detalle } : {}) });

/**
 * Por qué se cayó un token que no pasó la verificación, para el log de la caja.
 *
 * Lee la carga SIN verificar, y solo para explicar: el 6 sep 2026 la caja se quedó sin espejo y
 * no se pudo saber por qué, porque la respuesta era un 401 pelado. Distinguir "vencido" de
 * "firma" no le regala nada a un atacante —cualquier biblioteca de JWT lo dice— y es la
 * diferencia entre diagnosticar en un minuto o a ciegas.
 */
function porQueSeCayo(token: string, ahoraSeg: number): string {
  const carga64 = token.split(".")[1];
  const bytes = carga64 ? deBase64Url(carga64) : null;
  if (bytes) {
    try {
      const exp = (JSON.parse(aTexto(bytes)) as Carga).exp;
      if (typeof exp === "number" && exp <= ahoraSeg) {
        return `token vencido hace ${Math.round(ahoraSeg - exp)} s`;
      }
    } catch { /* si ni siquiera parsea, es un token con mala forma */ }
  }
  return "firma no válida o token con mala forma";
}

function deBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch { return null; }
}

const aTexto = (b: Uint8Array) => new TextDecoder().decode(b);

/**
 * Verifica firma y vigencia. Devuelve la carga solo si el token es bueno; `null` en cualquier
 * otro caso, sin distinguir por qué: a quien manda un token malo no se le explica qué le faltó.
 *
 * El algoritmo se comprueba contra la cabecera ANTES de verificar nada. Sin eso, un token que
 * anuncie `alg: "none"` y venga sin firma pasaría, que es el agujero clásico de las
 * implementaciones caseras de JWT.
 */
export async function verificarHS256(token: string, secreto: string, ahoraSeg?: number): Promise<Carga | null> {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3) return null;
  const [cab64, carga64, firma64] = partes as [string, string, string];
  if (!cab64 || !carga64 || !firma64) return null;

  const cabBytes = deBase64Url(cab64);
  if (!cabBytes) return null;
  let cabecera: Carga;
  try { cabecera = JSON.parse(aTexto(cabBytes)); } catch { return null; }
  if (cabecera.alg !== "HS256") return null;

  const firma = deBase64Url(firma64);
  if (!firma || firma.length === 0) return null;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const buena = await crypto.subtle.verify(
    "HMAC", key, firma as BufferSource, new TextEncoder().encode(`${cab64}.${carga64}`),
  );
  if (!buena) return null;

  const cargaBytes = deBase64Url(carga64);
  if (!cargaBytes) return null;
  let carga: Carga;
  try { carga = JSON.parse(aTexto(cargaBytes)); } catch { return null; }

  // Sin `exp` no se acepta: un token sin caducidad sería una llave permanente si alguna vez se
  // filtra el disco de una caja.
  const exp = typeof carga.exp === "number" ? carga.exp : NaN;
  if (!Number.isFinite(exp)) return null;
  if (exp <= (ahoraSeg ?? Math.floor(Date.now() / 1000))) return null;

  return carga;
}

/** Tenant y caja de una carga YA verificada. `null` si no es un dispositivo en regla. */
export function identidadDeDispositivo(carga: Carga | null): Dispositivo | null {
  const r = identidadOFalta(carga);
  return "falta" in r ? null : r;
}

/**
 * Como `identidadDeDispositivo`, pero diciendo QUÉ claim faltó.
 *
 * Importa porque estas funciones dejaron de preguntarle a GoTrue: antes el correo del dispositivo
 * salía de `getUser`, y ahora sale del claim `email` del token. El hook de acceso (0006) solo
 * AÑADE tenant_id y tipo_identidad sobre los claims de GoTrue, así que `email` viaja; pero si un
 * día dejara de viajar, esto tiene que decirlo en la primera línea del log en vez de dejar a la
 * flota con un 403 mudo.
 */
export function identidadOFalta(carga: Carga | null): Dispositivo | { falta: string } {
  if (!carga) return { falta: "carga vacía" };
  if (carga.tipo_identidad !== "DISPOSITIVO") {
    return { falta: `tipo_identidad no es DISPOSITIVO (es ${JSON.stringify(carga.tipo_identidad ?? null)})` };
  }
  const tenantId = typeof carga.tenant_id === "string" ? carga.tenant_id : null;
  if (!tenantId) return { falta: "el token no trae tenant_id" };
  const sub = typeof carga.sub === "string" ? carga.sub : null;
  if (!sub) return { falta: "el token no trae sub" };
  const email = typeof carga.email === "string" ? carga.email : "";
  if (!email) return { falta: "el token no trae el claim email (de ahí sale la caja)" };
  const cajaId = EMAIL_DISPOSITIVO.exec(email)?.[1]?.toLowerCase() ?? null;
  if (!cajaId) return { falta: "el claim email no tiene forma de correo de dispositivo" };
  return { sub, tenantId, cajaId, email };
}

/**
 * El verificador que usan los handlers. Dice POR QUÉ falló para que cada función siga
 * contestando con el mismo código y el mismo texto que contestaba con getUser: la caja ya
 * distingue el 401 (pide token nuevo) del 403 (deja de insistir), y cambiárselo la rompería.
 */
export function crearVerificadorDispositivo(secreto: string) {
  return async function verificar(autorizacion: string | null | undefined): Promise<Resultado> {
    const token = String(autorizacion ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fallo("SIN_TOKEN");
    const carga = await verificarHS256(token, secreto);
    if (!carga) return fallo("AUTH_INVALIDA", porQueSeCayo(token, Math.floor(Date.now() / 1000)));
    const d = identidadOFalta(carga);
    if ("falta" in d) return fallo("NO_ES_DISPOSITIVO", d.falta);
    return { ok: true, ...d };
  };
}
