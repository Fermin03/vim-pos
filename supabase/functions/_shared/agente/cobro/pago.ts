// Un pago de la liga de Checkout Pro de VIM: se relee en Mercado Pago, se aplica (wa_aplicar_pago
// registra, renueva y reactiva) y se confirma al cliente por WhatsApp. Al cliente nunca se le nombra
// a Fermín: «un agente». Lo que no cuadra (monto, fecha movida, cobro doble) va a Fermín como
// URGENTE_SOPORTE desde aquí; la factura por emitir y el «pagó pero sigue suspendido» los avisa
// wa_aplicar_pago en su misma transacción.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_MS = 24 * 3600_000;

/** «2026-11-28» → «28 de noviembre de 2026», sin correr de día por la zona horaria. */
const fechaLegible = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Fecha de calendario (AAAA-MM-DD) de un instante en México. */
const fechaMexico = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);

export async function atenderPago(pagoId: string, d: DepsPago): Promise<"APLICADO" | "DUPLICADO" | "IGNORADO" | "RECHAZADO"> {
  const p = await d.consultar(pagoId);
  if (!p.ok) throw new Error(`MP_CONSULTA pago ${pagoId}: ${p.error}`); // 500: Mercado Pago reintenta
  if (p.estado !== "approved" || p.moneda !== "MXN" || !p.referencia || !UUID.test(p.referencia)) return "IGNORADO";
  if (!Number.isFinite(p.monto)) {
    console.warn(`[cobro-vim] pago ${pagoId} aprobado sin monto; se ignora`);
    return "IGNORADO";
  }

  const r = await d.rpc("wa_aplicar_pago", {
    p_intento_id: p.referencia, p_pago_id: pagoId, p_monto: p.monto,
    p_pagado_el: fechaMexico(p.aprobadoEl ? new Date(p.aprobadoEl) : d.ahora()),
  });
  const conv = r.conversacion_id as string;
  const pago = `Pago ${pagoId} de $${p.monto.toFixed(2)} MXN de ${r.negocio ?? "un negocio"}`;

  if (r.resultado === "MONTO_DISTINTO" || r.resultado === "FECHA_MOVIDA") {
    const porque = r.resultado === "MONTO_DISTINTO"
      ? "el monto no coincide con la liga; no se registró"
      : "la fecha de cobro cambió desde que se hizo la liga o es un segundo cobro de la misma liga; no se registró y puede tocar devolverlo";
    await d.rpc("wa_pasar_a_fermin", { p_conversacion_id: conv, p_estado: "URGENTE_SOPORTE", p_motivo: "Pago que no cuadra", p_resumen: `${pago}: ${porque}.` });
    return "RECHAZADO";
  }
  if (r.resultado !== "APLICADO") return r.resultado === "DUPLICADO" ? "DUPLICADO" : "IGNORADO";

  // Los avisos a Fermín (factura, pagado pero suspendido) ya los dejó wa_aplicar_pago en su transacción.
  // De aquí en adelante nada lanza: el pago ya quedó y un reintento sería DUPLICADO.
  try {
    const fecha = fechaLegible(r.proxima_fecha_cobro);
    const base = `Listo, quedó tu pago. Tu próxima fecha de pago es el ${fecha}.`;
    const texto = base +
      (r.reactivado ? " Tu caja se desbloquea en unos minutos." : "") +
      (r.sin_reactivar ? " Un agente revisa tu cuenta y te escribe." : "") +
      (r.factura ? " Tu factura te llega por correo." : "");
    // Fuera de la ventana de 24 h, Meta solo deja mandar plantillas aprobadas.
    const ultimo = r.ultimo_cliente_en ? new Date(r.ultimo_cliente_en).getTime() : 0;
    const dentro = d.ahora().getTime() - ultimo < DIA_MS;
    const s = await d.enviar(dentro ? cuerpoTexto(r.wa_id, texto) : cuerpoPlantilla(r.wa_id, "pago_confirmado", [fecha]));
    if (s.wamid) await d.registrarSalida(conv, s.wamid, dentro ? texto : base); // la plantilla dice lo mismo que `base`
  } catch (err) {
    registrarError("cobro-vim-webhook", "CONFIRMACION", `pago ${pagoId} aplicado, sin confirmar al cliente: ${textoDeError(err)}`);
  }
  return "APLICADO";
}
