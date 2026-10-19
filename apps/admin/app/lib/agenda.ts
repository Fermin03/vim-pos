"use client";
import { z } from "zod";
import { DIAS, horaValida } from "@vim/fecha";
import { supabase } from "./supabase";
import { tenantId } from "./datos";
import { COLORES, crearProducto } from "./catalogo";

// Catálogo de la agenda (belleza, 0218): servicios, colaboradores, espacios y tolerancia. Escribe
// directo a las tablas; la RLS deja escribir solo al dueño o a un administrador.

// ── Colores y días ───────────────────────────────────────────────────────────

const PALETA = COLORES.map((c) => c.hex);

/** El primer color de la paleta funcional que nadie usa; con todos usados, se repite en orden. */
export function siguienteColor(usados: string[]): string {
  const u = new Set(usados.map((h) => h.toUpperCase()));
  return PALETA.find((h) => !u.has(h)) ?? PALETA[usados.length % PALETA.length]!;
}

/** Lunes primero en pantalla; en la base `dia_semana` es 0 = domingo. */
export const DIAS_AGENDA: readonly { dia: number; nombre: string }[] = DIAS.map((d) => ({ dia: Number(d.dia) % 7, nombre: d.nombre }));

/** `09:00:00` de la base → `09:00` del campo. */
const hhmm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

// ── Esquemas ─────────────────────────────────────────────────────────────────

const duracion = z.number({ error: "Duración inválida" }).int("La duración va en minutos enteros")
  .min(5, "La duración es de 5 a 600 minutos").max(600, "La duración es de 5 a 600 minutos");
const hora = z.string().refine(horaValida, "Escribe las horas como 09:00 o 18:30");

/** Comisión o anticipo (0221): porcentaje de 0 a 100 o monto en pesos ≥ 0. null = sin regla. */
export const reglaSchema = z.object({
  tipo: z.enum(["PORCENTAJE", "MONTO"]),
  valor: z.number({ error: "Escribe un número" }).min(0, "No puede ser negativo"),
}).refine((r) => r.tipo === "MONTO" || r.valor <= 100, "El porcentaje va de 0 a 100").nullable();
export type Regla = z.infer<typeof reglaSchema>;

/** Como se teclea una regla: tipo vacío = sin regla. */
export type CamposRegla = { tipo: "" | "PORCENTAJE" | "MONTO"; valor: string };
export const camposDe = (r: Regla): CamposRegla => (r ? { tipo: r.tipo, valor: String(r.valor) } : { tipo: "", valor: "" });
/** Campos → regla sin validar (un valor vacío llega como NaN y el esquema lo rechaza). */
export const reglaDeCampos = (c: CamposRegla): unknown =>
  c.tipo === "" ? null : { tipo: c.tipo, valor: c.valor.trim() === "" ? NaN : Number(c.valor) };
/** «40 %», «$50.00» o «—». */
export const textoRegla = (r: Regla): string =>
  !r ? "—" : r.tipo === "PORCENTAJE" ? `${r.valor} %` : r.valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export const servicioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200, "Máximo 200 caracteres"),
  categoria_id: z.string().guid("Elige una categoría"),
  precio_base_mxn: z.number({ error: "Precio inválido" }).min(0, "El precio no puede ser negativo"),
  duracion_min: duracion,
  tipo_espacio_id: z.string().guid().nullable(),
  comision: reglaSchema,
  anticipo: reglaSchema,
  clave_sat: z.string().trim().regex(/^\d{8}$/, "La clave del SAT son 8 dígitos").nullable(),
});
export type ServicioInput = z.infer<typeof servicioSchema>;

/** Quién hace el servicio; precio y duración vacíos = los del servicio. */
export const servicioColaboradorSchema = z.object({
  usuario_id: z.string().guid(),
  precio_mxn: z.number({ error: "Precio inválido" }).min(0, "El precio no puede ser negativo").nullable(),
  duracion_min: duracion.nullable(),
  /** Su excepción de comisión en este servicio; gana a la del servicio. */
  comision: reglaSchema,
});
export type ServicioColaboradorInput = z.infer<typeof servicioColaboradorSchema>;

