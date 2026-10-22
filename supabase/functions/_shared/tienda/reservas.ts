// Reservas en línea (belleza, entrega 3): lo que la función `tienda` decide sin tocar la base ni la
// red. Qué sale del negocio y de una cita, cómo se dice un rechazo de la agenda y qué se le cuenta a
// la clienta de su reembolso. Puro, para probarlo con `node --test` (el handler no se prueba).
import { respuestaDeRpc } from "./respuesta.ts";

type Obj = Record<string, unknown>;
const objeto = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

/** Un importe de la base (numeric llega como número en un jsonb) como texto con dos decimales, o null. */
export function importe(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

export type NegocioDeReservas = {
  /** Interno: acota las RPC. NUNCA sale en una respuesta. */
  tenantId: string;
  nombre: string;
  /** Los ids de las sucursales con oferta, en minúsculas. */
  sucursales: string[];
  /** Lo que se le enseña al sitio: `reservas_negocio` sin `tenant` y con los importes en texto. */
  publico: Obj;
};

/** `reservas_negocio` → el negocio. NULL o cualquier otra forma = no hay reservas. */
export function negocioDeReservas(x: unknown): NegocioDeReservas | null {
  if (!objeto(x) || typeof x.tenant !== "string" || typeof x.nombre !== "string") return null;
  const { tenant, ...resto } = x;
  const sucursales = Array.isArray(x.sucursales) ? x.sucursales.filter(objeto) : [];
  const servicios = Array.isArray(x.servicios) ? x.servicios.filter(objeto) : [];
  return {
    tenantId: tenant as string,
    nombre: x.nombre,
    sucursales: sucursales.flatMap((s) => (typeof s.id === "string" ? [s.id.toLowerCase()] : [])),
    publico: {
      ...resto,
      sucursales,
      servicios: servicios.map((s) => ({ ...s, precio: importe(s.precio), anticipo_mxn: importe(s.anticipo_mxn) ?? "0.00" })),
    },
  };
}

/** Las filas de `agenda_huecos` (`[{inicia}]`) → las horas en ISO UTC, en orden. null si la forma no es esa. */
export function huecosPublicos(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const f of x) {
    const t = objeto(f) && typeof f.inicia === "string" ? Date.parse(f.inicia) : NaN;
    if (!Number.isFinite(t)) return null;
    out.push(new Date(t).toISOString());
  }
  return out.sort();
}

export type Reservada = {
  /** Interno: la cita. NUNCA sale. */
  citaId: string;
  /** El código del enlace en claro: solo la primera vez (un reintento con la misma clave trae null). */
  codigo: string | null;
  /** Interno: el pago del anticipo por cobrar o ya cobrado. NUNCA sale. */
  pagoId: string | null;
  anticipo_mxn: string;
  /** Lo que se cobra en línea (el anticipo), solo si hay pago. */
  total_a_pagar_mxn: string | null;
};

/** Lo que devuelve `agenda_reservar_en_linea` (0225), o null si la forma no es esa. */
export function leerReservada(x: unknown): Reservada | null {
  if (!objeto(x) || typeof x.cita_id !== "string") return null;
  const codigo = typeof x.codigo === "string" && /^[A-Za-z0-9_-]{22}$/.test(x.codigo) ? x.codigo : null;
  const pagoId = typeof x.pago_id === "string" && x.pago_id ? x.pago_id : null;
  return { citaId: x.cita_id, codigo, pagoId, anticipo_mxn: importe(x.anticipo_mxn) ?? "0.00", total_a_pagar_mxn: pagoId ? importe(x.total_a_pagar_mxn) : null };
}

export const MENSAJE_REEMBOLSO_EN_PROCESO = "Estamos procesando tu reembolso; si no lo ves en 10 días, comunícate con el negocio.";
export const MENSAJE_REEMBOLSO_HECHO = "Te devolvimos tu anticipo por Mercado Pago.";
export type Reembolso = { estado: "EN_PROCESO" | "DEVUELTO"; mensaje: string } | null;

/**
 * Lo que la clienta ve de la devolución de su anticipo en línea, por los estados de los pagos de su
 * cita. Mientras alguno se esté devolviendo (o la devolución haya fallado y la resuelva VIM a mano),
 * «en proceso»; si ya se devolvió, «devuelto». Si nada se devuelve, null.
 */
export function reembolsoDeCita(estados: readonly string[]): Reembolso {
  if (estados.some((e) => e === "POR_DEVOLVER" || e === "DEVOLUCION_FALLIDA")) return { estado: "EN_PROCESO", mensaje: MENSAJE_REEMBOLSO_EN_PROCESO };
  if (estados.includes("DEVUELTO")) return { estado: "DEVUELTO", mensaje: MENSAJE_REEMBOLSO_HECHO };
  return null;
}

export type PagoDeCita = { id: string; estado: string; extra: boolean };
export type AnticipoConPago = { id: string; tienda_pago_id: string | null; created_at: string };

