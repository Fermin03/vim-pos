"use client";
import { z } from "zod";
import { leerSesion, supabase } from "./supabase";

// Facturación de tickets (doc 13 §CFDI). El backend completo existía (cfdi_crear_borrador,
// timbrar-cfdi con failover multi-PAC, tickets_cfdi con RLS); esta lib es el punto de
// entrada de UI que faltaba: buscar ticket PAGADO → capturar receptor → borrador → timbrar.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Catálogos SAT (subset relevante para restaurantes) ──────────────────────
export const USOS_CFDI = [
  { codigo: "G03", label: "G03 · Gastos en general" },
  { codigo: "G01", label: "G01 · Adquisición de mercancías" },
  { codigo: "S01", label: "S01 · Sin efectos fiscales (público en general)" },
  { codigo: "D08", label: "D08 · Gastos de transportación escolar obligatoria" },
  { codigo: "CP01", label: "CP01 · Pagos" },
] as const;

export const FORMAS_PAGO_SAT = [
  { codigo: "01", label: "01 · Efectivo" },
  { codigo: "04", label: "04 · Tarjeta de crédito" },
  { codigo: "28", label: "28 · Tarjeta de débito" },
  { codigo: "03", label: "03 · Transferencia electrónica" },
  { codigo: "99", label: "99 · Por definir" },
] as const;

/** RFC genérico de público en general (CFDI 4.0 global simplificado). */
export const RECEPTOR_PUBLICO_GENERAL = {
  rfc: "XAXX010101000",
  razon_social: "PUBLICO EN GENERAL",
  uso_cfdi: "S01",
  regimen_fiscal: "616", // Sin obligaciones fiscales
} as const;

