// Lo que la función `tienda` decide sin tocar la base ni la red: qué IP cuenta, qué cupo gasta cada
// acción, qué se le contesta al cliente cuando una RPC falla y qué parte de lo que devuelve la base
// puede salir. Vive aparte del handler porque el handler no se prueba (Deno.serve y la base) y esto
// sí, con `node --test`: es justo lo que, mal hecho, filtra un dato o deja pasar de más.
import { pareceIp, type Cupo } from "../limite.ts";
import type { Peticion } from "./validar.ts";

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * La IP del cliente final, que SOLO se lee de `x-tienda-ip` y solo después de comprobar el secreto:
 * quien llama es nuestro servidor, el único que la conoce. Si falta o no parece una IP,
 * "desconocida": todos los que caigan ahí comparten un contador, que es lo seguro.
 */
export function ipDeConfianza(cabecera: string | null): string {
  const v = (cabecera ?? "").trim().toLowerCase();
  return pareceIp(v) ? v : "desconocida";
}

/** Los cupos de una acción (diseño §10). Pedir crea filas: si el control no responde, se cierra. */
export function cuposDe(accion: Peticion["accion"], ip: string, negocio: string): { cupos: Cupo[]; alFallar: "abrir" | "cerrar" } {
  if (accion !== "pedir") {
    return { cupos: [{ clave: `tienda:lee:ip:${ip}`, ventanaSeg: 600, max: 120 }], alFallar: "abrir" };
  }
  return {
    cupos: [
      { clave: `tienda:pide:ip:${ip}`, ventanaSeg: 3600, max: 5 },
      { clave: `tienda:pide:negocio:${negocio}`, ventanaSeg: 3600, max: 60 },
    ],
    alFallar: "cerrar",
  };
}

// Las funciones SQL (0162) rechazan con `RAISE EXCEPTION 'CODIGO: detalle'`, y PostgREST lo entrega
// en `error.message`. Un código es MAYUSCULAS_CON_GUION_BAJO, con al menos un guion: así "FATAL: …"
// o "ERROR" de Postgres no pasan por rechazo de negocio. Todo lo demás es un fallo nuestro.
const CODIGO = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:: ?([\s\S]*))?$/;
// Solo en estos el detalle le sirve al cliente, y es un motivo (FUERA_DE_HORARIO…) o el id de un
// producto de su propio carrito. Se exige esa forma: si un día el SQL pusiera otra cosa, no sale.
const CON_DETALLE = new Set(["TIENDA_CERRADA", "PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]);
const DETALLE = /^[A-Za-z0-9_-]{1,64}$/;

export type RespuestaRpc =
  | { status: 409; body: { error: string; detalle?: string } }
  | { status: 503; body: { error: "SERVICIO_NO_DISPONIBLE" } };

/** El `error.message` de una RPC → lo que se responde. Nunca incluye el texto crudo de la base. */
export function respuestaDeRpc(mensaje: unknown): RespuestaRpc {
  const m = typeof mensaje === "string" ? CODIGO.exec(mensaje) : null;
  if (!m) return { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } };
  const codigo = m[1]!, detalle = m[2] ?? "";
  return CON_DETALLE.has(codigo) && DETALLE.test(detalle)
    ? { status: 409, body: { error: codigo, detalle } }
    : { status: 409, body: { error: codigo } };
}

export type Negocio = {
  /** Interno: acota las RPC. NUNCA sale en una respuesta. */
  tenantId: string;
  /** Lo único del negocio que se le enseña al cliente. */
  publico: Record<string, unknown>;
  nombre: string;
  /** Los ids de las sucursales que participan, en minúsculas. */
  sucursales: string[];
};

/** `{tenant_id, publico}` de `tienda_negocio`. NULL o cualquier otra forma = no hay tienda. */
export function leerNegocio(x: unknown): Negocio | null {
  if (!objeto(x) || typeof x.tenant_id !== "string" || !objeto(x.publico)) return null;
  const sucursales = Array.isArray(x.publico.sucursales) ? x.publico.sucursales : [];
  return {
    tenantId: x.tenant_id,
    publico: x.publico,
    nombre: typeof x.publico.nombre === "string" ? x.publico.nombre : "",
    sucursales: sucursales.flatMap((s) => (objeto(s) && typeof s.id === "string" ? [s.id.toLowerCase()] : [])),
  };
}

/** La cotización sin `items`: los renglones normalizados son la forma interna del ticket. */
export function cotizacionPublica(x: unknown): Record<string, unknown> | null {
  if (!objeto(x)) return null;
  return {
    renglones: x.renglones, subtotal_mxn: x.subtotal_mxn, envio_mxn: x.envio_mxn,
    envio_total_mxn: x.envio_total_mxn, total_mxn: x.total_mxn,
  };
}
