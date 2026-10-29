// Un pago de la liga de Checkout Pro de VIM: se relee en Mercado Pago, se aplica (wa_aplicar_pago
// registra, renueva y reactiva) y se confirma al cliente por WhatsApp. Al cliente nunca se le nombra
// a Fermín: «un agente». Los avisos a Fermín por lo que no cuadra (monto, fecha movida, cobro doble),
// la factura por emitir y el «pagó pero sigue suspendido» los deja wa_aplicar_pago en su transacción;
// desde aquí solo se le avisa lo que pasa fuera de ella (pago sin monto, confirmación que no salió).
import type { consultarPago } from "./mp-vim.ts";
import { cuerpoPlantilla, cuerpoTexto } from "../../whatsapp/enviar.ts";
import { registrarError, textoDeError } from "../../errores.ts";

export type DepsPago = {
  consultar(pagoId: string): ReturnType<typeof consultarPago>;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): Promise<any>;
  enviar(cuerpo: object): Promise<{ ok: boolean; wamid: string | null }>;
  registrarSalida(conversacionId: string, wamid: string, texto: string): Promise<void>;
  ahora(): Date;
};

const FN = "cobro-vim-webhook";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_MS = 24 * 3600_000;

/** Texto de la plantilla `pago_confirmado` (Utility, es_MX) tal como se da de alta en Meta; {{1}} es la fecha. */
export const PLANTILLA_PAGO_CONFIRMADO =
  "Tu pago a VIM POS quedó registrado. Tu próxima fecha de pago es el {{1}}. Si tienes dudas, contesta este mensaje.";

/** Lo único que se le dice al cliente cuando su pago no cuadra (solo dentro de la ventana de 24 h). */
export const PAGO_EN_REVISION = "Recibimos tu pago. Un agente lo revisa y te escribe.";

/** «2026-11-28» → «28 de noviembre de 2026», sin correr de día por la zona horaria. */
const fechaLegible = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Fecha de calendario (AAAA-MM-DD) de un instante en México. */
const fechaMexico = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);

/** Aviso a Fermín sin pausar al agente. Nunca lanza: lo llaman caminos que ya no deben dar 500. */
const avisar = (d: DepsPago, conv: string | null, motivo: string, resumen: string) =>
  d.rpc("wa_avisar_fermin", { p_conversacion_id: conv, p_motivo: motivo, p_resumen: resumen })
    .catch((err) => registrarError(FN, "AVISO", `${motivo}: ${textoDeError(err)}`));

export async function atenderPago(pagoId: string, d: DepsPago): Promise<"APLICADO" | "DUPLICADO" | "IGNORADO" | "RECHAZADO"> {
  const p = await d.consultar(pagoId);
  if (!p.ok) throw new Error(`MP_CONSULTA pago ${pagoId}: ${p.error}`); // 500: Mercado Pago reintenta
  if (p.estado !== "approved" || p.moneda !== "MXN" || !p.referencia || !UUID.test(p.referencia)) return "IGNORADO";
  if (!Number.isFinite(p.monto)) {
    console.warn(`[cobro-vim] pago ${pagoId} aprobado sin monto; se ignora`);
    await avisar(d, null, "Pago sin monto", `Mercado Pago aprobó el pago ${pagoId} (liga ${p.referencia}) sin monto; no se aplicó. Revísalo en Mercado Pago.`);
    return "IGNORADO";
  }

  const r = await d.rpc("wa_aplicar_pago", {
    p_intento_id: p.referencia, p_pago_id: pagoId, p_monto: p.monto,
    p_pagado_el: fechaMexico(p.aprobadoEl ? new Date(p.aprobadoEl) : d.ahora()),
  });
  if (r.resultado === "DUPLICADO") return "DUPLICADO";
  const rechazado = r.resultado === "MONTO_DISTINTO" || r.resultado === "FECHA_MOVIDA";
  if (!rechazado && r.resultado !== "APLICADO") return "IGNORADO";

  // De aquí en adelante nada lanza: el pago ya quedó (o ya se rechazó) y un reintento sería DUPLICADO.
  const conv = r.conversacion_id as string;
  // Fuera de la ventana de 24 h, Meta solo deja mandar plantillas aprobadas.
  const ultimo = r.ultimo_cliente_en ? new Date(r.ultimo_cliente_en).getTime() : 0;
  const dentro = d.ahora().getTime() - ultimo < DIA_MS;
  let enviado = false;
  try {
    if (rechazado) {
      // Fermín ya quedó avisado como URGENTE_SOPORTE; al cliente una línea, y solo si la ventana sigue abierta.
      if (!dentro) return "RECHAZADO";
      const s = await d.enviar(cuerpoTexto(r.wa_id, PAGO_EN_REVISION));
      enviado = s.ok;
      if (s.wamid) await d.registrarSalida(conv, s.wamid, PAGO_EN_REVISION);
      return "RECHAZADO";
    }
    const fecha = fechaLegible(r.proxima_fecha_cobro);
    const base = `Listo, ya quedó tu pago. Tu próxima fecha de pago es el ${fecha}.`;
    const texto = base +
      (r.reactivado ? " Tu caja se desbloquea en unos minutos." : "") +
      (r.sin_reactivar ? " Para desbloquear tu caja falta revisar algo más de tu cuenta. Un agente lo revisa y te escribe." : "") +
      (r.factura ? " Tu factura te llega por correo." : "");
    const s = await d.enviar(dentro ? cuerpoTexto(r.wa_id, texto) : cuerpoPlantilla(r.wa_id, "pago_confirmado", [fecha]));
    enviado = s.ok;
    if (s.wamid) await d.registrarSalida(conv, s.wamid, dentro ? texto : PLANTILLA_PAGO_CONFIRMADO.replace("{{1}}", fecha));
    if (!s.ok) throw new Error("WhatsApp no aceptó el mensaje");
  } catch (err) {
    registrarError(FN, "CONFIRMACION", `pago ${pagoId} ${rechazado ? "rechazado" : "aplicado"}, sin confirmar al cliente: ${textoDeError(err)}`);
    // Al cliente no le llegó: Fermín le escribe. Si solo falló registrar la salida, el mensaje sí salió.
    if (!enviado && !rechazado) {
      await avisar(d, conv, "Pago sin confirmar al cliente",
        `Pago ${pagoId} de $${p.monto.toFixed(2)} MXN de ${r.negocio ?? "un negocio"}: quedó aplicado, pero no se le pudo confirmar por WhatsApp. Escríbele.`);
    }
  }
  return rechazado ? "RECHAZADO" : "APLICADO";
}