/**
 * Los estados que cuentan para el aviso de reembolso. Con anticipo en línea, solo el pago de ese
 * anticipo (el del primer renglón con pago, como `_anticipo_pago_en_linea`): un cobro tardío
 * duplicado o un pago `extra` que se devuelve no se lee como si se devolviera el anticipo bueno.
 * Sin anticipo (cita vencida con un cobro tardío), los pagos que no son `extra`.
 */
export function estadosDelAnticipo(pagos: readonly PagoDeCita[], anticipos: readonly AnticipoConPago[]): string[] {
  const id = [...anticipos].filter((a) => a.tienda_pago_id)
    .sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id))[0]?.tienda_pago_id ?? null;
  return pagos.filter((p) => (id ? p.id === id : !p.extra)).map((p) => p.estado);
}

/**
 * `agenda_cita_publica` (o lo que devuelven cancelar y mover) para el sitio: importes en texto y el
 * reembolso. Sin ids internos: los de sucursal, servicio y colaborador ya salen en el catálogo y
 * hacen falta para pedir los horarios al cambiar la cita. null si la forma no es la de una cita.
 */
export function citaPublica(x: unknown, estadosDePago: readonly string[]): Obj | null {
  if (!objeto(x) || typeof x.estado !== "string" || typeof x.inicia !== "string") return null;
  const suc = objeto(x.sucursal) ? x.sucursal : {};
  // Campo por campo: lo que la base agregue mañana no llega al navegador solo.
  return {
    inicia: x.inicia, termina: x.termina ?? null, dia: x.dia ?? null, hora: x.hora ?? null,
    sucursal: { id: suc.id ?? null, nombre: suc.nombre ?? null, direccion: suc.direccion ?? null },
    servicios: (Array.isArray(x.servicios) ? x.servicios.filter(objeto) : []).map((v) => ({
      producto_id: v.producto_id ?? null, nombre: v.nombre ?? null, colaborador_id: v.colaborador_id ?? null,
      colaborador: v.colaborador ?? null, inicia: v.inicia ?? null, precio: importe(v.precio),
    })),
    colaborador: x.colaborador ?? null, total_mxn: importe(x.total_mxn), estado: x.estado,
    cancelada_motivo: x.cancelada_motivo ?? null,
    anticipo_mxn: importe(x.anticipo_mxn) ?? "0.00", anticipo_pagado_mxn: importe(x.anticipo_pagado_mxn) ?? "0.00",
    pago_hasta: x.pago_hasta ?? null, puede_cambiar: x.puede_cambiar === true,
    cancelar_horas: typeof x.cancelar_horas === "number" ? x.cancelar_horas : 24, whatsapp: x.whatsapp ?? null,
    reembolso: reembolsoDeCita(estadosDePago),
  };
}

/**
 * El no de un pago de cita que otra consulta ya descartó (y contó): se repite sin volver a contarlo.
 * El motivo no se repite (`OTRO`): pudo haberse dicho ya enmascarado por el tope de la IP.
 */
export const rechazoYaContado = (): { error: "PAGO_RECHAZADO"; detalle: "OTRO" } => ({ error: "PAGO_RECHAZADO", detalle: "OTRO" });

/** Los rechazos de la agenda que llevan un mensaje para la clienta, con su estado HTTP. */
const DE_AGENDA = new Map<string, number>([
  ["HUECO_OCUPADO", 409], ["FUERA_DE_PLAZO", 409], ["PAGO_NO_DISPONIBLE", 409],
  ["LIMITE_RESERVAS", 429], ["LIMITE_INTENTOS", 429],
  ["DATOS_INVALIDOS", 400],
]);
const CODIGO = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+): ?([\s\S]*)$/;

export type RespuestaDeAgenda = { status: number; body: { error: string; mensaje?: string; hasta?: string; detalle?: string } };

/**
 * El `error.message` de una RPC de la agenda → lo que se responde. Los mensajes de estos códigos los
 * escribe la base PARA la clienta («Ese horario ya no está disponible»): salen en `mensaje`, de una
 * línea y acotados. PAGO_EN_PAUSA (el freno tras un rechazo por riesgo) es 423 con `hasta` en ISO.
 * Cualquier otro código va por `respuestaDeRpc`: el texto crudo de la base nunca sale.
 */
export function respuestaDeAgenda(mensaje: unknown): RespuestaDeAgenda {
  const m = typeof mensaje === "string" ? CODIGO.exec(mensaje) : null;
  if (m && m[1] === "PAGO_EN_PAUSA") {
    const t = Date.parse(m[2]!.trim());
    return { status: 423, body: { error: "PAGO_EN_PAUSA", ...(Number.isFinite(t) && { hasta: new Date(t).toISOString() }) } };
  }
  const status = m ? DE_AGENDA.get(m[1]!) : undefined;
  if (m && status) {
    const texto = m[2]!.trim();
    return { status, body: { error: m[1]!, ...(/^[^\u0000-\u001f\u007f]{1,200}$/.test(texto) && { mensaje: texto }) } };
  }
  return respuestaDeRpc(mensaje);
}
