"use client";
import { sumarDias } from "@vim/fecha";
import { mensajeRecordatorio, type CitaEstado } from "@vim/db/agenda";
import type { Database } from "@vim/db/types";
import { employeeClient } from "./supabase";
import { motivoDeLaBase } from "./credito";
import { enlaceWhatsappCotizacion } from "./cotizaciones";
import { normalizarTelefono } from "./telefono";

// Agenda en la caja de belleza (0218/0219). Las citas se escriben solo por RPC; aquí se leen el día,
// el catálogo y la tolerancia. En la caja instalada el gateway lee la copia local.

export type CitaCanal = Database["public"]["Enums"]["cita_canal"];

export type TramoCita = {
  id: string;
  orden: number;
  productoId: string;
  servicio: string;
  usuarioId: string | null;
  /** Nombre de quien lo hace; null en espera sin preferencia. */
  colaborador: string | null;
  espacio: string | null;
  precio: number;
  inicia: Date | null;
  termina: Date | null;
  empalme: boolean;
};

export type CitaDia = {
  id: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  estado: CitaEstado;
  canal: CitaCanal;
  inicia: Date | null;
  termina: Date | null;
  llegoAt: Date | null;
  empalme: boolean;
  nota: string | null;
  tramos: TramoCita[];
};

/** Minutos desde la medianoche (hora de México). */
export type HorarioDia = { inicia: number; termina: number; comida: [number, number] | null };

export type ColaboradorDia = { usuarioId: string; nombre: string; color: string; horario: HorarioDia | null; ausente: boolean };

/** Medianoche de un día de México como instante. México no tiene horario de verano: UTC−6 fijo (como `inicioDelDiaMexico`). */
export const inicioDiaMx = (dia: string): Date => new Date(`${dia}T00:00:00-06:00`);

/** 0 = domingo, como `horarios_colaborador.dia_semana`. */
export const diaSemana = (dia: string): number => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** «10:00:00» → 600. */
const aMin = (h: string): number => { const [hh, mm] = h.split(":"); return Number(hh) * 60 + Number(mm); };

/** Minutos de `d` desde la medianoche de `dia` en México. */
export const minutoDelDia = (d: Date, dia: string): number => (d.getTime() - inicioDiaMx(dia).getTime()) / 60_000;

