// POST /api/tienda — la ÚNICA puerta del navegador. Reenvía a la Edge Function `tienda` con el
// secreto y la IP real; el navegador nunca habla con Supabase ni ve el secreto.
//
// Aquí solo se cuida la puerta: mismo origen, tamaño, las tres acciones del navegador y que no pase
// ningún campo ni cabecera que no se conozca. La FORMA de cada dato y las reglas de negocio las
// decide la función (y la base), que contestan con su propio código de error.
import { llamarTienda } from "../../lib/servidor/funcion";
import { ipDe } from "../../lib/servidor/ip";
import { FORMA_CODIGO, FORMA_SLUG } from "../../lib/contrato";

const MAX_CUERPO = 32 * 1024;   // el mismo tope que la función
const MAX_RENGLONES = 40;

type Obj = Record<string, unknown>;
const esObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const responder = (json: unknown, status: number): Response => Response.json(json, { status, headers: { "Cache-Control": "no-store" } });
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

const DE_CARRITO = ["accion", "negocio", "sucursal_id", "modo", "zona_id", "items"] as const;
const DE_PEDIDO = [...DE_CARRITO, "cliente", "direccion", "pago", "paga_con", "nota", "captcha", "total_esperado"] as const;

export async function POST(req: Request): Promise<Response> {
  // Mismo origen: un navegador siempre manda Origin en un POST con fetch. Si viene y no es el
  // nuestro, es otra página usando al visitante. (Sin Origin no es un navegador en otra página.)
  const origen = req.headers.get("origin");
  if (origen !== null) {
    const propio = req.headers.get("host") ?? new URL(req.url).host;
    let host = "";
    try { host = new URL(origen).host; } catch { /* «null» u otra cosa que no es un origen */ }
    if (host !== propio) return rechazo("ORIGEN_NO_PERMITIDO", 403);
  }

  if (Number(req.headers.get("content-length") ?? 0) > MAX_CUERPO) return rechazo("CUERPO_DEMASIADO_GRANDE", 413);
  const crudo = await req.text();
  if (new TextEncoder().encode(crudo).length > MAX_CUERPO) return rechazo("CUERPO_DEMASIADO_GRANDE", 413);

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(crudo); } catch { return rechazo("CUERPO_INVALIDO"); }
  if (!esObj(cuerpo)) return rechazo("CUERPO_INVALIDO");

  // `negocio` y `menu` no pasan por aquí: los leen los componentes de servidor, con caché.
  const { accion, negocio } = cuerpo;
  if (accion !== "cotizar" && accion !== "pedir" && accion !== "seguimiento") return rechazo("ACCION_INVALIDA");
  if (typeof negocio !== "string" || !FORMA_SLUG.test(negocio)) return rechazo("NEGOCIO_INVALIDO");

  let limpio: unknown;
  if (accion === "seguimiento") {
    if (typeof cuerpo.codigo !== "string" || !FORMA_CODIGO.test(cuerpo.codigo)) return rechazo("CODIGO_INVALIDO");
    limpio = { accion, negocio, codigo: cuerpo.codigo };
  } else {
    const { items } = cuerpo;
    if (!Array.isArray(items) || items.length < 1 || items.length > MAX_RENGLONES || !items.every(esObj)) return rechazo("CARRITO_INVALIDO");
    const base = solo(cuerpo, accion === "pedir" ? DE_PEDIDO : DE_CARRITO) as Obj;
    base.items = items.map(item);
    if ("cliente" in base) base.cliente = solo(base.cliente, ["nombre", "telefono", "email"]);
    if ("direccion" in base) {
      base.direccion = solo(base.direccion, ["calle", "numero_exterior", "numero_interior", "colonia", "codigo_postal", "ciudad", "estado", "referencias"]);
    }
    limpio = base;
  }

  const r = await llamarTienda(limpio, ipDe(req.headers));
  return responder(r.json, r.estado);
}
