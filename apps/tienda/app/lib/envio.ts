// «Enviar»: qué hace la pantalla con cada respuesta. Antes de pedir se cotiza OTRA vez (no vale la
// cotización de hace minutos) y ese total viaja como `total_esperado`. El pedido nunca se reintenta
// solo (decisión 8): si no se supo si entró, se le dice al cliente que llame antes de insistir.
import type { Resultado } from "./api";
import type { Campo } from "./cliente";
import type { Cotizacion, ErrorDeTienda, PedidoCreado } from "./contrato";
import type { Horario } from "@vim/fecha";
import type { Momento } from "./horario";
import { formatoTelefono } from "./telefono";
import { textoCerrada, textoDeError } from "./textos";

export type Desenlace =
  /** El pedido existe (también si vino sin folio ni total): vaciar el carrito e ir al seguimiento. */
  | { tipo: "hecho"; codigo: string }
  /** Un renglón ya no se puede pedir: de vuelta al carrito, que lo marca. */
  | { tipo: "carrito"; error: ErrorDeTienda }
  /** El total ya no es el que vio: se enseña el nuevo y se pide confirmar antes de enviar con él. */
  | { tipo: "total"; total: string }
  /** El error es de un campo (o de la forma de pago): se marca ahí y se le da el foco. */
  | { tipo: "campo"; campo: Campo | "pago"; texto: string }
  | {
    tipo: "aviso"; tono: "danger" | "warning"; texto: string;
    /**
     * Qué se ofrece después:
     *  · `reintentar`  — el botón de enviar sigue ahí;
     *  · `volver`      — se arregla en el carrito (zona, modo, productos);
     *  · `llamar`      — por aquí no se va a poder: llamar al restaurante;
     *  · `llamar-antes`— el pedido PUDO haber entrado: primero llamar; reintentar solo si lo pide a propósito.
     */
    sigue: "reintentar" | "volver" | "llamar" | "llamar-antes";
  };

export type ContextoDeEnvio = { telefono: string | null; horario: Horario; ahora?: Momento };

const DE_RENGLON = new Set(["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]);
const DE_CAMPO: Record<string, Campo | "pago"> = { CLIENTE_INVALIDO: "nombre", DIRECCION_INVALIDA: "calle", PAGO_INVALIDO: "pago" };
const DEL_CARRITO = new Set(["ZONA_INVALIDA", "MODO_INVALIDO", "CARRITO_INVALIDO", "PRECIO_INVALIDO", "SUCURSAL_INVALIDA", "SUCURSAL_DE_OTRO_NEGOCIO", "CUERPO_DEMASIADO_GRANDE"]);
const SOLO_LLAMAR = new Set(["NO_SE_PUDO_CREAR", "TIENDA_NO_DISPONIBLE"]);

/** De un rechazo (de cotizar o de pedir) a lo que hace la pantalla. */
export function desenlaceDelError(e: ErrorDeTienda, c: ContextoDeEnvio): Desenlace {
  if (DE_RENGLON.has(e.error) && e.detalle) return { tipo: "carrito", error: e };
  if (e.error === "TOTAL_CAMBIO" && e.detalle && /^\d+\.\d{2}$/.test(e.detalle)) return { tipo: "total", total: e.detalle };
  const t = textoDeError(e.error, { telefono: c.telefono, detalle: e.detalle });
  const texto = `${t.texto} ${t.hacer}`;
  const campo = DE_CAMPO[e.error];
  if (campo) return { tipo: "campo", campo, texto };
  if (e.error === "TIENDA_CERRADA") return { tipo: "aviso", tono: "warning", texto: textoCerrada(e.detalle ?? "", c.horario, c.ahora), sigue: "reintentar" };
  if (e.error === "SIN_CONFIRMAR") {
    const tel = c.telefono ? `: ${formatoTelefono(c.telefono)}` : "";
    return { tipo: "aviso", tono: "danger", texto: `No pudimos confirmar tu pedido. Antes de volver a intentarlo, llama al restaurante${tel}.`, sigue: "llamar-antes" };
  }
  return {
    tipo: "aviso", tono: "danger", texto,
    sigue: SOLO_LLAMAR.has(e.error) ? "llamar" : DEL_CARRITO.has(e.error) || DE_RENGLON.has(e.error) ? "volver" : "reintentar",
  };
}

/**
 * Un intento de envío, de principio a fin: cotiza y, solo si el total es el que el cliente vio
 * (`totalVisto`), pide con ese total. `pidio` dice si se llegó a llamar a `pedir`: el token del
 * antirobot ya se gastó y hay que pedir otro antes del siguiente intento.
 */
export async function enviarPedido(d: {
  cotizar: () => Promise<Resultado<Cotizacion>>;
  pedir: (totalEsperado: string) => Promise<Resultado<PedidoCreado>>;
  /** El total del botón que tocó (o el que confirmó tras un cambio). null = no vio ninguno. */
  totalVisto: string | null;
}, c: ContextoDeEnvio): Promise<{ desenlace: Desenlace; pidio: boolean }> {
  const cot = await d.cotizar();
  if (!cot.ok) return { desenlace: desenlaceDelError(cot, c), pidio: false };
  if (cot.datos.total_mxn !== d.totalVisto) return { desenlace: { tipo: "total", total: cot.datos.total_mxn }, pidio: false };
  const r = await d.pedir(cot.datos.total_mxn);
  return { desenlace: r.ok ? { tipo: "hecho", codigo: r.datos.codigo } : desenlaceDelError(r, c), pidio: true };
}

/**
 * Doble toque imposible: mientras una llamada está en vuelo, las demás no hacen nada (devuelven
 * null). Es un candado síncrono: el estado de React llega un render tarde para esto.
 */
export function unaALaVez<A extends unknown[], R>(f: (...a: A) => Promise<R>): (...a: A) => Promise<R | null> {
  let enVuelo = false;
  return async (...a) => {
    if (enVuelo) return null;
    enVuelo = true;
    try { return await f(...a); } finally { enVuelo = false; }
  };
}