/** El error de la base, legible: sin el código del principio y con mayúscula. */
export function motivoAgenda(mensaje: string): string {
  const m = motivoDeLaBase(mensaje).replace(/^CITA_EMPALMADA:\s*/, "");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// ── Layout del calendario (puro) ─────────────────────────────────────────────

export const PX_POR_MIN = 2;
/** Una cita corta igual se puede tocar. */
export const ALTO_MIN = 44;

/** Dónde va un tramo en la columna: `desdeMin` es el minuto del día en que empieza la rejilla. */
export function posicionTramo(inicia: Date, termina: Date, dia: string, desdeMin: number): { top: number; alto: number } {
  const ini = minutoDelDia(inicia, dia);
  // Un tramo que cruza la medianoche se corta al final del día: la rejilla llega a las 24:00.
  const fin = Math.min(minutoDelDia(termina, dia), 24 * 60);
  return { top: (ini - desdeMin) * PX_POR_MIN, alto: Math.max((fin - ini) * PX_POR_MIN, ALTO_MIN) };
}

/**
 * Horas de la rejilla, en minutos y en horas cerradas: de la primera entrada a la última salida de
 * los colaboradores de ese día, estiradas para que quepa toda cita. Sin nada, 9:00 a 20:00.
 */
export function rangoHoras(colaboradores: ColaboradorDia[], citas: CitaDia[], dia: string): { desde: number; hasta: number } {
  const ini: number[] = [];
  const fin: number[] = [];
  for (const c of colaboradores) if (c.horario) { ini.push(c.horario.inicia); fin.push(c.horario.termina); }
  for (const c of citas) for (const t of c.tramos) {
    if (t.inicia && t.termina) { ini.push(minutoDelDia(t.inicia, dia)); fin.push(minutoDelDia(t.termina, dia)); }
  }
  if (!ini.length) return { desde: 9 * 60, hasta: 20 * 60 };
  return {
    desde: Math.max(0, Math.floor(Math.min(...ini) / 60) * 60),
    hasta: Math.min(24 * 60, Math.ceil(Math.max(...fin) / 60) * 60),
  };
}

/** ¿Atiende en ese minuto? Fuera de horario, en su comida o ausente, no. */
export const trabajaA = (c: ColaboradorDia, min: number): boolean =>
  !c.ausente && !!c.horario && min >= c.horario.inicia && min < c.horario.termina
  && !(c.horario.comida && min >= c.horario.comida[0] && min < c.horario.comida[1]);

// ── Lecturas ─────────────────────────────────────────────────────────────────

const COLUMNAS = "id, cliente_id, cliente_nombre, cliente_telefono, cliente_email, estado, canal, inicia, termina, llego_at, empalme, nota, "
  + "citas_servicios(id, orden, producto_id, usuario_id, inicia, termina, empalme, precio_mxn, productos(nombre), espacios(nombre), usuarios_perfil(nombre))";

type FilaTramo = {
  id: string; orden: number; producto_id: string; usuario_id: string | null; inicia: string | null; termina: string | null; empalme: boolean;
  precio_mxn: number | string; productos: { nombre: string } | null; espacios: { nombre: string } | null; usuarios_perfil: { nombre: string } | null;
};
type FilaCita = {
  id: string; cliente_id: string | null; cliente_nombre: string; cliente_telefono: string | null; cliente_email: string | null; estado: CitaEstado; canal: CitaCanal;
  inicia: string | null; termina: string | null; llego_at: string | null; empalme: boolean; nota: string | null; citas_servicios: FilaTramo[] | null;
};

const fecha = (s: string | null) => (s ? new Date(s) : null);

function aCita(f: FilaCita): CitaDia {
  return {
    id: f.id, clienteId: f.cliente_id, clienteNombre: f.cliente_nombre, clienteTelefono: f.cliente_telefono, clienteEmail: f.cliente_email,
    estado: f.estado, canal: f.canal, inicia: fecha(f.inicia), termina: fecha(f.termina), llegoAt: fecha(f.llego_at), empalme: f.empalme, nota: f.nota,
    tramos: [...(f.citas_servicios ?? [])].sort((a, b) => a.orden - b.orden).map((t) => ({
      id: t.id, orden: t.orden, productoId: t.producto_id, servicio: t.productos?.nombre ?? "Servicio", usuarioId: t.usuario_id,
      colaborador: t.usuarios_perfil?.nombre ?? null, espacio: t.espacios?.nombre ?? null, precio: Number(t.precio_mxn), inicia: fecha(t.inicia), termina: fecha(t.termina), empalme: t.empalme,
    })),
  };
}

/** Las citas que empiezan ese día (de México) en la sucursal. Las canceladas no ocupan: no se leen. */
export async function citasDelDia(token: string, sucursalId: string, dia: string): Promise<CitaDia[]> {
  const { data, error } = await employeeClient(token)
    .from("citas").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).neq("estado", "CANCELADA")
    .gte("inicia", inicioDiaMx(dia).toISOString()).lt("inicia", inicioDiaMx(sumarDias(dia, 1)).toISOString())
    .order("inicia");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCita[]).map(aCita);
}

