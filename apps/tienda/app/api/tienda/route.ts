// POST /api/tienda — la ÚNICA puerta del navegador. Reenvía a la Edge Function `tienda` con el
// secreto y la IP real; el navegador nunca habla con Supabase ni ve el secreto.
//
// Aquí solo se cuida la puerta: mismo origen, tamaño, las acciones del navegador y que no pase
// ningún campo ni cabecera que no se conozca. La FORMA de cada dato y las reglas de negocio las
// decide la función (y la base), que contestan con su propio código de error.
//
// Y la SESIÓN de una cuenta (entrega 6): vive en una cookie HttpOnly por negocio que solo este
// servidor lee y escribe. De aquí sale hacia la función en `x-tienda-sesion`; el token que la función
// devuelve al entrar se vuelve cookie y se QUITA de la respuesta. El navegador nunca lo ve, y nada
// de lo que mande (cuerpo o cabeceras) puede fijar la sesión ni la cuenta.
import { llamarTienda } from "../../lib/servidor/funcion";
import { ipDe } from "../../lib/servidor/ip";
import { cookieBorrada, cookieDeSesion, sesionDe } from "../../lib/servidor/sesion";
import { FORMA_CODIGO, FORMA_SLUG } from "../../lib/contrato";

const MAX_CUERPO = 32 * 1024;   // el mismo tope que la función
const MAX_RENGLONES = 40;

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const responder = (json: unknown, status: number, cookie: string | null = null): Response =>
  Response.json(json, { status, headers: { "Cache-Control": "no-store", ...(cookie && { "Set-Cookie": cookie }) } });
const rechazo = (error: string, status = 400): Response => responder({ error }, status);

/** Solo las claves conocidas que vengan. Lo que no es un objeto pasa tal cual: la función lo rechaza con su código. */
const solo = (x: unknown, claves: readonly string[]): unknown =>
  esObj(x) ? Object.fromEntries(claves.filter((k) => k in x).map((k) => [k, x[k]])) : x;
const cada = (x: unknown, f: (y: unknown) => unknown): unknown => (Array.isArray(x) ? x.map(f) : x);

const modificador = (x: unknown) => solo(x, ["opcion_id", "cantidad"]);
function item(x: unknown): unknown {
  const i = solo(x, ["producto_id", "cantidad", "nota", "modificadores", "componentes"]) as Obj;
  if ("modificadores" in i) i.modificadores = cada(i.modificadores, modificador);
  if ("componentes" in i) {
    i.componentes = cada(i.componentes, (c) => {
      const comp = solo(c, ["grupo_id", "producto_id", "cantidad", "modificadores"]);
      if (esObj(comp) && "modificadores" in comp) comp.modificadores = cada(comp.modificadores, modificador);
      return comp;
    });
  }
  return i;
}

/**
 * El cuerpo como texto, o null si pesa más de 32 KB. Nunca se lee de más: si `Content-Length` ya lo
 * dice, ni se empieza; y como puede faltar (envío por trozos) o mentir, se lee por fragmentos y se
 * corta en el primero que pasa del tope. Sin esto, `req.text()` cargaría en memoria lo que mandaran.
 */
async function leerCuerpoAcotado(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_CUERPO) return null;
  if (!req.body) return "";
  const lector = req.body.getReader(), texto = new TextDecoder();
  let crudo = "", bytes = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return crudo + texto.decode();
    bytes += value.byteLength;
    if (bytes > MAX_CUERPO) {
      await lector.cancel().catch(() => {});
      return null;
    }
    crudo += texto.decode(value, { stream: true });   // `stream`: un carácter puede venir partido entre dos trozos
  }
}

const DE_CARRITO = ["accion", "negocio", "sucursal_id", "modo", "zona_id", "items"] as const;
const DE_PEDIDO = [...DE_CARRITO, "cliente", "direccion", "pago", "paga_con", "nota", "captcha", "total_esperado"] as const;
const DE_DIRECCION = ["calle", "numero_exterior", "numero_interior", "colonia", "codigo_postal", "ciudad", "estado", "referencias"] as const;

/**
 * Las acciones de cuenta y lo ÚNICO que cada una puede mandar (además de `accion` y `negocio`). Los
 * valores pasan tal cual —las contraseñas no se recortan—: su forma la decide la función.
 */
const DE_CUENTA = new Map<string, readonly string[]>([
  ["registrar", ["nombre", "apellido", "email", "telefono", "password", "captcha"]],
  ["entrar", ["email", "password"]],
  ["salir", []],
  ["recuperar_pedir", ["email", "captcha"]],
  ["recuperar_aplicar", ["token", "password"]],
  ["cuenta", []],
  ["cuenta_guardar", ["nombre", "apellido", "telefono", "fecha_nacimiento"]],
  ["cuenta_password", ["actual", "nueva"]],
  ["direccion_guardar", ["id", "etiqueta", ...DE_DIRECCION]],
  ["direccion_borrar", ["id"]],
  ["mis_pedidos", []],
  ["eliminar_cuenta", ["password"]],
]);
/** Las que ABREN sesión: su respuesta trae el token. No reciben la sesión que hubiera. */
const ABREN_SESION = new Set(["registrar", "entrar", "recuperar_aplicar"]);
/** Las de cuenta que no usan sesión: a la función no le llega ninguna. */
const SIN_SESION = new Set([...ABREN_SESION, "recuperar_pedir"]);

