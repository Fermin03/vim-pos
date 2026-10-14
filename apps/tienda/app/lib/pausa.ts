// La pausa del pago en línea tras un rechazo por riesgo (`high_risk`: el antifraude de Mercado Pago,
// no el banco). Quien manda es el SERVIDOR: mientras dure, `pedir` con pago en línea contesta
// `PAGO_EN_PAUSA` sin cobrar nada, se recargue o no la página. Lo de aquí es solo para que la
// pantalla lo sepa de entrada —la opción en línea apagada y hasta cuándo— sin hacerle escribir la
// tarjeta otra vez para enterarse. Si el teléfono no lo recuerda (modo privado, otro navegador), lo
// dirá el servidor en el primer intento.
//
// Puro salvo por el almacén que se le pasa. La pantalla es components/datos.tsx.
import { almacenDelNavegador, type Almacen } from "./carrito";
import { aLaHora, momentoMx } from "./horario";

/** Lo que dura la pausa si el servidor no dijo hasta cuándo: lo mismo que pone él (30 minutos). */
export const PAUSA_POR_OMISION_MS = 30 * 60_000;
/** Ninguna pausa se cree por más de un día: una hora rara del servidor (o del reloj del teléfono) no apaga el pago para siempre. */
const TOPE_MS = 24 * 60 * 60_000;

export const dondeDeLaPausa = (negocio: string): string => `vim.tienda.pausa.${negocio}`;

/**
 * Hasta cuándo dura la pausa, en milisegundos. `hasta` es lo que dijo el servidor (ISO); si no vino o
 * no se puede leer, 30 minutos desde ahora. Una hora ya pasada es «ya»: no hay pausa que enseñar.
 */
export function finDeLaPausa(hasta: string | null | undefined, ahora: number = Date.now()): number {
  const t = typeof hasta === "string" ? Date.parse(hasta) : NaN;
  return Number.isFinite(t) ? Math.min(t, ahora + TOPE_MS) : ahora + PAUSA_POR_OMISION_MS;
}

/** La pausa guardada de ESTE negocio, si sigue viva; la vencida (o ilegible) se borra. */
export function leerPausa(negocio: string, almacen: Almacen | null = almacenDelNavegador(), ahora: number = Date.now()): number | null {
  try {
    const t = Number(almacen?.getItem(dondeDeLaPausa(negocio)) ?? NaN);
    if (Number.isFinite(t) && t > ahora && t <= ahora + TOPE_MS) return t;
    almacen?.removeItem(dondeDeLaPausa(negocio));
  } catch { /* almacén bloqueado: no hay nada que recordar */ }
  return null;
}

export function guardarPausa(negocio: string, hasta: number, almacen: Almacen | null = almacenDelNavegador()): void {
  try { almacen?.setItem(dondeDeLaPausa(negocio), String(hasta)); } catch { /* cuota llena o modo privado: vive en memoria */ }
}

/** «a partir de las 3:45 p. m.» (hora del centro de México, como el resto de la tienda). */
export function aPartirDe(hasta: number): string {
  return aLaHora(momentoMx(new Date(hasta)).hora).replace(/^a /, "a partir de ");
}

// TEXTOS PROVISIONALES (James). No nombran a Mercado Pago ni prometen que después sí pase.
/**
 * Lo que se le dice al cliente con el pago en línea en pausa.
 *  · `recienRechazado`: acaba de pasar (el cobro no se aprobó): no fue su banco y no se le cobró.
 *    Si no, ya estaba en pausa y lo intentó otra vez: tampoco se cobró nada.
 *  · `otrasFormas`: hay otra forma de pagar, y se ofrece; si no, más tarde o llamar al restaurante.
 */
export function textoDePausa(hasta: number, d: { recienRechazado: boolean; otrasFormas: boolean }): string {
  const que = d.recienRechazado ? "No pudimos aprobar este pago en línea. No fue tu banco y no se te cobró nada."
    : "El pago en línea está en pausa para ti por ahora. No se te cobró nada.";
  const hacer = d.otrasFormas ? `Puedes pagar de otra forma, o intentar en línea otra vez ${aPartirDe(hasta)}`
    : `Intenta otra vez ${aPartirDe(hasta)} o llama al restaurante.`;
  // La hora ya cierra con punto («p. m.»): no se le pone otro.
  return `${que} ${hacer}`;
}
/** La línea bajo «Pagar en línea» en «¿Cómo pagas?», con la opción apagada. */
export const lineaDePausa = (hasta: number): string => `Disponible otra vez ${aPartirDe(hasta)}`;
export const BOTON_OTRA_FORMA = "Elegir otra forma de pago";
