// El cliente del NAVEGADOR: todo lo que una pantalla le pide al servidor pasa por `POST /api/tienda`.
// Nunca lanza: cada llamada devuelve `ok` con los datos ya validados, o `error` con un código (para
// `textoDeError`) y su detalle. Un 200 que no tiene la forma del contrato es un error, no datos.
import { cotizacionDe, errorDe, pedidoDe, seguimientoDe, type Cotizacion, type Pago, type PedidoCreado, type Seguimiento } from "./contrato";
import type { CuerpoCarrito } from "./carrito";

/**
 * `error` es un código de la función (anexo §1.3) o uno de la tienda:
 *  · `SIN_CONEXION`  — no hubo respuesta (sin red o tardó demasiado). Se puede reintentar.
 *  · `SIN_CONFIRMAR` — solo en `pedir`: no se supo si el pedido entró. NO reintentar solo.
 *  · `CANCELADA`     — quien llamó abortó con su `signal`. No se enseña nada.
 */
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; detalle: string | null };

export type DireccionDePedido = {
  calle: string; numero_exterior: string; numero_interior: string | null; colonia: string;
  codigo_postal: string; ciudad: string; estado: string; referencias: string | null;
};
/** El cuerpo de `pedir` (anexo §1.9): el carrito de `aCuerpo` más los datos del cliente. */
export type CuerpoPedido = CuerpoCarrito & {
  cliente: { nombre: string; telefono: string; email: string | null };
  /** Obligatoria a domicilio; al recoger debe ser null. */
  direccion: DireccionDePedido | null;
  pago: Pago;
  /** Solo con EFECTIVO: texto con dos decimales (`aTexto`), entre el total y el total + 5000. */
  paga_con: string | null;
  nota: string | null;
  /** El token del antirobot (acción `tienda_pedido`). Sirve una vez: pide otro tras cada intento fallido. */
  captcha: string;
  /** El `total_mxn` de la cotización que vio el cliente: si ya no es ese, responde `TOTAL_CAMBIO`. */
  total_esperado: string | null;
};

const LIMITE_MS = 20_000;   // el servidor corta a los 10 s; esto es por si la red del teléfono se cuelga
const fallo = (error: string, detalle: string | null = null) => ({ ok: false as const, error, detalle });

/** `sinRespuesta`: el código cuando no se sabe qué pasó (sin red, o una respuesta que no es del contrato). */
async function llamar<T>(cuerpo: unknown, lector: (x: unknown) => T | null, sinRespuesta: { red: string; ilegible: string }, signal?: AbortSignal): Promise<Resultado<T>> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), LIMITE_MS);
  const cancelar = () => corte.abort();
  signal?.addEventListener("abort", cancelar);
  try {
    if (signal?.aborted) return fallo("CANCELADA");
    const r = await fetch("/api/tienda", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo), signal: corte.signal,
    });
    const json: unknown = await r.json().catch(() => null);
    if (r.status !== 200) {
      const e = errorDe(json, sinRespuesta.ilegible);
      return fallo(e.error, e.detalle);
    }
    const datos = lector(json);
    return datos === null ? fallo(sinRespuesta.ilegible) : { ok: true, datos };
  } catch {
    return fallo(signal?.aborted ? "CANCELADA" : sinRespuesta.red);
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener("abort", cancelar);
  }
}

const LECTURA = { red: "SIN_CONEXION", ilegible: "SERVICIO_NO_DISPONIBLE" };

/** El total que se va a cobrar. Se puede cotizar con la tienda cerrada. `signal` cancela una cotización que ya no interesa. */
export function cotizar(negocio: string, carrito: CuerpoCarrito, signal?: AbortSignal): Promise<Resultado<Cotizacion>> {
  return llamar({ accion: "cotizar", negocio, ...carrito }, cotizacionDe, LECTURA, signal);
}

/** El estado del pedido. `PEDIDO_NO_ENCONTRADO` = enlace vencido o mal copiado. */
export function seguimiento(negocio: string, codigo: string, signal?: AbortSignal): Promise<Resultado<Seguimiento>> {
  return llamar({ accion: "seguimiento", negocio, codigo }, seguimientoDe, LECTURA, signal);
}

/**
 * Manda el pedido. UNA llamada, sin reintentos: la función no evita el doble pedido. Si no se supo
 * qué pasó (sin red, tiempo de espera, respuesta ilegible) responde `SIN_CONFIRMAR`: hay que decirle
 * al cliente que revise con el restaurante antes de volver a intentar.
 * Con `ok`, el pedido existe aunque `folio_corto`, `total_mxn` y `vence_aceptacion` vengan en null.
 */
export async function pedir(negocio: string, pedido: CuerpoPedido): Promise<Resultado<PedidoCreado>> {
  const r = await llamar({ accion: "pedir", negocio, ...pedido }, pedidoDe, { red: "SIN_CONFIRMAR", ilegible: "SIN_CONFIRMAR" });
  // El servidor de la tienda no alcanzó a oír a la función: el pedido pudo haber entrado.
  return !r.ok && r.error === "SERVICIO_NO_DISPONIBLE" && r.detalle === "SIN_RESPUESTA" ? fallo("SIN_CONFIRMAR") : r;
}
