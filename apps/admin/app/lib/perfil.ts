"use client";
import { supabase } from "./supabase";

export type Perfil = {
  nombre: string;
  rolCodigo: string;
  rolNombre: string;
  jerarquia: number;
};

const ROL_NOMBRE: Record<string, string> = {
  DUENO: "Dueño",
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
  PERSONAL: "Personal",
};

/**
 * Carga el perfil del usuario logueado (nombre) y su rol más alto en el tenant,
 * leído bajo la sesión (RLS: usuarios_perfil_propio + acceso_propio).
 */
export async function cargarPerfil(): Promise<Perfil | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return null;

  const [{ data: perfil }, { data: accesos }] = await Promise.all([
    supabase.from("usuarios_perfil").select("nombre").eq("id", uid).maybeSingle(),
    supabase
      .from("usuarios_acceso")
      .select("rol:roles(codigo, jerarquia)")
      .eq("usuario_id", uid)
      .eq("activo", true),
  ]);

  type Acc = { rol: { codigo: string; jerarquia: number } | null };
  const roles = ((accesos ?? []) as unknown as Acc[])
    .map((a) => a.rol)
    .filter((r): r is { codigo: string; jerarquia: number } => !!r)
    .sort((a, b) => b.jerarquia - a.jerarquia);
  const rol = roles[0];

  return {
    nombre: perfil?.nombre ?? "Usuario",
    rolCodigo: rol?.codigo ?? "PERSONAL",
    rolNombre: rol ? ROL_NOMBRE[rol.codigo] ?? rol.codigo : "—",
    jerarquia: rol?.jerarquia ?? 0,
  };
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
