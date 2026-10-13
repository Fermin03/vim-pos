// Contra la prueba masiva de tarjetas robadas: quien tiene una lista de tarjetas las prueba una por
// una contra una tienda y lee, en la respuesta, cuáles sirven y por qué fallan las demás.
// Tres frenos, los tres con los contadores de siempre (limites_cupo, 0136), que cuentan aunque el
// pedido rechazado se borre:
//   · tras 3 rechazos de una IP en una hora, el motivo que se le dice es siempre OTRO: deja de
//     servirle para saber si falló el código, la fecha o el saldo;
//   · tras 5, esa IP no puede intentar pagar en línea esa hora (los pedidos al recibir, sí);
//   · si en un negocio se juntan 20 rechazos de TARJETAS DE VERDAD en una hora, repartidos en al
//     menos 8 IP distintas, su pago en línea se pausa una hora (tienda_pago_pausar, 0173) y se avisa
//     a VIM. Los pedidos al recibir siguen.
// La pausa del negocio no la puede provocar un solo atacante con pocas peticiones: una IP aporta a
// lo sumo 5 rechazos por hora (después queda fuera) y hacen falta 8 distintas; y lo que no es una
// tarjeta —un token inventado o usado, una petición que Mercado Pago no aceptó— no cuenta para el
// negocio (`soloIp`): solo para la IP que lo mandó.
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
   * Para pausar el pago en línea del negocio hacen falta LAS DOS: estos rechazos de tarjetas reales
   * en la hora… Un restaurante con mucho movimiento ve 3 o 4 por hora (uno de cada diez cobros).
   */
  negocioPausa: 20,
  /** …y que vengan de al menos estas IP distintas (IPv6: por su /64). */
  negocioIps: 8,
} as const;

const claves = (ip: string, negocio: string) => ({
  ip: `tienda:pago-rechazo:ip:${claveDeIp(ip)}`,
  negocio: `tienda:pago-rechazo:negocio:${negocio}`,
  /** ¿Esta IP ya contó en este negocio en esta hora? */
  ipEnNegocio: `tienda:pago-rechazo:negocio-ip:${negocio}:${claveDeIp(ip)}`,
  /** Cuántas IP distintas llevan algún rechazo en este negocio en esta hora. */
  ipsDeNegocio: `tienda:pago-rechazo:negocio-ips:${negocio}`,
});

const agotado = async (db: ClienteRpc, clave: string, max: number): Promise<boolean> => {
  const { data, error } = await db.rpc("cupo_agotado", { p_clave: clave, p_ventana: `${RECHAZOS.ventanaSeg} seconds`, p_max: max });
  if (error) throw new Error(error.message);
  return data === true;
};

/**
 * ¿Esa IP ya juntó sus rechazos de la hora y no puede intentar otro pago en línea? No suma nada
 * (`cupo_agotado`). Si el control no responde, deja pasar: los cupos de `pedir` ya cierran solos.
 */
export async function ipSinPagoEnLinea(db: ClienteRpc, ip: string, negocio: string): Promise<boolean> {
  try {
    return await agotado(db, claves(ip, negocio).ip, RECHAZOS.ipBloqueo);
  } catch (e) {
    console.error("[tienda] cupo_agotado falló; se deja pasar:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Anota un cobro que no pasó. Devuelve el motivo que se le puede decir a ESE cliente y si el negocio
 * acaba de llegar a su tope (hay que pausar su pago en línea).
 * `soloIp`: no fue una tarjeta rechazada (token inventado o usado): cuenta para la IP y nada más.
 * Si un contador no responde, el motivo es OTRO (no se regala información) y no se pausa nada
 * (una caída de la base no le apaga el pago en línea a nadie).
 */
export async function anotarRechazo(db: ClienteRpc, ip: string, negocio: string, motivo: MotivoDeRechazo, soloIp = false): Promise<{ detalle: MotivoDeRechazo; pausar: boolean }> {
  const k = claves(ip, negocio), v = RECHAZOS.ventanaSeg;
  const porIp = await consumirCupo(db, { clave: k.ip, ventanaSeg: v, max: RECHAZOS.ipConDetalle }, "cerrar");
  const detalle = porIp.permitido ? motivo : "OTRO";
  if (soloIp) return { detalle, pausar: false };
  // La primera vez que ESTA IP falla en ESTE negocio en la hora, suma una a las IP distintas.
  const primera = await consumirCupo(db, { clave: k.ipEnNegocio, ventanaSeg: v, max: 1 }, "cerrar");
  if (primera.motivo === "OK") await consumirCupo(db, { clave: k.ipsDeNegocio, ventanaSeg: v, max: 1_000_000 }, "abrir");
  // `max` es cuántos caben: con negocioPausa - 1, el que hace negocioPausa ya no cabe.
  const total = await consumirCupo(db, { clave: k.negocio, ventanaSeg: v, max: RECHAZOS.negocioPausa - 1 }, "abrir");
  if (total.motivo !== "AGOTADO") return { detalle, pausar: false };
  return { detalle, pausar: await agotado(db, k.ipsDeNegocio, RECHAZOS.negocioIps).catch(() => false) };
}

/** El correo interno a VIM cuando el pago en línea de un negocio (o de una sucursal) queda en pausa. Sin datos de clientes ni de tarjetas. */
export function avisoDePagoPausado(d: { negocio: string; slug: string; sucursal?: string | null; por: "RECHAZOS" | "SIN_PERMISO" }): { subject: string; html: string } {
  const donde = d.sucursal ? `la sucursal ${d.sucursal} de ${d.negocio}` : d.negocio;
  const porque = d.por === "RECHAZOS"
    ? `En su tienda se juntaron ${RECHAZOS.negocioPausa} cobros con tarjeta rechazados en una hora, desde al menos ${RECHAZOS.negocioIps} redes distintas. Puede ser alguien probando tarjetas robadas.`
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
