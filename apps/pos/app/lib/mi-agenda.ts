import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ETIQUETA_ESTADO_CITA, type CitaEstado } from "@vim/db/agenda";
import { aFechaMx, hoyMx, sumarDias } from "@vim/fecha";

/**
 * «Mi agenda» del colaborador en su celular. Todo va por las RPC mi_* y mis_comisiones (0227/0228):
 * el token del colaborador no lee tablas. El cliente lo pasa la página (su sesión vive aparte de la caja).
 */
type Cliente = Pick<SupabaseClient, "rpc">;

const ESTADOS = Object.keys(ETIQUETA_ESTADO_CITA) as [CitaEstado, ...CitaEstado[]];

const esquemaAgenda = z.object({
  colaborador: z.string(),
  tramos: z.array(z.object({
    id: z.string(),
    inicia: z.string(),
    termina: z.string(),
    servicio: z.string(),
    espacio: z.string().nullable(),
    ultimo: z.boolean(),
    cita: z.object({ id: z.string(), estado: z.enum(ESTADOS), cliente_nombre: z.string(), nota: z.string().nullable() }),
  })),
});
export type MiAgenda = z.infer<typeof esquemaAgenda>;
export type MiTramo = MiAgenda["tramos"][number];

export const DIAS_TIRA = 7;

/** Hoy y los 6 días siguientes, en México. */
export const diasTira = (hoy = hoyMx()): string[] => Array.from({ length: DIAS_TIRA }, (_, i) => sumarDias(hoy, i));

/** Los tramos de un día de México (por la hora en que empiezan), ordenados por hora. */
export function tramosDelDia(tramos: MiTramo[], dia: string): MiTramo[] {
  return tramos.filter((t) => aFechaMx(new Date(t.inicia)) === dia).sort((a, b) => a.inicia.localeCompare(b.inicia));
}

export type Accion = { tipo: "empezar" | "terminar"; etiqueta: string };

/** El botón de la tarjeta: solo empezar y terminar; no cobra, no cancela, no mueve, no marca «No llegó». */
export function accionDe(t: Pick<MiTramo, "ultimo" | "cita">): Accion | null {
  if (t.cita.estado === "AGENDADA") return { tipo: "empezar", etiqueta: "Llegó · empezar" };
  if (t.cita.estado === "EN_CURSO") return { tipo: "terminar", etiqueta: t.ultimo ? "Terminé" : "Terminé mi parte" };
  return null;
}

export async function leerMiAgenda(sb: Cliente, hoy = hoyMx()): Promise<MiAgenda> {
  const { data, error } = await sb.rpc("mi_agenda", { p_desde: hoy, p_hasta: sumarDias(hoy, DIAS_TIRA - 1) });
  if (error) throw error;
  return esquemaAgenda.parse(data);
}

/** Ejecuta el botón. Devuelve el aviso para la pantalla. «Terminé mi parte» no cierra la cita
 *  (mi_cita_terminar devuelve EN_CURSO): la recepción se entera por la auditoría. */
export async function ejecutarAccion(sb: Cliente, tipo: Accion["tipo"], citaId: string): Promise<string> {
  if (tipo === "empezar") {
    const { error } = await sb.rpc("mi_cita_empezar", { p_cita: citaId });
    if (error) throw error;
    return "Cita empezada";
  }
  const { data, error } = await sb.rpc("mi_cita_terminar", { p_cita: citaId });
  if (error) throw error;
  return data === "EN_CURSO" ? "Avisamos a la recepción" : "Cita terminada";
}

// ── Comisiones ───────────────────────────────────────────────────────────────────────────────

export type ResumenComision = { servicios: number; ventas: number; comision: number; sueldo: number | null; total: number };
export type Periodo = { desde: string; hasta: string };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Las filas de mis_comisiones (a lo más la suya) → un resumen. El sueldo solo existe en un periodo
 *  completo del negocio; en otro rango la base lo da en 0 y aquí se oculta (null). */
export function resumenComision(filas: Record<string, unknown>[] | null, conSueldo: boolean): ResumenComision {
  const s = (k: string) => centavos((filas ?? []).reduce((a, f) => a + num(f[k]), 0));
  const comision = centavos(s("comision_servicios_mxn") + s("comision_productos_mxn"));
  return {
    servicios: s("servicios"), ventas: s("ventas_mxn"), comision,
    sueldo: conSueldo ? s("sueldo_mxn") : null,
    total: conSueldo ? s("total_mxn") : comision,
  };
}

async function periodo(sb: Cliente, fecha: string): Promise<Periodo> {
  const { data, error } = await sb.rpc("mi_periodo_comisiones", { p_fecha: fecha });
  if (error) throw error;
  const p = (data as Periodo[] | null)?.[0];
  if (!p) throw new Error("No se pudo calcular el periodo de comisiones");
  return { desde: p.desde, hasta: p.hasta };
}

async function comisiones(sb: Cliente, p: Periodo, conSueldo: boolean): Promise<ResumenComision> {
  const { data, error } = await sb.rpc("mis_comisiones", { p_desde: p.desde, p_hasta: p.hasta });
  if (error) throw error;
  return resumenComision(data as Record<string, unknown>[] | null, conSueldo);
}

export type MisComisiones = { hoy: ResumenComision; actual: Periodo & ResumenComision; anterior: Periodo & ResumenComision };

export async function leerMisComisiones(sb: Cliente, hoy = hoyMx()): Promise<MisComisiones> {
  const actual = await periodo(sb, hoy);
  const anterior = await periodo(sb, sumarDias(actual.desde, -1));
  const [h, a, b] = await Promise.all([
    comisiones(sb, { desde: hoy, hasta: hoy }, false), comisiones(sb, actual, true), comisiones(sb, anterior, true),
  ]);
  return { hoy: h, actual: { ...actual, ...a }, anterior: { ...anterior, ...b } };
}

const fmtPesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export const pesos = (n: number) => fmtPesos.format(n);

// ── Errores ──────────────────────────────────────────────────────────────────────────────────

export type ErrorAgenda = { tipo: "sesion" } | { tipo: "sin_agenda" } | { tipo: "mensaje"; texto: string };

/**
 * Error de GoTrue/PostgREST → qué hacer. Sesión vencida o perdida: un JWT vencido (PGRST301/303),
 * un refresh que falla, o la llamada que sale como anon (mi_agenda no es de anon: «permission denied
 * for function»). SIN_AGENDA: le quitaron la agenda a media sesión.
 */
export function clasificarError(e: unknown): ErrorAgenda {
  const o = (typeof e === "object" && e !== null ? e : {}) as { message?: unknown; code?: unknown };
  const msg = typeof o.message === "string" ? o.message : typeof e === "string" ? e : "";
  if (o.code === "PGRST301" || o.code === "PGRST303"
    || /jwt expired|invalid jwt|refresh token|auth session missing|permission denied for function/i.test(msg)) return { tipo: "sesion" };
  if (msg.startsWith("SIN_AGENDA")) return { tipo: "sin_agenda" };
  const m = /^DATOS_INVALIDOS:\s*(.+)$/.exec(msg);
  if (m?.[1]) return { tipo: "mensaje", texto: m[1].charAt(0).toUpperCase() + m[1].slice(1) };
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return { tipo: "mensaje", texto: "No hay conexión. Revisa tu internet e inténtalo de nuevo." };
  return { tipo: "mensaje", texto: "Algo falló. Toca «Actualizar» e inténtalo de nuevo." };
}

export const MENSAJE_SESION_TERMINO = "Tu sesión terminó. Entra de nuevo.";