// Las horas `HH:MM` se comparan bien como texto.
export const horarioSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  inicia: hora,
  termina: hora,
  comida_inicia: hora.nullable(),
  comida_termina: hora.nullable(),
})
  .refine((h) => h.termina > h.inicia, "La salida tiene que ser después de la entrada")
  .refine((h) => (h.comida_inicia === null) === (h.comida_termina === null), "Pon las dos horas de la comida, o ninguna")
  .refine((h) => h.comida_inicia === null || h.comida_termina === null
    || (h.comida_inicia >= h.inicia && h.comida_termina > h.comida_inicia && h.comida_termina <= h.termina),
    "La comida tiene que caer dentro del horario");
export type HorarioInput = z.infer<typeof horarioSchema>;

export const ausenciaSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de inicio"),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha de fin"),
  motivo: z.string().trim().max(200, "Máximo 200 caracteres"),
}).refine((a) => a.hasta >= a.desde, "La fecha de fin no puede ser antes del inicio");
export type AusenciaInput = z.infer<typeof ausenciaSchema>;

export const nombreEspacioSchema = z.string().trim().min(1, "El nombre es obligatorio").max(60, "Máximo 60 caracteres");

export const toleranciaValida = (v: string): boolean => /^\d+$/.test(v.trim()) && Number(v) <= 120;
export const horasCancelarValidas = (v: string): boolean => /^\d+$/.test(v.trim()) && Number(v) <= 168;
/** Porcentaje de 0 a 100 con hasta dos decimales (numeric(5,2)). */
export const pctValido = (v: string): boolean => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100;
/** Pesos con hasta dos centavos, ≥ 0. */
export const sueldoValido = (v: string): boolean => /^\d+(\.\d{1,2})?$/.test(v.trim());

/** Regla de la base → como viaja en el formulario. */
const reglaDe = (tipo: string | null, valor: unknown): Regla =>
  tipo === "PORCENTAJE" || tipo === "MONTO" ? { tipo, valor: Number(valor) } : null;
/** Regla → columnas `<prefijo>_tipo` / `<prefijo>_valor` (la base exige las dos o ninguna). */
const columnasRegla = (p: "comision" | "anticipo", r: Regla) => ({ [`${p}_tipo`]: r?.tipo ?? null, [`${p}_valor`]: r?.valor ?? null });

const ok = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message); };

// ── Servicios ────────────────────────────────────────────────────────────────

export type Servicio = {
  id: string; nombre: string; precio: number; categoriaId: string; duracionMin: number;
  tipoEspacioId: string | null; activo: boolean; colaboradores: ServicioColaboradorInput[];
  comision: Regla; anticipo: Regla; claveSat: string | null;
};

type FilaServicio = {
  producto_id: string; duracion_min: number; tipo_espacio_id: string | null; activo: boolean;
  comision_tipo: string | null; comision_valor: unknown; anticipo_tipo: string | null; anticipo_valor: unknown;
  producto: { nombre: string; precio_base_mxn: unknown; categoria_id: string; clave_sat: string | null; deleted_at: string | null } | null;
};
type FilaSC = { producto_id: string; usuario_id: string; precio_mxn: unknown; duracion_min: number | null; comision_tipo: string | null; comision_valor: unknown };

