"use client";
// Lo que el admin lee y escribe del programa de lealtad (ADR 0030, spec §7).
//
// El admin NO decide reglas: el programa se guarda por `lealtad_guardar_programa` (0156), que valida
// con mensajes para el dueño y es la única que sabe reiniciar saldos al cambiar de mecánica. Los
// premios se escriben directo bajo RLS (solo dueño o administrador). El libro, las cifras y el ajuste
// manual están en lealtad-libro.ts.
import { z } from "zod";
import { cantidad, puntosPorCompra, type Mecanica } from "@vim/db/lealtad";
import { supabase, leerSesion } from "./supabase";

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

const SOLO_ADMIN = "Solo el dueño o un administrador puede cambiar la lealtad.";

/** Los rechazos de la base, en palabras del dueño. Lo que ya viene en español se respeta. */
export function mensajeLealtad(e: unknown, porDefecto: string): string {
  const crudo = e instanceof Error ? e.message : typeof e === "string" ? e : ((e as { message?: string } | null)?.message ?? "");
  if (!crudo) return porDefecto;
  if (crudo.includes("SIN_PROGRAMA_LEALTAD")) return "Primero guarda tu programa: elige cómo ganan tus clientes.";
  if (crudo.includes("SIN_ADDON_LEALTAD")) return "El programa de lealtad no está incluido en tu plan. Escríbenos y lo activamos contigo.";
  if (crudo.includes("lealtad_premios_producto_uq")) return "Ese producto ya es un premio.";
  // El rechazo crudo de la base (RLS, permisos) no le dice nada al dueño. Los mensajes que las
  // funciones ya mandan en español («Solo el dueño o un administrador…») pasan tal cual.
  if (/row-level security|permission denied/i.test(crudo)) return SOLO_ADMIN;
  return crudo;
}

function fallo(error: { message: string; code?: string }, porDefecto: string): Error {
  return new Error(mensajeLealtad(error, porDefecto));
}

// ── Programa ──────────────────────────────────────────────────────────────────

export type ProgramaAdmin = {
  mecanica: Mecanica;
  version: number;
  porcentaje: number | null;
  pesosPorPunto: number | null;
  compraMinima: number;
  /** null = los puntos no vencen. */
  vencimientoMeses: number | null;
  topeComprasDia: number;
};

/** El formulario guarda textos: así un campo a medio escribir no se convierte en 0. */
export type FormPrograma = {
  mecanica: Mecanica;
  porcentaje: string;
  pesosPorPunto: string;
  compraMinima: string;
  vencimientoMeses: string;
  topeComprasDia: string;
};

export const FORM_PROGRAMA_INICIAL: FormPrograma = {
  mecanica: "PUNTOS_DINERO", porcentaje: "5", pesosPorPunto: "", compraMinima: "0", vencimientoMeses: "", topeComprasDia: "3",
};

const txt = (n: number | null): string => (n == null ? "" : String(n));

export function formDePrograma(p: ProgramaAdmin): FormPrograma {
  return {
    mecanica: p.mecanica,
    porcentaje: txt(p.porcentaje),
    pesosPorPunto: txt(p.pesosPorPunto),
    compraMinima: txt(p.compraMinima),
    vencimientoMeses: txt(p.vencimientoMeses),
    topeComprasDia: txt(p.topeComprasDia),
  };
}

const numero = (s: string): number => Number(s.trim().replace(",", "."));
const vacio = (s: string): boolean => s.trim() === "";

/** Mismas reglas que valida `lealtad_guardar_programa`: aquí solo se dicen antes de ir a la base. */
export const programaSchema = z
  .object({
    mecanica: z.enum(["PUNTOS_DINERO", "SELLOS", "PUNTOS_PREMIOS"]),
    porcentaje: z.string(),
    pesosPorPunto: z.string(),
    compraMinima: z.string(),
    vencimientoMeses: z.string(),
    topeComprasDia: z.string(),
  })
  .refine((d) => d.mecanica !== "PUNTOS_DINERO" || (!vacio(d.porcentaje) && numero(d.porcentaje) > 0 && numero(d.porcentaje) <= 50), {
    message: "El porcentaje de puntos debe ser mayor que 0 y de máximo 50.", path: ["porcentaje"],
  })
  .refine((d) => d.mecanica !== "PUNTOS_PREMIOS" || (!vacio(d.pesosPorPunto) && numero(d.pesosPorPunto) > 0), {
    message: "Indica cuántos pesos de compra valen un punto.", path: ["pesosPorPunto"],
  })
  .refine((d) => vacio(d.compraMinima) || numero(d.compraMinima) >= 0, {
    message: "La compra mínima no puede ser negativa.", path: ["compraMinima"],
  })
  .refine((d) => vacio(d.vencimientoMeses) || (Number.isInteger(numero(d.vencimientoMeses)) && numero(d.vencimientoMeses) >= 1 && numero(d.vencimientoMeses) <= 60), {
    message: "El vencimiento va de 1 a 60 meses. Déjalo vacío si no vencen.", path: ["vencimientoMeses"],
  })
  .refine((d) => !vacio(d.topeComprasDia) && Number.isInteger(numero(d.topeComprasDia)) && numero(d.topeComprasDia) >= 1 && numero(d.topeComprasDia) <= 50, {
    message: "El tope de compras por día debe estar entre 1 y 50.", path: ["topeComprasDia"],
  });

