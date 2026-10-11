// Contra la prueba masiva de tarjetas robadas: quien tiene una lista de tarjetas las prueba una por
// una contra una tienda y lee, en la respuesta, cuáles sirven y por qué fallan las demás.
// Tres frenos, los tres con los contadores de siempre (limites_cupo, 0136), que cuentan aunque el
// pedido rechazado se borre:
//   · tras 3 rechazos de una IP en una hora, el motivo que se le dice es siempre OTRO: deja de
//     servirle para saber si falló el código, la fecha o el saldo;
//   · tras 5, esa IP no puede intentar pagar en línea esa hora (los pedidos al recibir, sí);
//   · si en un negocio se juntan 12 rechazos en una hora, su pago en línea se pausa una hora
//     (tienda_pago_pausar, 0173) y se avisa a VIM. Los pedidos al recibir siguen.
// Puro salvo por el cliente que se le pasa: se prueba con `node --test`.
import { esc, soloAscii } from "../correo.ts";
import { type ClienteRpc, consumirCupo } from "../limite.ts";
import type { MotivoDeRechazo } from "./pago-mp.ts";
import { claveDeIp } from "./respuesta.ts";

export const RECHAZOS = {
  ventanaSeg: 3600,
  /** Rechazos de una IP con su motivo; del siguiente en adelante, OTRO. */
  ipConDetalle: 3,
  /** Con estos rechazos, la IP ya no intenta pagar en línea en esa hora. */
  ipBloqueo: 5,
  /**
   * Con estos rechazos en una hora se pausa el pago en línea del negocio. Un restaurante con mucho
   * movimiento ve 3 o 4 por hora (uno de cada diez cobros); quien prueba tarjetas, decenas.
   */
  negocioPausa: 12,
} as const;

const claves = (ip: string, negocio: string) => ({
  ip: `tienda:pago-rechazo:ip:${claveDeIp(ip)}`,
  negocio: `tienda:pago-rechazo:negocio:${negocio}`,
});

/**
 * ¿Esa IP ya juntó sus rechazos de la hora y no puede intentar otro pago en línea? No suma nada
 * (`cupo_agotado`). Si el control no responde, deja pasar: los cupos de `pedir` ya cierran solos.
 */
export async function ipSinPagoEnLinea(db: ClienteRpc, ip: string, negocio: string): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("cupo_agotado", { p_clave: claves(ip, negocio).ip, p_ventana: `${RECHAZOS.ventanaSeg} seconds`, p_max: RECHAZOS.ipBloqueo });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    console.error("[tienda] cupo_agotado falló; se deja pasar:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Anota un cobro rechazado. Devuelve el motivo que se le puede decir a ESE cliente y si el negocio
 * acaba de llegar al tope (hay que pausar su pago en línea).
 * Si el contador no responde, el motivo es OTRO (no se regala información) y no se pausa nada
 * (una caída de la base no le apaga el pago en línea a nadie).
 */
export async function anotarRechazo(db: ClienteRpc, ip: string, negocio: string, motivo: MotivoDeRechazo): Promise<{ detalle: MotivoDeRechazo; pausar: boolean }> {
  const k = claves(ip, negocio);
  const porIp = await consumirCupo(db, { clave: k.ip, ventanaSeg: RECHAZOS.ventanaSeg, max: RECHAZOS.ipConDetalle }, "cerrar");
  // `max` es cuántos caben: con negocioPausa - 1, el que hace negocioPausa ya no cabe.
  const porNegocio = await consumirCupo(db, { clave: k.negocio, ventanaSeg: RECHAZOS.ventanaSeg, max: RECHAZOS.negocioPausa - 1 }, "abrir");
  return { detalle: porIp.permitido ? motivo : "OTRO", pausar: porNegocio.motivo === "AGOTADO" };
}

/** El correo interno a VIM cuando el pago en línea de un negocio (o de una sucursal) queda en pausa. Sin datos de clientes ni de tarjetas. */
export function avisoDePagoPausado(d: { negocio: string; slug: string; sucursal?: string | null; por: "RECHAZOS" | "SIN_PERMISO" }): { subject: string; html: string } {
  const donde = d.sucursal ? `la sucursal ${d.sucursal} de ${d.negocio}` : d.negocio;
  const porque = d.por === "RECHAZOS"
    ? `En su tienda se juntaron ${RECHAZOS.negocioPausa} cobros con tarjeta rechazados en una hora. Puede ser alguien probando tarjetas robadas.`
    : "Mercado Pago rechazó las credenciales de su cuenta al cobrar (401). Lo más probable es que el restaurante revocó el permiso o que el token venció: tiene que volver a conectar Mercado Pago en Tienda en línea.";
  return {
    subject: soloAscii(`Pago en linea en pausa: ${d.slug}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>El pago en línea de <strong>${esc(donde)}</strong> quedó en pausa una hora: la tienda no lo ofrece y los pedidos al recibir siguen entrando.</p>
<p>${porque}</p>
<p>La pausa se levanta sola. Si se repite, llegará otro correo como este.</p>
</div>`,
  };
}