/** Mapea los pagos del ticket a la forma de pago SAT (el método con mayor monto manda). Puro. */
export function formaPagoSatDe(pagos: { metodo: string; monto: number }[]): string {
  const MAPA: Record<string, string> = {
    EFECTIVO: "01",
    TARJETA_CREDITO: "04",
    TARJETA_DEBITO: "28",
    TRANSFERENCIA: "03",
  };
  if (pagos.length === 0) return "99";
  const porMetodo = new Map<string, number>();
  for (const p of pagos) porMetodo.set(p.metodo, (porMetodo.get(p.metodo) ?? 0) + p.monto);
  const dominante = [...porMetodo.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return MAPA[dominante] ?? "99";
}

// ── Tickets facturables ──────────────────────────────────────────────────────
export type TicketFacturable = {
  ticketId: string;
  folio: string | null;
  total: number;
  diaContable: string;
  formaPagoSugerida: string;
  /** Estado del CFDI más reciente del ticket (null = sin factura). */
  cfdiEstado: string | null;
  cfdiUuid: string | null;
  cfdiId: string | null;
};

export async function listarTicketsFacturables(desde: string, hasta: string, folioBusqueda?: string): Promise<TicketFacturable[]> {
  let q = supabase
    .from("tickets")
    .select(
      "id, folio_completo, total_mxn, dia_contable, pagos(metodo_pago, monto_mxn), " +
        // Ver la nota de arriba: sin `!tickets_cfdi_ticket_id_fkey` esto es ambiguo.
        "tickets_cfdi!tickets_cfdi_ticket_id_fkey(id, estado_sat, uuid_fiscal, created_at)",
    )
    .eq("estado_fiscal", "PAGADO")
    .gte("dia_contable", desde)
    .lte("dia_contable", hasta)
    .order("created_at", { ascending: false })
    .limit(60);
  if (folioBusqueda?.trim()) q = q.ilike("folio_completo", `%${folioBusqueda.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((t) => {
    const pagos = ((t.pagos as { metodo_pago: string; monto_mxn: number }[]) ?? []).map((p) => ({
      metodo: p.metodo_pago,
      monto: Number(p.monto_mxn),
    }));
    const cfdis = ((t.tickets_cfdi as { id: string; estado_sat: string; uuid_fiscal: string | null; created_at: string }[]) ?? [])
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return {
      ticketId: String(t.id),
      folio: (t.folio_completo as string) ?? null,
      total: Number(t.total_mxn ?? 0),
      diaContable: String(t.dia_contable),
      formaPagoSugerida: formaPagoSatDe(pagos),
      cfdiEstado: cfdis[0]?.estado_sat ?? null,
      cfdiUuid: cfdis[0]?.uuid_fiscal ?? null,
      cfdiId: cfdis[0]?.id ?? null,
    };
  });
}

// ── Receptor ─────────────────────────────────────────────────────────────────
export const receptorSchema = z.object({
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, "RFC inválido"),
  razon_social: z.string().trim().min(1, "Obligatoria").max(250),
  uso_cfdi: z.string().min(2).max(5),
  codigo_postal: z.string().trim().regex(/^\d{5}$/, "CP de 5 dígitos"),
  regimen_fiscal: z.string().min(3).max(10),
  email: z.string().trim().email("Correo inválido").max(255).optional().or(z.literal("")),
  forma_pago_sat: z.string().min(2).max(5),
});
export type ReceptorInput = z.infer<typeof receptorSchema>;

// ── Borrador + timbrado ──────────────────────────────────────────────────────
export type ResultadoTimbrado =
  | { ok: true; cfdiId: string; uuidFiscal: string; serie: string | null; folioFiscal: string | null }
  | { ok: false; cfdiId: string | null; error: string };

/** Crea el borrador del CFDI (emisor = datos fiscales del tenant) y lo manda timbrar. */
export async function facturarTicket(ticketId: string, receptor: ReceptorInput): Promise<ResultadoTimbrado> {
  const r = receptorSchema.parse(receptor);

  // Emisor: datos fiscales del tenant + proveedor PAC configurado.
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, cfdiId: null, error: "Sesión expirada; vuelve a entrar." };
  const s = await leerSesion();
  if (!s?.tenantId) return { ok: false, cfdiId: null, error: "Sesión sin tenant." };
  const tid = s.tenantId;
  const [{ data: ten, error: e1 }, { data: emi, error: e2 }] = await Promise.all([
    supabase.from("tenants").select("rfc, razon_social, regimen_fiscal, codigo_postal_fiscal").eq("id", tid).maybeSingle(),
    supabase.from("tenant_cfdi_emisor").select("proveedor_pac, estado").maybeSingle(),
  ]);
  if (e1) return { ok: false, cfdiId: null, error: e1.message };
  if (e2) return { ok: false, cfdiId: null, error: e2.message };
  const t = (ten ?? {}) as Record<string, string | null>;
  if (!t.rfc || !t.razon_social || !t.regimen_fiscal || !t.codigo_postal_fiscal) {
    return { ok: false, cfdiId: null, error: "Faltan datos fiscales del negocio (Configuración → Datos fiscales)." };
  }
  const emisor = emi as { proveedor_pac?: string; estado?: string } | null;
  if (!emisor) {
    return { ok: false, cfdiId: null, error: "No hay emisor CFDI configurado (Configuración → CFDI / PAC)." };
  }

  const { data: cfdiId, error: eB } = await supabase.rpc("cfdi_crear_borrador", {
    p_ticket_id: ticketId,
    p_tipo_comprobante: "INGRESO",
    p_receptor_rfc: r.rfc,
    p_receptor_razon_social: r.razon_social,
    p_receptor_uso_cfdi: r.uso_cfdi,
    p_receptor_codigo_postal: r.codigo_postal,
    p_receptor_regimen_fiscal: r.regimen_fiscal,
    p_receptor_email: r.email || null,
    p_emisor_rfc: t.rfc,
    p_emisor_razon_social: t.razon_social,
    p_emisor_regimen_fiscal: t.regimen_fiscal,
    p_emisor_lugar_expedicion: t.codigo_postal_fiscal,
    p_metodo_pago_sat: "PUE",
    p_forma_pago_sat: r.forma_pago_sat,
    // El PAC real lo decide el servidor y la Edge Function corrige este valor tras timbrar. Aquí
    // solo hace falta algo válido para el borrador; tomarlo de `emisor.proveedor_pac` era peor,
    // porque el cliente podía elegir uno y timbrar otro.
    p_pac_proveedor: "FACTURAMA",
  });
  if (eB) return { ok: false, cfdiId: null, error: eB.message };
  const id = String(cfdiId);

  // Timbrar vía Edge Function (failover multi-PAC server-side).
  const res = await fetch(`${SB_URL}/functions/v1/timbrar-cfdi`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cfdi_id: id }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean; uuid_fiscal?: string; serie?: string | null; folio_fiscal?: string | null;
    error?: string; mensaje?: string; detalle?: string;
  };
  if (!res.ok || !data.ok || !data.uuid_fiscal) {
    return { ok: false, cfdiId: id, error: data.mensaje ?? data.detalle ?? data.error ?? `HTTP ${res.status}` };
  }
  return { ok: true, cfdiId: id, uuidFiscal: data.uuid_fiscal, serie: data.serie ?? null, folioFiscal: data.folio_fiscal ?? null };
}

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

// ── Factura global (fase 6) ──────────────────────────────────────────────────
//
// La que ampara todas las ventas del periodo en las que nadie pidió comprobante. Es obligación
// ante el SAT y se emite dentro de las 24 horas siguientes al cierre del periodo.
//
// El detalle importante, y por eso está aquí y no escondido en la Edge Function: al timbrarla, sus
// tickets DEJAN de poder autofacturarse. Quien la emite tiene que saber que está cerrando la
// ventana de sus clientes.

export const PERIODICIDADES = [
  { v: "01", l: "Diario" },
  { v: "02", l: "Semanal (lunes a domingo)" },
  { v: "03", l: "Quincenal (1–15 y 16–fin)" },
  { v: "04", l: "Mensual" },
  { v: "05", l: "Bimestral (solo régimen 621)" },
] as const;

export type EstadoPeriodo = "ABIERTO" | "EN_PROCESO" | "TIMBRADA" | "ERROR";

export type PeriodoGlobal = {
  id: string;
  desde: string;
  hasta: string;
  periodicidad: string;
  estado: EstadoPeriodo;
  nTickets: number;
  totalMxn: number;
  cerradoAt: string | null;
};

export async function listarPeriodosGlobales(limite = 12): Promise<PeriodoGlobal[]> {
  const { data, error } = await supabase
    .from("cfdi_periodos_globales")
    .select("id, desde, hasta, periodicidad, estado, n_tickets, total_mxn, cerrado_at")
    .order("hasta", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    desde: String(f.desde),
    hasta: String(f.hasta),
    periodicidad: String(f.periodicidad),
    estado: f.estado as EstadoPeriodo,
    nTickets: Number(f.n_tickets ?? 0),
    totalMxn: Number(f.total_mxn ?? 0),
    cerradoAt: (f.cerrado_at as string) ?? null,
  }));
}

/** El periodo anterior al vigente: el que toca cerrar. */
export async function periodoPorCerrar(
  periodicidad: string,
): Promise<{ desde: string; hasta: string; nTickets: number; totalMxn: number } | null> {
  const tid = await tenantId();
  const hoy = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
  const vig = await supabase.rpc("periodo_global_de", { p_periodicidad: periodicidad, p_fecha: hoy });
  const vigente = (vig.data as { desde: string }[] | null)?.[0];
  if (!vigente) return null;

  const antes = new Date(`${vigente.desde}T12:00:00Z`);
  antes.setUTCDate(antes.getUTCDate() - 1);
  const prevQ = await supabase.rpc("periodo_global_de", {
    p_periodicidad: periodicidad,
    p_fecha: antes.toISOString().slice(0, 10),
  });
  const prev = (prevQ.data as { desde: string; hasta: string }[] | null)?.[0];
  if (!prev) return null;

  const { data, error } = await supabase.rpc("tickets_de_periodo_global", {
    p_tenant_id: tid, p_desde: prev.desde, p_hasta: prev.hasta,
  });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as { total_mxn: number }[];
  return {
    desde: prev.desde,
    hasta: prev.hasta,
    nTickets: filas.length,
    totalMxn: filas.reduce((a, f) => a + Number(f.total_mxn ?? 0), 0),
  };
}

export type ResultadoGlobal =
  | { ok: true; sinVentas: boolean; uuidFiscal?: string; tickets?: number; total?: number }
  | { ok: false; error: string };

export async function timbrarFacturaGlobal(desde: string, hasta: string): Promise<ResultadoGlobal> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, error: "Sesión expirada, vuelve a entrar" };
  const tid = await tenantId();

  const res = await fetch(`${SB_URL}/functions/v1/timbrar-global`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tid, desde, hasta }),
  });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !d.ok) {
    return { ok: false, error: String(d.mensaje ?? d.detalle ?? d.error ?? `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    sinVentas: d.sinVentas === true,
    uuidFiscal: d.uuid_fiscal as string | undefined,
    tickets: d.tickets as number | undefined,
    total: d.total as number | undefined,
  };
}

// ── Cancelación (fase 8) ─────────────────────────────────────────────────────
//
// Cancelar no es borrar: el SAT pide un motivo y, según el caso, la aceptación del receptor. Por
// eso el resultado puede ser "cancelado" o "en proceso", y la UI tiene que decir cuál es.

export const MOTIVOS_CANCELACION = [
  { v: "02", l: "Comprobante emitido con errores", ayuda: "El más común: datos equivocados y no habrá otro que lo sustituya." },
  { v: "03", l: "No se llevó a cabo la operación", ayuda: "La venta se canceló y el cliente no pagó." },
  { v: "01", l: "Con errores, con comprobante que lo sustituye", ayuda: "Requiere el folio fiscal de la factura que lo reemplaza." },
  { v: "04", l: "Operación ya incluida en la factura global", ayuda: "Se facturó aparte algo que ya iba en la global." },
] as const;

export type ResultadoCancelacion =
  | { ok: true; estado: "CANCELADO" | "EN_PROCESO_CANCELACION"; mensaje: string }
  | { ok: false; error: string };

export async function cancelarCfdi(
  cfdiId: string,
  motivo: string,
  uuidSustituto?: string,
): Promise<ResultadoCancelacion> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { ok: false, error: "Sesión expirada, vuelve a entrar" };

  const res = await fetch(`${SB_URL}/functions/v1/cancelar-cfdi`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cfdi_id: cfdiId, motivo, uuid_sustituto: uuidSustituto || undefined }),
  });
  const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !d.ok) {
    return { ok: false, error: String(d.mensaje ?? d.detalle ?? d.error ?? `HTTP ${res.status}`) };
  }
  return {
    ok: true,
    estado: d.estado as "CANCELADO" | "EN_PROCESO_CANCELACION",
    mensaje: String(d.mensaje ?? ""),
  };
}
