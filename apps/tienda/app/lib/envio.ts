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
}, c: ContextoDeEnvio): Promise<ResultadoDeEnvio> {
  // Nunca lanza: quien espera el resultado siempre recibe qué decirle al cliente. `cotizar` y `pedir`
  // tampoco deberían lanzar; si un día lo hacen, antes de pedir no se creó nada y, pidiendo, no se
  // sabe: se trata como «no supimos si entró».
  let pidio = false;
  try {
    const cot = await d.cotizar();
    if (!cot.ok) return { desenlace: desenlaceDelError(cot, c), pidio };
    if (cot.datos.total_mxn !== d.totalVisto) return { desenlace: { tipo: "total", total: cot.datos.total_mxn }, pidio };
    pidio = true;
    const r = await d.pedir(cot.datos.total_mxn);
    return { desenlace: r.ok ? { tipo: "hecho", codigo: r.datos.codigo } : desenlaceDelError(r, c), pidio };
  } catch {
    return { desenlace: desenlaceDelError({ error: pidio ? "SIN_CONFIRMAR" : "ERROR_INTERNO", detalle: null }, c), pidio };
  }
}

export type ResultadoDeEnvio = { desenlace: Desenlace; pidio: boolean };

/**
 * El candado del envío. Vive FUERA de la pantalla (uno por página): un candado dentro del componente
 * se perdía si «Tus datos» se desmontaba a medio envío, y al volver a entrar se podía mandar el
 * mismo pedido otra vez con el primero todavía en vuelo.
 *  · `lanzar` es síncrono: el segundo toque (o la segunda pantalla) recibe `false` y no envía. El
 *    estado de React llega un render tarde para esto.
 *  · El resultado se entrega a la pantalla que esté viva (`recibir`); si no hay ninguna, se guarda
 *    para la siguiente. Un «no pudimos confirmar tu pedido» nunca se queda sin decir.
 *  · Se libera siempre, también si el envío o la pantalla lanzan, y DESPUÉS de entregar el resultado:
 *    no hay un instante con el botón vivo y el aviso sin pintar.
 * ponytail: un resultado guardado no sabe de qué negocio era; si un día se pudiera cambiar de
 * negocio sin recargar con un envío en vuelo, etiquetarlo.
 */
export function candadoDeEnvio<R>() {
  let enVuelo = false, guardado: { r: R } | null = null, pantalla: ((r: R) => void) | null = null;
  const atentos = new Set<() => void>();
  const cambiar = (v: boolean) => { enVuelo = v; for (const a of atentos) a(); };
  return {
    ocupado: (): boolean => enVuelo,
    /** Avisa cada vez que se ocupa o se libera. Devuelve cómo dejar de mirar. */
    suscribir(atento: () => void): () => void {
      atentos.add(atento);
      return () => { atentos.delete(atento); };
    },
    /** Arranca el envío si no hay otro en vuelo. `false` = ya había uno: este no se manda. */
    lanzar(envio: () => Promise<R>): boolean {
      if (enVuelo) return false;
      cambiar(true);
      void (async () => {
        try {
          const r = await envio();
          if (pantalla) pantalla(r);
          else guardado = { r };
        } catch (e) {
          console.error("[tienda] el envío terminó sin resultado", e);
        } finally {
          cambiar(false);
        }
      })();
      return true;
    },
    /** La pantalla viva se apunta: recibe lo que quedó guardado y lo que venga. Devuelve cómo darse de baja. */
    recibir(p: (r: R) => void): () => void {
      pantalla = p;
      if (guardado) { const { r } = guardado; guardado = null; p(r); }
      return () => { if (pantalla === p) pantalla = null; };
    },
  };
}

/** El de la página: lo comparten «Tus datos» (que envía) y la tienda (que no deja salir mientras). */
export const envioDeLaPagina = candadoDeEnvio<ResultadoDeEnvio>();
