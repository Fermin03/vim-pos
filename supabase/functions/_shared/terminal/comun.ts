// Lo común a los proveedores de terminal (Mercado Pago, Clip). Módulo puro (node --test).

export type EstadoCobro = "EN_TERMINAL" | "APROBADO" | "RECHAZADO" | "CANCELADO" | "VENCIDO" | "REVISAR" | "DEVUELTO";

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
  /** Solo los últimos cuatro dígitos. Mercado Pago manda también los primeros ocho: no se leen. */
  tarjeta_ultimos4: string | null;
  /** Propina cobrada aparte por el lector. Ausente o null si el proveedor no la manda por separado. */
  propina_mxn?: string | null;
};

export const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

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
  for (const k of ["orden_id_externo", "pago_id_externo", "tipo_tarjeta", "marca", "mensualidades", "referencia", "pagado_mxn", "reembolsado_mxn", "tarjeta_ultimos4", "propina_mxn"] as const) {
    if (d[k] != null) c[k] = d[k];
  }
  return c;
}
