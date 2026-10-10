// Mercado Pago Point (Orders API) para el cobro con terminal. ADR 0033.
// Fuente: docs/integraciones/mercado-pago-point/. Lo marcado VERIFICADO se probó el 9 oct 2026 contra
// la cuenta de prueba y la terminal virtual (`…__SBX0000001`); lo demás es lo que dice la documentación.
//
// No hay interfaz de «proveedor»: hoy solo existe este. Cuando llegue Clip se extrae de aquí.
import { hmacSha256Hex, igualesEnTiempoConstante } from "../delivery/firma.ts";

const API = "https://api.mercadopago.com";

export type EstadoCobro = "EN_TERMINAL" | "APROBADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO" | "REVISAR" | "DEVUELTO";

const ESTADOS: Record<string, EstadoCobro> = {
  created: "EN_TERMINAL", at_terminal: "EN_TERMINAL", processed: "APROBADO", failed: "RECHAZADO",
  canceled: "CANCELADO", expired: "VENCIDO", action_required: "REVISAR", refunded: "DEVUELTO",
};

/** Un estado que no conocemos se trata como «mira la terminal»: nunca como aprobado ni como rechazado. */
export const estadoDeOrden = (status: unknown): EstadoCobro => ESTADOS[String(status)] ?? "REVISAR";

/** El monto viaja como texto con hasta 2 decimales; nunca como float. null si no es un monto válido. */
export function montoTexto(v: unknown): string | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{1,7}(\.\d{1,2})?$/.test(s) && Number(s) > 0 ? Number(s).toFixed(2) : null;
}

export type DatosCobro = {
  estado: EstadoCobro; detalle: string | null; cobro_id: string | null;
  orden_id_externo: string | null; pago_id_externo: string | null;
  tipo_tarjeta: string | null; marca: string | null; mensualidades: number | null;
  referencia: string | null; pagado_mxn: string | null; reembolsado_mxn: string | null;
};

const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/**
 * Lo que guardamos de una order, venga de la respuesta de la API o del `data` de un aviso (el aviso
 * no trae `id` dentro de data y manda la referencia como `reference.id`; la consulta, `reference_id`).
 */
export function datosDeOrden(orden: unknown, idOrden?: string): DatosCobro {
  const o = obj(orden);
  const pagos = obj(o.transactions).payments;
  const p = obj(Array.isArray(pagos) ? pagos[0] : null);
  const medio = obj(p.payment_method);
  const reembolsos = obj(o.transactions).refunds;
  const reembolsado = Array.isArray(reembolsos)
    ? reembolsos.reduce((s, r) => s + (Number(obj(r).amount) || 0), 0)
    : Number(p.refunded_amount) || 0;
  return {
    estado: estadoDeOrden(o.status),
    detalle: txt(o.status_detail),
    cobro_id: txt(o.external_reference),
    orden_id_externo: txt(o.id) ?? idOrden ?? null,
    pago_id_externo: txt(p.id),
    tipo_tarjeta: txt(medio.type),
    marca: txt(medio.id),
    mensualidades: Number.isInteger(medio.installments) ? medio.installments as number : null,
    referencia: txt(p.reference_id) ?? txt(obj(p.reference).id),
    pagado_mxn: montoTexto(o.total_paid_amount) ?? montoTexto(p.paid_amount),
    reembolsado_mxn: reembolsado > 0 ? reembolsado.toFixed(2) : null,
  };
}

/**
 * Firma de un aviso: `x-signature: ts=…,v1=…`, HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * con la clave secreta de la aplicación. `data.id` es el de la query y va en minúsculas.
 * SIN VERIFICAR contra un aviso real (la pestaña «sin SDK» de la guía no se capturó): es la plantilla
 * general de webhooks de Mercado Pago. Confirmar con el primer aviso y quitar esta nota.
 */
export async function firmaValida(
  e: { firma: string | null; requestId: string | null; dataId: string | null; secreto: string },
): Promise<boolean> {
  const partes = Object.fromEntries((e.firma ?? "").split(",").map((x) => x.trim().split("=", 2)));
  if (!partes.ts || !partes.v1 || !e.dataId || !e.secreto) return false;
  const manifiesto = `id:${e.dataId.toLowerCase()};request-id:${e.requestId ?? ""};ts:${partes.ts};`;
  return igualesEnTiempoConstante(String(partes.v1).toLowerCase(), await hmacSha256Hex(e.secreto, manifiesto));
}

export type RespuestaMp = { status: number; cuerpo: unknown; codigo: string | null };

/** Cliente mínimo. `token` es el Access Token del restaurante (o el de prueba). */
export function clienteMp(token: string, pedir: typeof fetch = fetch) {
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<RespuestaMp> => {
    const r = await pedir(API + ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000),
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* cuerpo no JSON */ }
    const errores = obj(json).errors;
    return { status: r.status, cuerpo: json, codigo: txt(obj(Array.isArray(errores) ? errores[0] : null).code) };
  };

  return {
    /** VERIFICADO: 201 con la order en `created`; la terminal virtual la toma sola a los ~3 s. */
    crearOrden: (c: { cobroId: string; monto: string; terminalId: string; descripcion: string; esperaSeg: number; imprime: boolean }) =>
      llamar("POST", "/v1/orders", {
        type: "point",
        external_reference: c.cobroId,
        expiration_time: `PT${c.esperaSeg}S`,
        transactions: { payments: [{ amount: c.monto }] },
        config: { point: { terminal_id: c.terminalId, print_on_terminal: c.imprime ? "seller_ticket" : "no_ticket" } },
        description: c.descripcion.slice(0, 150),
      }, { "X-Idempotency-Key": c.cobroId }),

    /** VERIFICADO. Mercado Pago pide no consultarla seguido: es el respaldo del aviso. */
    consultarOrden: (ordenId: string) => llamar("GET", `/v1/orders/${encodeURIComponent(ordenId)}`),

    /** 200 si estaba en `created`; 202 (no definitivo hasta el aviso) si ya estaba en la terminal. */
    cancelarOrden: (ordenId: string) =>
      llamar("POST", `/v1/orders/${encodeURIComponent(ordenId)}/cancel`, undefined,
        { "X-Idempotency-Key": crypto.randomUUID(), "x-allow-cancelable-status": "at_terminal" }),
  };
}

/**
 * Los avisos pueden llegar tarde o desordenados: lo que pasó en la terminal gana y un cobro pagado
 * no se «despaga» por un aviso viejo. De APROBADO solo se sale a DEVUELTO; de DEVUELTO, a nada.
 */
export function aceptaCambio(actual: EstadoCobro, nuevo: EstadoCobro): boolean {
  if (actual === "DEVUELTO") return false;
  if (actual === "APROBADO") return nuevo === "APROBADO" || nuevo === "DEVUELTO";
  return true;
}

/** Las columnas de terminal_cobros que salen de una order (sin pisar con null lo que ya se sabía). */
export function cambiosDeCobro(d: DatosCobro): Record<string, unknown> {
  const c: Record<string, unknown> = { estado: d.estado, detalle: d.detalle };
  for (const k of ["orden_id_externo", "pago_id_externo", "tipo_tarjeta", "marca", "mensualidades", "referencia", "pagado_mxn", "reembolsado_mxn"] as const) {
    if (d[k] !== null) c[k] = d[k];
  }
  return c;
}
