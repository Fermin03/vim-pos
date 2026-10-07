"use client";
// La revisión de lealtad antes de cobrar (ADR 0030, plan 1B). UNA sola, para los dos caminos que
// llegan al cobro: capturar y cobrar, o cobrar desde la lista de cuentas.
//
// Vive aparte de `lealtad.ts` porque necesita el canje a medias de `lealtad-canje.ts`, que ya
// importa a `lealtad.ts`: ponerla allá cerraría un ciclo de imports.
import { leerTotales, type TotalesTicket } from "./cobro";
import { leerCanjeDelTicket, quitarCanje } from "./lealtad";
import { leerPendiente, type Almacen } from "./lealtad-canje";
import { canjeRecortado, cantidad, type Mecanica } from "./lealtad-reglas";

export type RevisionAntesDeCobrar =
  /** Se cobra, con estos totales recién leídos. */
  | { accion: "COBRAR"; totales: TotalesTicket }
  /** NO se abre el cobro: se avisa. `totales` viene cuando la cuenta cambió y se pudo releer. */
  | { accion: "AVISAR"; titulo: string; texto: string; totales: TotalesTicket | null };

/**
 * Lo que hay que mirar de la lealtad antes de abrir el cobro de una cuenta que ya existe:
 *
 *  1. Un canje A MEDIAS guardado en este dispositivo. La nube pudo haber descontado ya los puntos
 *     sin que el descuento esté en la cuenta: cobrar así es que el cliente pague completo y además
 *     pierda sus puntos, en silencio. No se toca nada; se manda a resolverlo.
 *  2. Un canje de dinero RECORTADO: la cuenta bajó (se canceló un platillo) y la base recortó el
 *     descuento, pero el cliente ya pagó todos sus puntos. Se quita completo —los puntos vuelven— y
 *     se avisa. Se decide con totales RECIÉN LEÍDOS, nunca con los que traiga quien llama: si esos
 *     son anteriores al canje (otro dispositivo canjeó sobre la misma mesa), un canje sano parecería
 *     recortado y se quitaría con un aviso falso.
 *
 * Si algo falla aquí, lanza: quien llama lo atrapa y cobra con lo que tenía. Una venta nunca se
 * cae por la lealtad. La única falla que NO se lanza es la relectura después de quitar el canje:
 * ahí el total ya cambió y abrir el cobro con el anterior sería cobrar de menos.
 */
export async function revisarLealtadAntesDeCobrar(
  token: string,
  ticketId: string,
  mecanica: Mecanica,
  almacen: Almacen,
): Promise<RevisionAntesDeCobrar> {
  const pendiente = leerPendiente(almacen, ticketId);
  if (pendiente) {
    return {
      accion: "AVISAR",
      titulo: "Hay un canje a medias",
      texto: `Esta cuenta tiene un canje de ${cantidad(pendiente.mecanica, pendiente.puntos)} que quedó a medias. Puede que al cliente ya se le hayan descontado. Antes de cobrar, abre Lealtad en esta cuenta y termínalo con Reintentar, o descártalo.`,
      totales: null,
    };
  }

  const totales = await leerTotales(token, ticketId);
  const canje = await leerCanjeDelTicket(token, ticketId);
  if (!canje || !canjeRecortado(canje, totales.lealtad)) return { accion: "COBRAR", totales };

  await quitarCanje(token, ticketId);
  try {
    return {
      accion: "AVISAR",
      titulo: "Se quitó el canje de lealtad",
      texto: `Se quitó el canje de ${cantidad(mecanica, canje.puntos)} porque la cuenta bajó a menos de eso. Los puntos volvieron al cliente. Si los quiere usar, vuelve a canjear.`,
      totales: await leerTotales(token, ticketId),
    };
  } catch {
    return {
      accion: "AVISAR",
      titulo: "El total de la cuenta cambió",
      texto: "Se quitó un canje de lealtad que ya no cabía en la cuenta y los puntos volvieron al cliente. Revisa el total y vuelve a cobrar.",
      totales: null,
    };
  }
}