/** Quienes esperan en la sucursal (sin tramo todavía), el que llegó primero arriba. */
export async function citasEnEspera(token: string, sucursalId: string): Promise<CitaDia[]> {
  const { data, error } = await employeeClient(token)
    .from("citas").select(COLUMNAS)
    .eq("sucursal_id", sucursalId).eq("estado", "EN_ESPERA")
    .order("llego_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCita[]).map(aCita);
}

type FilaColab = { usuario_id: string; color_hex: string; usuarios_perfil: { nombre: string } | null };
type FilaHorario = { usuario_id: string; inicia: string; termina: string; comida_inicia: string | null; comida_termina: string | null };

/** Colaboradores activos de la sucursal, en su orden, con su horario y si faltan ese día. */
export async function colaboradoresDelDia(token: string, sucursalId: string, dia: string): Promise<ColaboradorDia[]> {
  const sb = employeeClient(token);
  const [c, h, a] = await Promise.all([
    sb.from("colaboradores_agenda").select("usuario_id, color_hex, usuarios_perfil(nombre)")
      .eq("sucursal_id", sucursalId).eq("activo", true).order("orden"),
    sb.from("horarios_colaborador").select("usuario_id, inicia, termina, comida_inicia, comida_termina").eq("dia_semana", diaSemana(dia)),
    sb.from("ausencias_colaborador").select("usuario_id").lte("desde", dia).gte("hasta", dia),
  ]);
  for (const r of [c, h, a]) if (r.error) throw new Error(r.error.message);
  const horarios = (h.data ?? []) as FilaHorario[];
  const ausentes = new Set(((a.data ?? []) as { usuario_id: string }[]).map((x) => x.usuario_id));
  return ((c.data ?? []) as unknown as FilaColab[]).map((f) => {
    const x = horarios.find((y) => y.usuario_id === f.usuario_id);
    return {
      usuarioId: f.usuario_id,
      nombre: f.usuarios_perfil?.nombre ?? "Colaborador",
      color: f.color_hex,
      horario: x ? {
        inicia: aMin(x.inicia), termina: aMin(x.termina),
        comida: x.comida_inicia && x.comida_termina ? [aMin(x.comida_inicia), aMin(x.comida_termina)] : null,
      } : null,
      ausente: ausentes.has(f.usuario_id),
    };
  });
}

/** Minutos de tolerancia del negocio; sin fila, los 15 de la columna. */
export async function toleranciaMin(token: string): Promise<number> {
  const { data } = await employeeClient(token).from("configuracion_tenant").select("agenda_tolerancia_min").maybeSingle();
  return data?.agenda_tolerancia_min ?? 15;
}

export type ServicioAgenda = {
  productoId: string; nombre: string; precio: number; duracionMin: number;
  /** Quién lo hace, con su precio y duración propios si los tiene. */
  colaboradores: { usuarioId: string; precio: number | null; duracionMin: number | null }[];
};

type FilaServicio = {
  producto_id: string; duracion_min: number; productos: { nombre: string; precio_base_mxn: number } | null;
  servicio_colaborador: { usuario_id: string; precio_mxn: number | null; duracion_min: number | null }[] | null;
};

/** Servicios activos que se agendan. */
export async function serviciosAgenda(token: string): Promise<ServicioAgenda[]> {
  const { data, error } = await employeeClient(token)
    .from("servicios_agenda")
    .select("producto_id, duracion_min, productos(nombre, precio_base_mxn), servicio_colaborador(usuario_id, precio_mxn, duracion_min)")
    .eq("activo", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaServicio[])
    .map((f) => ({
      productoId: f.producto_id, nombre: f.productos?.nombre ?? "Servicio", precio: Number(f.productos?.precio_base_mxn ?? 0), duracionMin: f.duracion_min,
      colaboradores: (f.servicio_colaborador ?? []).map((s) => ({
        usuarioId: s.usuario_id, precio: s.precio_mxn == null ? null : Number(s.precio_mxn), duracionMin: s.duracion_min,
      })),
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
}

// ── RPC (0218) ───────────────────────────────────────────────────────────────

/** `usuario_id: null` = «Quien esté libre». */
export type ServicioCita = { producto_id: string; usuario_id: string | null; espacio_id?: string | null };

export type EntradaCita = {
  id?: string;
  sucursal_id: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  cliente_email?: string | null;
  inicia?: string;
  nota?: string | null;
  client_id_local?: string;
  servicios: ServicioCita[];
};

async function rpc<T>(llamada: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await llamada;
  if (error) throw new Error(motivoAgenda(error.message));
  return data;
}

export const guardarCita = (token: string, p: EntradaCita) => rpc(employeeClient(token).rpc("guardar_cita", { p }));
export const agregarEnEspera = (token: string, p: Omit<EntradaCita, "id" | "inicia">) => rpc(employeeClient(token).rpc("agregar_en_espera", { p }));
export const atenderCita = (token: string, id: string, servicios?: ServicioCita[]) =>
  rpc(employeeClient(token).rpc("atender_cita", { p_cita: id, ...(servicios ? { p_servicios: servicios } : {}) }));
export const terminarCita = (token: string, id: string) => rpc(employeeClient(token).rpc("terminar_cita", { p_cita: id }));
export const marcarNoLlego = (token: string, id: string) => rpc(employeeClient(token).rpc("marcar_no_llego", { p_cita: id }));
export const cancelarCita = (token: string, id: string, motivo: string) => rpc(employeeClient(token).rpc("cancelar_cita", { p_cita: id, p_motivo: motivo }));
export const resolverEmpalme = (token: string, id: string) => rpc(employeeClient(token).rpc("resolver_empalme", { p_cita: id }));
export const faltasCliente = (token: string, clienteId: string) => rpc(employeeClient(token).rpc("faltas_cliente", { p_cliente: clienteId }));

// ── Una cita y una clienta ───────────────────────────────────────────────────

export async function leerCita(token: string, id: string): Promise<CitaDia> {
  const { data, error } = await employeeClient(token).from("citas").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La cita ya no existe");
  return aCita(data as unknown as FilaCita);
}

/** Las citas de una clienta, la más reciente arriba. ponytail: las últimas 200 bastan para la ficha. */
export async function citasDeCliente(token: string, clienteId: string): Promise<CitaDia[]> {
  const { data, error } = await employeeClient(token)
    .from("citas").select(COLUMNAS).eq("cliente_id", clienteId)
    .order("inicia", { ascending: false, nullsFirst: false }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FilaCita[]).map(aCita);
}

export type FichaCliente = { id: string; nombre: string; telefono: string | null; email: string | null; notas: string | null };

export async function leerFichaCliente(token: string, id: string): Promise<FichaCliente> {
  const { data, error } = await employeeClient(token)
    .from("clientes").select("id, nombre, apellido_paterno, telefono, email, notas_internas").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La clienta ya no existe");
  return {
    id: data.id, nombre: [data.nombre, data.apellido_paterno].filter(Boolean).join(" "),
    telefono: data.telefono, email: data.email, notas: data.notas_internas,
  };
}

/** Notas de la clienta (alergias, preferencias). El cajero puede: `clientes` es por negocio (RLS). */
export async function guardarNotasCliente(token: string, id: string, notas: string): Promise<void> {
  const { data, error } = await employeeClient(token)
    .from("clientes").update({ notas_internas: notas.trim() || null }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No se pudieron guardar las notas");
}

// ── Reglas de las pantallas (puras) ──────────────────────────────────────────

/** Un servicio de la cita como se captura: «Quien esté libre» es `usuarioId: null`. */
export type RenglonCita = { productoId: string; usuarioId: string | null };

/** Lo que dura con esa persona (su duración propia, si la tiene); con «quien esté libre», la del servicio. */
export function duracionCon(s: ServicioAgenda, usuarioId: string | null): number {
  return (usuarioId && s.colaboradores.find((c) => c.usuarioId === usuarioId)?.duracionMin) || s.duracionMin;
}

/** Lo que cuesta con esa persona; con «quien esté libre», el del servicio. */
export function precioCon(s: ServicioAgenda, usuarioId: string | null): number {
  return (usuarioId ? s.colaboradores.find((c) => c.usuarioId === usuarioId)?.precio : null) ?? s.precio;
}

/** El payload de `guardar_cita` (o de `agregar_en_espera`, sin `inicia`). */
export function entradaCita(f: {
  id?: string;
  sucursalId: string;
  cliente: { id: string | null; nombre: string; telefono: string; email: string };
  inicia: Date | null;
  nota: string;
  renglones: RenglonCita[];
  clientIdLocal?: string;
}): EntradaCita {
  return {
    ...(f.id ? { id: f.id } : {}),
    sucursal_id: f.sucursalId,
    cliente_id: f.cliente.id,
    cliente_nombre: f.cliente.nombre.trim() || null,
    cliente_telefono: normalizarTelefono(f.cliente.telefono) || null,
    cliente_email: f.cliente.email.trim() || null,
    ...(f.inicia ? { inicia: f.inicia.toISOString() } : {}),
    nota: f.nota.trim() || null,
    ...(f.clientIdLocal ? { client_id_local: f.clientIdLocal } : {}),
    servicios: f.renglones.map((r) => ({ producto_id: r.productoId, usuario_id: r.usuarioId })),
  };
}

export type AccionesCita = {
  atender: boolean; recordar: boolean; mover: boolean; terminar: boolean; noLlego: boolean; cancelar: boolean; empalme: boolean;
};

/** Qué ofrece la ficha según el estado. «No llegó» solo desde la hora de la cita (la base lo exige igual). */
export function accionesCita(c: Pick<CitaDia, "estado" | "inicia" | "empalme" | "tramos">, ahora: Date): AccionesCita {
  const porLlegar = c.estado === "AGENDADA";
  return {
    atender: porLlegar || c.estado === "EN_ESPERA",
    recordar: porLlegar,
    mover: porLlegar,
    terminar: c.estado === "EN_CURSO",
    noLlego: porLlegar && c.inicia != null && ahora.getTime() >= c.inicia.getTime(),
    cancelar: porLlegar || c.estado === "EN_ESPERA",
    empalme: c.empalme || c.tramos.some((t) => t.empalme),
  };
}

/** wa.me con el recordatorio; `null` si la cita no tiene un teléfono de 10 dígitos o no tiene hora. */
export function enlaceRecordatorio(c: Pick<CitaDia, "clienteNombre" | "clienteTelefono" | "inicia" | "tramos">, negocio: string): string | null {
  if (!c.inicia || normalizarTelefono(c.clienteTelefono ?? "").length !== 10) return null;
  const nombre = c.clienteNombre.trim().split(/\s+/)[0] ?? c.clienteNombre;
  return enlaceWhatsappCotizacion(c.clienteTelefono, mensajeRecordatorio({ nombre, negocio, inicia: c.inicia, servicios: c.tramos.map((t) => t.servicio) }));
}

/** Visitas (citas terminadas, la más reciente arriba) y faltas de una clienta. */
export function resumenCliente(citas: CitaDia[]): { visitas: CitaDia[]; faltas: number } {
  return {
    visitas: citas.filter((c) => c.estado === "TERMINADA").sort((a, b) => (b.inicia?.getTime() ?? 0) - (a.inicia?.getTime() ?? 0)),
    faltas: citas.filter((c) => c.estado === "NO_LLEGO").length,
  };
}

/** «1 h 15 min», «45 min». */
export function duracionTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
