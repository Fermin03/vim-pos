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

/**
 * Lo que identifica a un cliente en el cupo por IP. IPv4, completa. IPv6, su /64 (los cuatro
 * primeros grupos tras expandir `::`): un solo cliente recibe un /64 entero, así que contar por
 * dirección le daría 2^64 cupos. `::ffff:a.b.c.d` es una IPv4. Lo que no se entiende, "desconocida".
 * ponytail: una IPv4 mapeada escrita en hexadecimal (`::ffff:102:304`) cae en el /64 `0:0:0:0`,
 * compartido; si un proxy la mandara así, convertirla aquí.
 */
export function claveDeIp(ip: string): string {
  const v = ip.trim().toLowerCase();
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapeada) return claveDeIp(mapeada[1]!);
  if (!v.includes(":")) return pareceIp(v) ? v : "desconocida";
  const mitades = v.split("::");
  if (mitades.length > 2) return "desconocida";
  const izq = mitades[0] ? mitades[0].split(":") : [];
  const der = mitades[1] ? mitades[1].split(":") : [];
  const faltan = 8 - izq.length - der.length;
  if (mitades.length === 2 ? faltan < 1 : faltan !== 0) return "desconocida";
  const grupos = [...izq, ...Array<string>(faltan).fill("0"), ...der];
  if (!grupos.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return "desconocida";
  return `${grupos.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/**
 * Los cupos de una acción (diseño §10). Pedir crea filas: si el control no responde, se cierra.
 * En `pedir` van en dos tiempos: el de la IP antes del antirobot y el del negocio solo DESPUÉS de
 * pasarlo. Si los dos se gastaran al entrar, 60 peticiones basura por hora (sin token) dejarían a
 * un restaurante sin tienda.
 */
export function cuposDe(accion: Peticion["accion"], ip: string, negocio: string): { antes: Cupo[]; despuesDelCaptcha: Cupo[]; alFallar: "abrir" | "cerrar" } {
  const quien = claveDeIp(ip);
  if (accion !== "pedir") {
    return { antes: [{ clave: `tienda:lee:ip:${quien}`, ventanaSeg: 600, max: 120 }], despuesDelCaptcha: [], alFallar: "abrir" };
  }
  return {
    antes: [{ clave: `tienda:pide:ip:${quien}`, ventanaSeg: 3600, max: 5 }],
    despuesDelCaptcha: [{ clave: `tienda:pide:negocio:${negocio}`, ventanaSeg: 3600, max: 60 }],
    alFallar: "cerrar",
  };
}

/**
 * El antirobot no pasó. Sin configurar es un fallo NUESTRO (503, como signup-tenant): decirle
 * «captcha inválido» a todos los clientes escondería que la tienda entera no puede recibir pedidos.
 */
export function respuestaDeCaptcha(motivo: string):
  | { status: 503; body: { error: "SERVICIO_NO_DISPONIBLE" } }
  | { status: 403; body: { error: "CAPTCHA_INVALIDO" } } {
  return motivo === "NO_CONFIGURADO"
    ? { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } }
    : { status: 403, body: { error: "CAPTCHA_INVALIDO" } };
}

// Las funciones SQL (0162) rechazan con `RAISE EXCEPTION 'CODIGO: detalle'`, y PostgREST lo entrega
// en `error.message`. Un código es MAYUSCULAS_CON_GUION_BAJO, con al menos un guion: así "FATAL: …"
// o "ERROR" de Postgres no pasan por rechazo de negocio. Todo lo demás es un fallo nuestro.
const CODIGO = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:: ?([\s\S]*))?$/;
// Solo en estos el detalle le sirve al cliente: un motivo (FUERA_DE_HORARIO…), el id de un producto
// de su propio carrito o, en TOTAL_CAMBIO, el total nuevo. A cada código se le exige SU forma: si un
// día el SQL pusiera otra cosa, no sale.
const DETALLE = /^[A-Za-z0-9_-]{1,64}$/;
/** Un importe como lo escribe el SQL: dígitos, punto y dos decimales. */
const IMPORTE = /^\d+\.\d{2}$/;
const CON_DETALLE = new Map<string, RegExp>([
  ["TIENDA_CERRADA", DETALLE], ["PRODUCTO_NO_DISPONIBLE", DETALLE], ["MODIFICADORES_INVALIDOS", DETALLE],
  ["COMBO_INVALIDO", DETALLE], ["TOTAL_CAMBIO", IMPORTE],
]);

export type RespuestaRpc =
  | { status: 409; body: { error: string; detalle?: string } }
  | { status: 503; body: { error: "SERVICIO_NO_DISPONIBLE" } };

/** El `error.message` de una RPC → lo que se responde. Nunca incluye el texto crudo de la base. */
export function respuestaDeRpc(mensaje: unknown): RespuestaRpc {
  const m = typeof mensaje === "string" ? CODIGO.exec(mensaje) : null;
  if (!m) return { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } };
  const codigo = m[1]!, detalle = m[2] ?? "";
  return CON_DETALLE.get(codigo)?.test(detalle)
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

export type Pedido = { folio_corto: string; total_mxn: string; vence_aceptacion: string };

/**
 * Lo que devuelve `tienda_crear_pedido`, sin su `pedido_id` (interno). Cualquier otra forma es null
 * y NO una excepción: cuando esto se lee el pedido ya existe, y un 500 dejaría al cliente sin su
 * código de seguimiento.
 */
export function leerPedido(x: unknown): Pedido | null {
  if (!objeto(x)) return null;
  const { folio_corto, total_mxn, vence_aceptacion } = x;
  if (typeof folio_corto !== "string" || !folio_corto || typeof total_mxn !== "string" || !IMPORTE.test(total_mxn)
      || typeof vence_aceptacion !== "string" || !vence_aceptacion) return null;
  return { folio_corto, total_mxn, vence_aceptacion };
}

/** La cotización sin `items`: los renglones normalizados son la forma interna del ticket. */
export function cotizacionPublica(x: unknown): Record<string, unknown> | null {
  if (!objeto(x)) return null;
  return {
    renglones: x.renglones, subtotal_mxn: x.subtotal_mxn, envio_mxn: x.envio_mxn,
    envio_total_mxn: x.envio_total_mxn, total_mxn: x.total_mxn,
  };
}
