// Cuentas de clientes de la tienda (entrega 6): lo que la función decide sin tocar la base. Cómo se
// lee la sesión de la cabecera y qué parte de lo que devuelven las RPC de cuentas puede salir.
// Todo por lista de campos permitidos: si un día el SQL devolviera el id de la cuenta, el
// `tenant_id` o el hash de la contraseña, aquí se quedan.
import { esCodigo } from "./seguimiento.ts";

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const textoONull = (x: unknown): x is string | null | undefined => x === null || x === undefined || typeof x === "string";

/** La pone solo el servidor de la tienda, que la saca de su cookie `HttpOnly`. */
export const CABECERA_SESION = "x-tienda-sesion";

export type Sesion = { estado: "sin" } | { estado: "mala" } | { estado: "ok"; token: string };

/**
 * El token de sesión de la cabecera. «ok» solo dice que tiene FORMA de token (22 caracteres, como
 * `nuevoCodigo`): si la sesión existe lo decide `tienda_sesion_cuenta`. Se distingue «sin» de «mala»
 * porque `pedir` sin cabecera es un invitado, y con una cabecera que no sirve se rechaza.
 */
export function leerSesion(cabecera: string | null): Sesion {
  if (cabecera === null || cabecera.trim() === "") return { estado: "sin" };
  return esCodigo(cabecera) ? { estado: "ok", token: cabecera } : { estado: "mala" };
}

export type Cuenta = { nombre: string; apellido: string | null; email: string; telefono: string; fecha_nacimiento: string | null };

/** La cuenta como la ve su dueño. Cualquier otra forma es null. */
export function cuentaPublica(x: unknown): Cuenta | null {
  if (!objeto(x)) return null;
  const { nombre, apellido, email, telefono, fecha_nacimiento } = x;
  if (typeof nombre !== "string" || typeof email !== "string" || typeof telefono !== "string"
      || !textoONull(apellido) || !textoONull(fecha_nacimiento)) return null;
  return { nombre, apellido: apellido ?? null, email, telefono, fecha_nacimiento: fecha_nacimiento ?? null };
}

/** La cuenta de un `{ cuenta }` (entrar, recuperar, leer, guardar). NULL u otra forma, null. */
export const cuentaDe = (x: unknown): Cuenta | null => cuentaPublica(objeto(x) ? x.cuenta : null);

/** Lo que devuelve `tienda_cuenta_registrar`: `{creada: true, cuenta}` o `{creada: false}`. */
export function leerRegistro(x: unknown): { creada: true; cuenta: Cuenta } | { creada: false } | null {
  if (!objeto(x) || typeof x.creada !== "boolean") return null;
  if (!x.creada) return { creada: false };
  const cuenta = cuentaPublica(x.cuenta);
  return cuenta ? { creada: true, cuenta } : null;
}

/** Una lista que la RPC devuelve suelta o bajo una clave (`{direcciones: [...]}`). Otra cosa, null. */
function lista(x: unknown, clave: string): Record<string, unknown>[] | null {
  const xs = Array.isArray(x) ? x : objeto(x) ? x[clave] : null;
  return Array.isArray(xs) ? xs.filter(objeto) : null;
}

const elegir = (o: Record<string, unknown>, campos: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(campos.filter((c) => o[c] !== undefined).map((c) => [c, o[c]]));

const DE_DIRECCION = ["id", "etiqueta", "calle", "numero_exterior", "numero_interior", "colonia", "codigo_postal", "ciudad", "estado", "referencias"] as const;

/** Las direcciones guardadas: su id (para editarla o borrarla) y sus campos. Ni cuenta ni negocio. */
export function direccionesPublicas(x: unknown): Record<string, unknown>[] | null {
  return lista(x, "direcciones")?.map((d) => elegir(d, DE_DIRECCION)) ?? null;
}

const DE_PEDIDO = ["sucursal_id", "folio_corto", "recibido_at", "modo", "estado", "total_mxn"] as const;

/**
 * Los pedidos de la cuenta. `renglones` es lo que se enseña; `items` es el carrito para «pedir de
 * nuevo» (ids de productos del menú, que ya son públicos), o null si el pedido ya se anonimizó.
 */
export function pedidosPublicos(x: unknown): Record<string, unknown>[] | null {
  return lista(x, "pedidos")?.map((p) => ({
    ...elegir(p, DE_PEDIDO),
    renglones: (Array.isArray(p.renglones) ? p.renglones.filter(objeto) : []).map((r) => elegir(r, ["nombre", "cantidad", "detalle"])),
    items: Array.isArray(p.items) ? p.items : null,
  })) ?? null;
}