export async function listarServicios(): Promise<Servicio[]> {
  const [s, sc] = await Promise.all([
    supabase.from("servicios_agenda").select("producto_id, duracion_min, tipo_espacio_id, activo, comision_tipo, comision_valor, anticipo_tipo, anticipo_valor, producto:productos(nombre, precio_base_mxn, categoria_id, clave_sat, deleted_at)"),
    supabase.from("servicio_colaborador").select("producto_id, usuario_id, precio_mxn, duracion_min, comision_tipo, comision_valor"),
  ]);
  ok(s); ok(sc);
  const porServicio = new Map<string, ServicioColaboradorInput[]>();
  for (const f of (sc.data ?? []) as FilaSC[]) {
    const l = porServicio.get(f.producto_id) ?? [];
    l.push({ usuario_id: f.usuario_id, precio_mxn: f.precio_mxn === null ? null : Number(f.precio_mxn), duracion_min: f.duracion_min, comision: reglaDe(f.comision_tipo, f.comision_valor) });
    porServicio.set(f.producto_id, l);
  }
  return ((s.data ?? []) as unknown as FilaServicio[])
    .filter((f) => f.producto && !f.producto.deleted_at)
    .map((f) => ({
      id: f.producto_id, nombre: f.producto!.nombre, precio: Number(f.producto!.precio_base_mxn), categoriaId: f.producto!.categoria_id,
      duracionMin: f.duracion_min, tipoEspacioId: f.tipo_espacio_id, activo: f.activo, colaboradores: porServicio.get(f.producto_id) ?? [],
      comision: reglaDe(f.comision_tipo, f.comision_valor), anticipo: reglaDe(f.anticipo_tipo, f.anticipo_valor), claveSat: f.producto!.clave_sat,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Un servicio es un producto que se agenda. Sin existencias y por pieza; `unidad_sat` queda vacía
 * como en el formulario de producto, y el CFDI le pone E48 (servicio). Si el segundo paso falla, el
 * producto recién hecho se da de baja para no dejarlo suelto en el catálogo.
 */
export async function crearServicio(input: ServicioInput): Promise<string> {
  const d = servicioSchema.parse(input);
  const tid = await tenantId();
  const id = await crearProducto(
    { nombre: d.nombre, categoria_id: d.categoria_id, precio_base_mxn: d.precio_base_mxn, clave_sat: d.clave_sat ?? "", estado: "ACTIVO", agotado: false, visible_en_pos: true, tasa_iva: 16, iva_incluido_en_precio: true },
    { tienda: { codigo_barras: "", costo_mxn: null, controla_existencias: false, tipo_venta: "UNIDAD" } },
  );
  const { error } = await supabase.from("servicios_agenda").insert({
    producto_id: id, tenant_id: tid, duracion_min: d.duracion_min, tipo_espacio_id: d.tipo_espacio_id,
    ...columnasRegla("comision", d.comision), ...columnasRegla("anticipo", d.anticipo),
  });
  if (error) {
    await supabase.from("productos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    throw new Error(error.message);
  }
  return id;
}

/** Solo lo que este formulario enseña: el resto de la ficha del producto (IVA, foto…) no se toca. */
export async function actualizarServicio(id: string, input: ServicioInput): Promise<void> {
  const d = servicioSchema.parse(input);
  ok(await supabase.from("productos").update({ nombre: d.nombre, categoria_id: d.categoria_id, precio_base_mxn: d.precio_base_mxn, clave_sat: d.clave_sat }).eq("id", id));
  ok(await supabase.from("servicios_agenda").update({
    duracion_min: d.duracion_min, tipo_espacio_id: d.tipo_espacio_id, ...columnasRegla("comision", d.comision), ...columnasRegla("anticipo", d.anticipo),
  }).eq("producto_id", id));
}

export async function activarServicio(id: string, activo: boolean): Promise<void> {
  ok(await supabase.from("servicios_agenda").update({ activo }).eq("producto_id", id));
}

/** Deja exactamente esta lista de colaboradores en el servicio, con su precio y duración. */
export async function guardarColaboradoresDeServicio(productoId: string, filas: ServicioColaboradorInput[]): Promise<void> {
  const l = filas.map((f) => servicioColaboradorSchema.parse(f));
  const tid = await tenantId();
  if (l.length) ok(await supabase.from("servicio_colaborador").upsert(l.map(({ comision, ...f }) => ({ ...f, ...columnasRegla("comision", comision), producto_id: productoId, tenant_id: tid })), { onConflict: "producto_id,usuario_id" }));
  let borrar = supabase.from("servicio_colaborador").delete().eq("producto_id", productoId);
  if (l.length) borrar = borrar.not("usuario_id", "in", `(${l.map((f) => f.usuario_id).join(",")})`);
  ok(await borrar);
}

/** Deja exactamente estos servicios al colaborador. Los que ya tenía conservan su precio, duración y comisión. */
export async function guardarServiciosDeColaborador(usuarioId: string, productoIds: string[]): Promise<void> {
  const tid = await tenantId();
  if (productoIds.length) ok(await supabase.from("servicio_colaborador").upsert(
    productoIds.map((p) => ({ producto_id: p, usuario_id: usuarioId, tenant_id: tid })),
    { onConflict: "producto_id,usuario_id", ignoreDuplicates: true },
  ));
  let borrar = supabase.from("servicio_colaborador").delete().eq("usuario_id", usuarioId);
  if (productoIds.length) borrar = borrar.not("producto_id", "in", `(${productoIds.join(",")})`);
  ok(await borrar);
}

// ── Colaboradores ────────────────────────────────────────────────────────────

export type Horario = HorarioInput;
export type Ausencia = AusenciaInput & { id: string };
export type Colaborador = {
  usuarioId: string; sucursalId: string; color: string; activo: boolean; orden: number; sueldo: number;
  horarios: Horario[]; ausencias: Ausencia[];
};

type FilaColab = { usuario_id: string; sucursal_id: string; color_hex: string; activo: boolean; orden: number; sueldo_periodo_mxn: unknown };
type FilaHorario = { usuario_id: string; dia_semana: number; inicia: string; termina: string; comida_inicia: string | null; comida_termina: string | null };
type FilaAusencia = { id: string; usuario_id: string; desde: string; hasta: string; motivo: string | null };

export async function listarColaboradores(): Promise<Colaborador[]> {
  const [c, h, a] = await Promise.all([
    supabase.from("colaboradores_agenda").select("usuario_id, sucursal_id, color_hex, activo, orden, sueldo_periodo_mxn").order("orden"),
    supabase.from("horarios_colaborador").select("usuario_id, dia_semana, inicia, termina, comida_inicia, comida_termina"),
    supabase.from("ausencias_colaborador").select("id, usuario_id, desde, hasta, motivo").order("desde"),
  ]);
  ok(c); ok(h); ok(a);
  const horarios = (h.data ?? []) as FilaHorario[];
  const ausencias = (a.data ?? []) as FilaAusencia[];
  return ((c.data ?? []) as FilaColab[]).map((f) => ({
    usuarioId: f.usuario_id, sucursalId: f.sucursal_id, color: f.color_hex, activo: f.activo, orden: f.orden, sueldo: Number(f.sueldo_periodo_mxn),
    horarios: horarios.filter((x) => x.usuario_id === f.usuario_id).map((x) => ({
      dia_semana: x.dia_semana, inicia: hhmm(x.inicia)!, termina: hhmm(x.termina)!,
      comida_inicia: hhmm(x.comida_inicia), comida_termina: hhmm(x.comida_termina),
    })),
    ausencias: ausencias.filter((x) => x.usuario_id === f.usuario_id).map((x) => ({ id: x.id, desde: x.desde, hasta: x.hasta, motivo: x.motivo ?? "" })),
  }));
}

/** Da de alta (o vuelve a activar) a un empleado en la agenda, al final de la lista. */
export async function altaColaborador(d: { usuarioId: string; sucursalId: string; color: string; orden: number }): Promise<void> {
  const tid = await tenantId();
  ok(await supabase.from("colaboradores_agenda").upsert(
    { tenant_id: tid, usuario_id: d.usuarioId, sucursal_id: d.sucursalId, color_hex: d.color, orden: d.orden, activo: true },
    { onConflict: "tenant_id,usuario_id" },
  ));
}

export async function actualizarColaborador(usuarioId: string, cambio: { sucursalId?: string; color?: string; activo?: boolean; sueldo?: number }): Promise<void> {
  const fila: Record<string, unknown> = {};
  if (cambio.sucursalId !== undefined) fila.sucursal_id = cambio.sucursalId;
  if (cambio.color !== undefined) fila.color_hex = cambio.color;
  if (cambio.activo !== undefined) fila.activo = cambio.activo;
  if (cambio.sueldo !== undefined) fila.sueldo_periodo_mxn = cambio.sueldo;
  ok(await supabase.from("colaboradores_agenda").update(fila).eq("usuario_id", usuarioId));
}

/** Deja exactamente estos días: los que no vienen se borran (ese día no trabaja). */
export async function guardarHorarios(usuarioId: string, horarios: HorarioInput[]): Promise<void> {
  const l = horarios.map((h) => horarioSchema.parse(h));
  const tid = await tenantId();
  if (l.length) ok(await supabase.from("horarios_colaborador").upsert(
    l.map((h) => ({ ...h, tenant_id: tid, usuario_id: usuarioId })),
    { onConflict: "tenant_id,usuario_id,dia_semana" },
  ));
  let borrar = supabase.from("horarios_colaborador").delete().eq("usuario_id", usuarioId);
  if (l.length) borrar = borrar.not("dia_semana", "in", `(${l.map((h) => h.dia_semana).join(",")})`);
  ok(await borrar);
}

export async function crearAusencia(usuarioId: string, input: AusenciaInput): Promise<void> {
  const d = ausenciaSchema.parse(input);
  const tid = await tenantId();
  ok(await supabase.from("ausencias_colaborador").insert({ tenant_id: tid, usuario_id: usuarioId, desde: d.desde, hasta: d.hasta, motivo: d.motivo || null }));
}

export async function borrarAusencia(id: string): Promise<void> {
  ok(await supabase.from("ausencias_colaborador").delete().eq("id", id));
}

// ── Espacios ─────────────────────────────────────────────────────────────────

export type TipoEspacio = { id: string; nombre: string };
export type Espacio = { id: string; nombre: string; sucursalId: string; tipoEspacioId: string; activo: boolean; orden: number };

export async function listarTiposEspacio(): Promise<TipoEspacio[]> {
  const r = await supabase.from("tipos_espacio").select("id, nombre").order("nombre");
  ok(r);
  return (r.data ?? []) as TipoEspacio[];
}

export async function guardarTipoEspacio(id: string | null, nombre: string): Promise<void> {
  const n = nombreEspacioSchema.parse(nombre);
  if (id) return ok(await supabase.from("tipos_espacio").update({ nombre: n }).eq("id", id));
  ok(await supabase.from("tipos_espacio").insert({ tenant_id: await tenantId(), nombre: n }));
}

/** Sin `activo` en la tabla: se borra. Si un espacio o un servicio lo usa, la base no deja. */
export async function borrarTipoEspacio(id: string): Promise<void> {
  ok(await supabase.from("tipos_espacio").delete().eq("id", id));
}

type FilaEspacio = { id: string; nombre: string; sucursal_id: string; tipo_espacio_id: string; activo: boolean; orden: number };

export async function listarEspacios(): Promise<Espacio[]> {
  const r = await supabase.from("espacios").select("id, nombre, sucursal_id, tipo_espacio_id, activo, orden").order("orden").order("nombre");
  ok(r);
  return ((r.data ?? []) as FilaEspacio[]).map((f) => ({
    id: f.id, nombre: f.nombre, sucursalId: f.sucursal_id, tipoEspacioId: f.tipo_espacio_id, activo: f.activo, orden: f.orden,
  }));
}

export async function guardarEspacio(id: string | null, d: { nombre: string; sucursalId: string; tipoEspacioId: string; orden: number }): Promise<void> {
  const fila = { nombre: nombreEspacioSchema.parse(d.nombre), sucursal_id: d.sucursalId, tipo_espacio_id: d.tipoEspacioId };
  if (id) return ok(await supabase.from("espacios").update(fila).eq("id", id));
  ok(await supabase.from("espacios").insert({ ...fila, tenant_id: await tenantId(), orden: d.orden }));
}

export async function activarEspacio(id: string, activo: boolean): Promise<void> {
  ok(await supabase.from("espacios").update({ activo }).eq("id", id));
}

// ── Reglas de la agenda (configuración del negocio) ──────────────────────────

export const COBRO_MODOS = [
  { v: "AL_FINAL", l: "Al final" },
  { v: "ANTICIPO", l: "Anticipo al apartar" },
  { v: "TODO", l: "Todo por adelantado" },
] as const;
export const BASES_COMISION = [
  { v: "COBRADO", l: "Sobre lo cobrado (con descuentos, sin IVA)" },
  { v: "LISTA", l: "Sobre el precio de lista (sin IVA)" },
] as const;
export const PERIODOS_COMISION = [{ v: "SEMANAL", l: "Semanal" }, { v: "QUINCENAL", l: "Quincenal" }] as const;

export type ConfigAgenda = {
  tolerancia: number;
  cobroModo: (typeof COBRO_MODOS)[number]["v"];
  cancelarHoras: number;
  comisionBase: (typeof BASES_COMISION)[number]["v"];
  /** null = los productos no dan comisión. */
  comisionProductosPct: number | null;
  periodo: (typeof PERIODOS_COMISION)[number]["v"];
};

/** Los valores por omisión de la base (0218, 0221): sin fila en `configuracion_tenant` rigen estos. */
const POR_OMISION: ConfigAgenda = { tolerancia: 15, cobroModo: "AL_FINAL", cancelarHoras: 24, comisionBase: "COBRADO", comisionProductosPct: null, periodo: "SEMANAL" };

type FilaConfig = {
  agenda_tolerancia_min: number; agenda_cobro_modo: ConfigAgenda["cobroModo"]; agenda_cancelar_horas: number;
  agenda_comision_base: ConfigAgenda["comisionBase"]; agenda_comision_productos_pct: unknown; agenda_periodo_comisiones: ConfigAgenda["periodo"];
};

export async function leerConfigAgenda(): Promise<ConfigAgenda> {
  const tid = await tenantId();
  const r = await supabase.from("configuracion_tenant")
    .select("agenda_tolerancia_min, agenda_cobro_modo, agenda_cancelar_horas, agenda_comision_base, agenda_comision_productos_pct, agenda_periodo_comisiones")
    .eq("tenant_id", tid).maybeSingle();
  ok(r);
  const f = r.data as FilaConfig | null;
  if (!f) return POR_OMISION;
  return {
    tolerancia: f.agenda_tolerancia_min, cobroModo: f.agenda_cobro_modo, cancelarHoras: f.agenda_cancelar_horas,
    comisionBase: f.agenda_comision_base, periodo: f.agenda_periodo_comisiones,
    comisionProductosPct: f.agenda_comision_productos_pct === null ? null : Number(f.agenda_comision_productos_pct),
  };
}

/** Solo lo que viene. La base deja cambiarlas solo al dueño o a un administrador (guardia de 0218/0221). */
export async function guardarConfigAgenda(c: Partial<ConfigAgenda>): Promise<void> {
  const fila: Record<string, unknown> = { tenant_id: await tenantId() };
  if (c.tolerancia !== undefined) fila.agenda_tolerancia_min = c.tolerancia;
  if (c.cobroModo !== undefined) fila.agenda_cobro_modo = c.cobroModo;
  if (c.cancelarHoras !== undefined) fila.agenda_cancelar_horas = c.cancelarHoras;
  if (c.comisionBase !== undefined) fila.agenda_comision_base = c.comisionBase;
  if (c.comisionProductosPct !== undefined) fila.agenda_comision_productos_pct = c.comisionProductosPct;
  if (c.periodo !== undefined) fila.agenda_periodo_comisiones = c.periodo;
  ok(await supabase.from("configuracion_tenant").upsert(fila, { onConflict: "tenant_id" }));
}