const pesos = (n: number): string => `$${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

/**
 * El ejemplo que se actualiza mientras el dueño escribe (spec §7). Usa la MISMA regla que la caja
 * (`puntosPorCompra`, espejo de la de SQL): lo que aquí se promete es lo que la caja va a dar.
 * Devuelve null si con lo escrito todavía no hay ejemplo que dar.
 */
export function ejemploPrograma(f: FormPrograma): string | null {
  const minima = vacio(f.compraMinima) ? 0 : numero(f.compraMinima);
  if (!Number.isFinite(minima) || minima < 0) return null;
  const compra = Math.max(200, minima);
  const regla = {
    mecanica: f.mecanica,
    porcentaje: vacio(f.porcentaje) ? null : numero(f.porcentaje),
    pesosPorPunto: vacio(f.pesosPorPunto) ? null : numero(f.pesosPorPunto),
    compraMinima: minima,
  };
  if (f.mecanica === "SELLOS") {
    return minima > 0 ? `Cada visita de ${pesos(minima)} o más gana 1 sello.` : "Cada visita gana 1 sello, sin importar cuánto consuma.";
  }
  const gana = puntosPorCompra(regla, compra);
  if (gana <= 0) return null;
  if (f.mecanica === "PUNTOS_DINERO") {
    return `Una compra de ${pesos(compra)} gana ${cantidad(f.mecanica, gana)}, que valen ${pesos(gana)} en su siguiente visita.`;
  }
  return `Una compra de ${pesos(compra)} gana ${cantidad(f.mecanica, gana)}, que se cambian por los premios que definas.`;
}

export async function leerProgramaAdmin(): Promise<ProgramaAdmin | null> {
  const { data, error } = await supabase
    .from("lealtad_programa")
    .select("mecanica, version, porcentaje, pesos_por_punto, compra_minima_mxn, vencimiento_meses, tope_compras_dia")
    .maybeSingle();
  if (error) throw fallo(error, "No se pudo leer el programa");
  if (!data) return null;
  const p = data as Record<string, unknown>;
  return {
    mecanica: p.mecanica as Mecanica,
    version: Number(p.version),
    porcentaje: p.porcentaje == null ? null : Number(p.porcentaje),
    pesosPorPunto: p.pesos_por_punto == null ? null : Number(p.pesos_por_punto),
    compraMinima: Number(p.compra_minima_mxn ?? 0),
    vencimientoMeses: p.vencimiento_meses == null ? null : Number(p.vencimiento_meses),
    topeComprasDia: Number(p.tope_compras_dia ?? 3),
  };
}

export type ResultadoGuardar =
  | { ok: true; version: number; clientesReiniciados: number }
  /** Cambiar de mecánica pondría en cero el saldo de estos clientes: hay que confirmarlo. */
  | { ok: false; clientesConSaldo: number };

/**
 * Guarda el programa. Cambiar de mecánica pone TODOS los saldos en cero (no son convertibles): sin
 * `confirmarReinicio` la base no guarda nada y contesta a cuántos clientes afectaría.
 */
export async function guardarPrograma(f: FormPrograma, confirmarReinicio: boolean): Promise<ResultadoGuardar> {
  const v = programaSchema.safeParse(f);
  if (!v.success) throw new Error(v.error.issues[0]?.message ?? "Revisa los datos del programa.");
  const { data, error } = await supabase.rpc("lealtad_guardar_programa", {
    p_mecanica: f.mecanica,
    p_porcentaje: f.mecanica === "PUNTOS_DINERO" ? numero(f.porcentaje) : null,
    p_pesos_por_punto: f.mecanica === "PUNTOS_PREMIOS" ? numero(f.pesosPorPunto) : null,
    p_compra_minima_mxn: vacio(f.compraMinima) ? 0 : numero(f.compraMinima),
    p_vencimiento_meses: vacio(f.vencimientoMeses) ? null : numero(f.vencimientoMeses),
    p_tope_compras_dia: numero(f.topeComprasDia),
    p_confirmar_reinicio: confirmarReinicio,
  });
  if (error) throw fallo(error, "No se pudo guardar el programa");
  const r = (data ?? {}) as { ok?: boolean; version?: number; clientes_reiniciados?: number; clientes_con_saldo?: number };
  if (r.ok === true) return { ok: true, version: Number(r.version ?? 1), clientesReiniciados: Number(r.clientes_reiniciados ?? 0) };
  return { ok: false, clientesConSaldo: Number(r.clientes_con_saldo ?? 0) };
}

/**
 * Enciende o apaga la lealtad del negocio. Mismo upsert que delivery (`activarModuloDelivery`): la
 * mayoría de los negocios no tiene fila en `configuracion_tenant` hasta su primer ajuste. La base
 * exige el programa guardado y el permiso de VIM; sus rechazos se traducen.
 */
export async function activarModuloLealtad(activo: boolean): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase
    .from("configuracion_tenant")
    .upsert({ tenant_id: tid, modulo_lealtad_activo: activo }, { onConflict: "tenant_id" });
  if (error) throw fallo(error, "No se pudo cambiar");
}

/**
 * Lo que la base dice hoy del interruptor. El shell lee los módulos una sola vez por sesión, así que
 * la página no puede fiarse de eso: al volver de otra pestaña mostraría el valor de cuando entró.
 * Sin fila en `configuracion_tenant` (el negocio nunca ajustó nada) la lealtad está apagada.
 */
export async function leerLealtadEncendida(): Promise<boolean> {
  const tid = await tenantId();
  const { data, error } = await supabase
    .from("configuracion_tenant")
    .select("modulo_lealtad_activo")
    .eq("tenant_id", tid)
    .maybeSingle();
  if (error) throw fallo(error, "No se pudo leer si el programa está encendido");
  return (data as { modulo_lealtad_activo?: boolean } | null)?.modulo_lealtad_activo === true;
}

// ── Premios ───────────────────────────────────────────────────────────────────

export type PremioAdmin = {
  id: string;
  productoId: string;
  nombre: string;
  /** Precio de lista del producto: lo que el negocio deja de cobrar al regalarlo. */
  precio: number;
  /** Puntos o sellos que cuesta. */
  costo: number;
  activo: boolean;
  /** false = su producto está pausado o se eliminó: en caja no se puede entregar. */
  productoDisponible: boolean;
};

type ProductoDePremio = { id: string; nombre: string; precio_base_mxn: string | number; estado: string; deleted_at: string | null };

export async function listarPremios(): Promise<PremioAdmin[]> {
  const { data, error } = await supabase
    .from("lealtad_premios")
    .select("id, costo, activo, producto:productos(id, nombre, precio_base_mxn, estado, deleted_at)")
    .is("deleted_at", null)
    .order("costo", { ascending: true });
  if (error) throw fallo(error, "No se pudieron leer los premios");
  type Fila = { id: string; costo: number; activo: boolean; producto: ProductoDePremio | ProductoDePremio[] | null };
  return ((data ?? []) as unknown as Fila[])
    .flatMap((f) => {
      const p = Array.isArray(f.producto) ? f.producto[0] : f.producto;
      if (!p) return [];
      return [{
        id: f.id, productoId: p.id, nombre: p.nombre, precio: Number(p.precio_base_mxn) || 0,
        costo: Number(f.costo), activo: f.activo !== false,
        productoDisponible: p.deleted_at == null && p.estado !== "PAUSADO",
      }];
    })
    .sort((a, b) => a.costo - b.costo || a.nombre.localeCompare(b.nombre));
}

/**
 * Productos que se pueden ofrecer como premio: activos, que NO son combo (un combo no se puede
 * canjear: la base lo rechaza en la caja) y que todavía no son un premio.
 */
export async function productosParaPremio(): Promise<{ id: string; nombre: string; precio: number }[]> {
  const [prod, prem] = await Promise.all([
    supabase.from("productos").select("id, nombre, precio_base_mxn, es_combo, estado").is("deleted_at", null).order("nombre", { ascending: true }),
    supabase.from("lealtad_premios").select("producto:productos(id)").is("deleted_at", null),
  ]);
  if (prod.error) throw fallo(prod.error, "No se pudieron leer los productos");
  if (prem.error) throw fallo(prem.error, "No se pudieron leer los premios");
  const yaSon = new Set(((prem.data ?? []) as unknown as { producto: { id: string } | { id: string }[] | null }[])
    .map((f) => (Array.isArray(f.producto) ? f.producto[0]?.id : f.producto?.id))
    .filter(Boolean));
  return ((prod.data ?? []) as { id: string; nombre: string; precio_base_mxn: string | number; es_combo: boolean; estado: string }[])
    .filter((p) => !p.es_combo && p.estado !== "PAUSADO" && !yaSon.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio_base_mxn) || 0 }));
}

export const costoPremioSchema = z.coerce
  .number()
  .int("El costo va en números enteros.")
  .min(1, "El costo debe ser de 1 en adelante.")
  .max(100000, "El costo no puede pasar de 100,000.");

export async function crearPremio(productoId: string, costo: number): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("lealtad_premios").insert({ tenant_id: tid, producto_id: productoId, costo });
  if (error) throw fallo(error, "No se pudo crear el premio");
}

export async function cambiarCostoPremio(id: string, costo: number): Promise<void> {
  const { error } = await supabase.from("lealtad_premios").update({ costo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw fallo(error, "No se pudo cambiar el costo");
}

/** Un premio pausado deja de ofrecerse en la caja; los canjes ya hechos no cambian. */
export async function setActivoPremio(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("lealtad_premios").update({ activo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw fallo(error, "No se pudo cambiar el premio");
}

/** Baja lógica: el libro sigue apuntando al premio. */
export async function eliminarPremio(id: string): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("lealtad_premios").update({ deleted_at: ahora, activo: false, updated_at: ahora }).eq("id", id);
  if (error) throw fallo(error, "No se pudo eliminar el premio");
}
