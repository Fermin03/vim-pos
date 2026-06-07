"use client";
import { supabase } from "./supabase";

// Tier1 — Wizard de onboarding. En vez de un contador de clics, autodetecta qué pasos están
// completos consultando los datos reales (más robusto). La fase se persiste vía RPC
// onboarding_actualizar_fase (la tabla tiene RLS solo-lectura). Orquesta las pantallas existentes.

export type OnboardingFase = "INVITADO" | "EN_CONFIGURACION" | "GO_LIVE" | "ABANDONADO";

export type PasoOnboarding = {
  clave: string;
  titulo: string;
  descripcion: string;
  href: string;
  completo: boolean;
  opcional: boolean;
};

export type EstadoOnboarding = {
  fase: OnboardingFase;
  pasos: PasoOnboarding[];
  /** Pasos obligatorios completados / total obligatorios. */
  obligatoriosHechos: number;
  obligatoriosTotal: number;
  listoParaVender: boolean;
};

async function contar(tabla: string, filtros: Record<string, unknown> = {}): Promise<number> {
  let q = supabase.from(tabla).select("id", { count: "exact", head: true }).is("deleted_at", null);
  for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function leerEstadoOnboarding(): Promise<EstadoOnboarding> {
  // Fase actual (puede no existir fila → tratamos como INVITADO).
  const { data: ob } = await supabase.from("tenant_onboarding_estado").select("fase").maybeSingle();
  const fase = ((ob?.fase as OnboardingFase) ?? "INVITADO") as OnboardingFase;

  // Señales reales de completitud.
  const { data: negocio } = await supabase.from("tenants").select("nombre_comercial, razon_social").maybeSingle();
  const tieneNegocio = !!(negocio?.nombre_comercial && String(negocio.nombre_comercial).trim());
  const tieneFiscal = !!(negocio?.razon_social && String(negocio.razon_social).trim());

  const [productos, cajas, usuarios] = await Promise.all([
    contar("productos"),
    contar("cajas"),
    contar("usuarios_perfil"),
  ]);

  const pasos: PasoOnboarding[] = [
    { clave: "negocio", titulo: "Datos del negocio", descripcion: "Nombre, zona horaria y hora de corte.", href: "/configuracion/negocio", completo: tieneNegocio, opcional: false },
    { clave: "catalogo", titulo: "Tu menú", descripcion: "Importa o captura tus productos y categorías.", href: "/catalogo/importar", completo: productos > 0, opcional: false },
    { clave: "caja", titulo: "Sucursal y caja", descripcion: "Al menos una caja para poder vender.", href: "/configuracion/cajas", completo: cajas > 0, opcional: false },
    { clave: "equipo", titulo: "Tu equipo", descripcion: "Crea cajeros y cocina con su PIN.", href: "/usuarios", completo: usuarios > 1, opcional: false },
    { clave: "fiscal", titulo: "Datos fiscales", descripcion: "Solo si vas a facturar (CFDI).", href: "/configuracion/fiscal", completo: tieneFiscal, opcional: true },
  ];

  const obligatorios = pasos.filter((p) => !p.opcional);
  const obligatoriosHechos = obligatorios.filter((p) => p.completo).length;

  return {
    fase,
    pasos,
    obligatoriosHechos,
    obligatoriosTotal: obligatorios.length,
    listoParaVender: obligatoriosHechos === obligatorios.length,
  };
}

/** Avanza la fase de onboarding (INVITADO → EN_CONFIGURACION → GO_LIVE) vía RPC. */
export async function actualizarFase(fase: OnboardingFase, faseWizard?: number): Promise<void> {
  const { error } = await supabase.rpc("onboarding_actualizar_fase", {
    p_fase: fase,
    p_fase_wizard: faseWizard ?? null,
  });
  if (error) throw new Error(error.message);
}