export async function POST(req: Request): Promise<Response> {
  // Mismo origen: un navegador siempre manda Origin en un POST con fetch. Si viene y no es el
  // nuestro, es otra página usando al visitante. (Sin Origin no es un navegador en otra página.)
  const origen = req.headers.get("origin");
  const propio = req.headers.get("host") ?? new URL(req.url).host;
  if (origen !== null) {
    let host = "";
    try { host = new URL(origen).host; } catch { /* «null» u otra cosa que no es un origen */ }
    if (host !== propio) return rechazo("ORIGEN_NO_PERMITIDO", 403);
  }

  const crudo = await leerCuerpoAcotado(req);
  if (crudo === null) return rechazo("CUERPO_DEMASIADO_GRANDE", 413);

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(crudo); } catch { return rechazo("CUERPO_INVALIDO"); }
  if (!esObj(cuerpo)) return rechazo("CUERPO_INVALIDO");

  // `negocio` y `menu` no pasan por aquí: los leen los componentes de servidor, con caché.
  const { accion, negocio } = cuerpo;
  const deCuenta = typeof accion === "string" ? DE_CUENTA.get(accion) : undefined;
  if (!deCuenta && accion !== "cotizar" && accion !== "pedir" && accion !== "seguimiento") return rechazo("ACCION_INVALIDA");
  if (typeof negocio !== "string" || !FORMA_SLUG.test(negocio)) return rechazo("NEGOCIO_INVALIDO");

  // La cookie del negocio DEL CUERPO, nunca la de otro; y solo para lo que usa sesión (cotizar,
  // seguimiento y las que la abren no la reciben).
  const usaSesion = deCuenta ? !SIN_SESION.has(accion as string) : accion === "pedir";
  const sesion = usaSesion ? sesionDe(req.headers, negocio) : null;
  // Todo lo que lleva o crea sesión exige ser de ESTA página: `Origin` presente (arriba ya se vio que,
  // si viene, es el propio) y JSON, que un formulario de otro sitio no puede mandar sin permiso.
  // Un `pedir` de invitado (sin cookie) sigue como siempre.
  if (deCuenta || sesion !== null) {
    if (origen === null) return rechazo("ORIGEN_NO_PERMITIDO", 403);
    if ((req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() !== "application/json") return rechazo("CUERPO_INVALIDO");
  }

  let limpio: unknown;
  if (deCuenta) {
    limpio = { accion, negocio, ...(solo(cuerpo, deCuenta) as Obj) };
  } else if (accion === "seguimiento") {
    if (typeof cuerpo.codigo !== "string" || !FORMA_CODIGO.test(cuerpo.codigo)) return rechazo("CODIGO_INVALIDO");
    limpio = { accion, negocio, codigo: cuerpo.codigo };
  } else {
    const { items } = cuerpo;
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_RENGLONES || !items.every(esObj)) return rechazo("CARRITO_INVALIDO");
    const base = solo(cuerpo, accion === "pedir" ? DE_PEDIDO : DE_CARRITO) as Obj;
    base.items = items.map(item);
    if ("cliente" in base) base.cliente = solo(base.cliente, ["nombre", "telefono", "email"]);
    if ("direccion" in base) {
      base.direccion = solo(base.direccion, DE_DIRECCION);
    }
    limpio = base;
  }

  const r = await llamarTienda(limpio, ipDe(req.headers), sesion);

  // El token de sesión no sale de aquí hacia el navegador: en NINGUNA respuesta.
  let json = r.json, cookie: string | null = null;
  if (esObj(json) && "sesion" in json) {
    const { sesion: nueva, ...resto } = json;
    json = resto;
    if (r.estado === 200 && ABREN_SESION.has(accion as string)) {
      if (typeof nueva !== "string" || !FORMA_CODIGO.test(nueva)) {
        // Sin cookie no hay sesión: decir «entraste» sería mentira. (Sin el valor: es un secreto.)
        console.error("[tienda] la función devolvió una sesión sin forma de token");
        return rechazo("SERVICIO_NO_DISPONIBLE", 503);
      }
      cookie = cookieDeSesion(negocio, nueva, propio);
    }
  }
  // Se borra al salir (pase lo que pase del otro lado), al eliminar la cuenta, y cuando la función
  // dice que esa sesión ya no vale.
  if (accion === "salir" || (accion === "eliminar_cuenta" && r.estado === 200) || (esObj(json) && json.error === "SESION_INVALIDA")) {
    cookie = cookieBorrada(negocio, propio);
  }
  return responder(json, r.estado, cookie);
}
