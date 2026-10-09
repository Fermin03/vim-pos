// Forma de lo que le llega a la función `tienda`. Validación A MANO y no con zod: estos módulos se
// prueban con Node, que no resuelve `npm:` (mismo criterio que _shared/alta.ts).
//
// Aquí solo se mira la FORMA. Que el producto exista, que el precio sea el de hoy o que la tienda
// esté abierta lo deciden las funciones SQL (0162), que son las que tienen los datos.
import { esCodigo } from "./seguimiento.ts";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
export type Modo = "RECOGER" | "DOMICILIO";
export type Direccion = {
  calle: string; numero_exterior: string; numero_interior: string | null; colonia: string;
  codigo_postal: string; ciudad: string; estado: string; referencias: string | null;
};
export type Peticion =
  | { accion: "negocio"; negocio: string }
  | { accion: "menu"; negocio: string; sucursal_id: string }
  | { accion: "cotizar"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[] }
  | { accion: "pedir"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[];
      cliente: { nombre: string; telefono: string; email: string | null }; direccion: Direccion | null;
      pago: "EFECTIVO" | "TARJETA"; paga_con: string | null; nota: string | null; captcha: string | null }
  | { accion: "seguimiento"; negocio: string; codigo: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
// Solo ASCII: el correo acaba en cabeceras SMTP y en la base; nada de invisibles, comas ni comillas.
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const MAX_RENGLONES = 40;

const mal = (error: string): { ok: false; error: string } => ({ ok: false, error });
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function esUuid(x: unknown): x is string {
  return typeof x === "string" && UUID.test(x);
}

/** Diez dígitos nacionales, o null. Quita adornos (espacios y `()+-.`) y el prefijo de México (52, o
 *  521 de celular). Una letra no es adorno, y la lada nacional no empieza en 0 ni en 1. */
export function normalizarTelefono(x: unknown): string | null {
  if (typeof x !== "string" || !/^[\d\s()+.-]+$/.test(x)) return null;
  let d = x.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[2-9]\d{9}$/.test(d) ? d : null;
}

/** Texto de una sola línea recortado a `max` CARACTERES (no unidades UTF-16: no parte un emoji).
 *  Los controles (Cc, incluidos los C1) y los separadores de línea/párrafo se vuelven espacio; los de
 *  formato (Cf: ancho cero, bidi, BOM) y los sustitutos sueltos se quitan. Sin nada visible = null. */
export function textoLimpio(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ").replace(/[\p{Cf}\p{Cs}]/gu, "")
    .replace(/\s+/g, " ").trim();
  const corto = Array.from(t).slice(0, max).join("").trim();
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(corto) ? corto : null;
}

function leerDireccion(x: unknown): Direccion | null {
  if (!objeto(x)) return null;
  const calle = textoLimpio(x.calle, 255), numero_exterior = textoLimpio(x.numero_exterior, 20);
  const colonia = textoLimpio(x.colonia, 150), ciudad = textoLimpio(x.ciudad, 100), estado = textoLimpio(x.estado, 50);
  const codigo_postal = typeof x.codigo_postal === "string" ? x.codigo_postal.trim() : "";
  if (!calle || !numero_exterior || !colonia || !ciudad || !estado || !/^[0-9]{5}$/.test(codigo_postal)) return null;
  return { calle, numero_exterior, numero_interior: textoLimpio(x.numero_interior, 20), colonia,
           codigo_postal, ciudad, estado, referencias: textoLimpio(x.referencias, 300) };
}

/** Importe como texto con dos decimales, o undefined si no es un importe válido. null/ausente = null.
 *  Un número se juzga por su texto: más de dos decimales (o notación científica) se rechaza, no se redondea. */
function leerImporte(x: unknown): string | null | undefined {
  if (x === null || x === undefined || x === "") return null;
  const s = typeof x === "number" ? String(x) : typeof x === "string" ? x.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return n > 999999 ? undefined : n.toFixed(2);
}

export function leerCuerpo(x: unknown): Resultado<Peticion> {
  if (!objeto(x)) return mal("CUERPO_INVALIDO");
  const accion = x.accion;
  if (accion !== "negocio" && accion !== "menu" && accion !== "cotizar" && accion !== "pedir" && accion !== "seguimiento") {
    return mal("ACCION_INVALIDA");
  }
  const negocio = typeof x.negocio === "string" ? x.negocio.trim().toLowerCase() : "";
  if (!SLUG.test(negocio)) return mal("NEGOCIO_INVALIDO");

  if (accion === "negocio") return { ok: true, valor: { accion, negocio } };
  if (accion === "seguimiento") {
    return esCodigo(x.codigo) ? { ok: true, valor: { accion, negocio, codigo: x.codigo } } : mal("CODIGO_INVALIDO");
  }

  if (!esUuid(x.sucursal_id)) return mal("SUCURSAL_INVALIDA");
  const sucursal_id = x.sucursal_id;
  if (accion === "menu") return { ok: true, valor: { accion, negocio, sucursal_id } };

  if (x.modo !== "RECOGER" && x.modo !== "DOMICILIO") return mal("MODO_INVALIDO");
  const modo: Modo = x.modo;
  const zonaCruda = x.zona_id ?? null;
  if (zonaCruda !== null && !esUuid(zonaCruda)) return mal("ZONA_INVALIDA");
  const zona_id = zonaCruda as string | null;
  if (!Array.isArray(x.items) || x.items.length === 0 || x.items.length > MAX_RENGLONES) return mal("CARRITO_INVALIDO");
  const items: unknown[] = x.items;
  if (accion === "cotizar") return { ok: true, valor: { accion, negocio, sucursal_id, modo, zona_id, items } };

  // pedir
  if (!objeto(x.cliente)) return mal("CLIENTE_INVALIDO");
  const nombre = textoLimpio(x.cliente.nombre, 100);
  const telefono = normalizarTelefono(x.cliente.telefono);
  const emailCrudo = x.cliente.email ?? null;
  // Un campo opcional del formulario que llega vacío es un correo ausente, no un error.
  const email = emailCrudo === null ? null : typeof emailCrudo === "string" ? (emailCrudo.trim().toLowerCase() || null) : "";
  if (!nombre || !telefono || (email !== null && (email.length > 254 || !CORREO.test(email)))) return mal("CLIENTE_INVALIDO");

  let direccion: Direccion | null = null;
  if (modo === "DOMICILIO") {
    direccion = leerDireccion(x.direccion);
    if (!direccion) return mal("DIRECCION_INVALIDA");
  } else if ((x.direccion ?? null) !== null) {
    return mal("DIRECCION_INVALIDA");
  }

  if (x.pago !== "EFECTIVO" && x.pago !== "TARJETA") return mal("PAGO_INVALIDO");
  const paga_con = leerImporte(x.paga_con);
  if (paga_con === undefined || (x.pago === "TARJETA" && paga_con !== null)) return mal("PAGO_INVALIDO");

  return { ok: true, valor: {
    accion, negocio, sucursal_id, modo, zona_id, items,
    cliente: { nombre, telefono, email }, direccion, pago: x.pago, paga_con,
    nota: textoLimpio(x.nota, 300), captcha: typeof x.captcha === "string" && x.captcha.length <= 4096 ? x.captcha : null,
  } };
}
