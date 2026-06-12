"use client";
import { supabase, leerSesion } from "./supabase";

// Fase 5 · roles delegados (doc 09 §7). D71: override RESTRICTIVO por tenant (solo quitar
// permisos a roles del sistema). D72: rol PERSONALIZADO = permisos explícitos por usuario.

export type Permiso = { id: string; codigo: string; nombre: string; categoria: string };
export type RolSistema = { id: string; codigo: string; nombre: string; jerarquia: number };

export type MatrizPermisos = {
  roles: RolSistema[];
  permisos: Permiso[];
  /** rol_id → set de permiso_id concedidos por el SISTEMA. */
  base: Map<string, Set<string>>;
  /** rol_id → set de permiso_id QUITADOS por este tenant (D71). */
  quitados: Map<string, Set<string>>;
};

async function tenantId(): Promise<string> {
  const s = await leerSesion();
  if (!s?.tenantId) throw new Error("Sesión sin tenant");
  return s.tenantId;
}

export async function leerMatriz(): Promise<MatrizPermisos> {
  const [{ data: roles, error: e1 }, { data: permisos, error: e2 }, { data: rp, error: e3 }, { data: ov, error: e4 }] =
    await Promise.all([
      supabase.from("roles").select("id, codigo, nombre, jerarquia").eq("es_sistema", true).eq("activo", true)
        .not("codigo", "in", "(DISPOSITIVO,DUENO,PERSONALIZADO)").order("jerarquia", { ascending: false }),
      supabase.from("permisos").select("id, codigo, nombre, categoria").order("categoria").order("codigo"),
      supabase.from("rol_permisos").select("rol_id, permiso_id").eq("concedido", true),
      supabase.from("rol_permiso_overrides").select("rol_id, permiso_id"),
    ]);
  if (e1 || e2 || e3 || e4) throw new Error((e1 ?? e2 ?? e3 ?? e4)!.message);

  const base = new Map<string, Set<string>>();
  for (const r of (rp ?? []) as { rol_id: string; permiso_id: string }[]) {
    if (!base.has(r.rol_id)) base.set(r.rol_id, new Set());
    base.get(r.rol_id)!.add(r.permiso_id);
  }
  const quitados = new Map<string, Set<string>>();
  for (const o of (ov ?? []) as { rol_id: string; permiso_id: string }[]) {
    if (!quitados.has(o.rol_id)) quitados.set(o.rol_id, new Set());
    quitados.get(o.rol_id)!.add(o.permiso_id);
  }
  return {
    roles: (roles ?? []) as RolSistema[],
    permisos: (permisos ?? []) as Permiso[],
    base,
    quitados,
  };
}

/** D71 — quita un permiso a un rol del sistema en ESTE tenant (solo restrictivo). */
export async function quitarPermiso(rolId: string, permisoId: string): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("rol_permiso_overrides").insert({ tenant_id: tid, rol_id: rolId, permiso_id: permisoId });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

/** Restaura el permiso del sistema (borra el override). */
export async function restaurarPermiso(rolId: string, permisoId: string): Promise<void> {
  const { error } = await supabase.from("rol_permiso_overrides").delete().eq("rol_id", rolId).eq("permiso_id", permisoId);
  if (error) throw new Error(error.message);
}

// ── D72: permisos del rol PERSONALIZADO por usuario ──────────────────────────

export type UsuarioPersonalizado = { usuarioId: string; nombre: string };

/** Usuarios del tenant con rol PERSONALIZADO. */
export async function usuariosPersonalizados(): Promise<UsuarioPersonalizado[]> {
  const { data, error } = await supabase
    .from("usuarios_acceso")
    .select("usuario_id, rol:roles(codigo), perfil:usuarios_perfil(nombre)")
    .eq("activo", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { usuario_id: string; rol: { codigo: string } | null; perfil: { nombre: string } | null }[])
    .filter((r) => r.rol?.codigo === "PERSONALIZADO")
    .map((r) => ({ usuarioId: r.usuario_id, nombre: r.perfil?.nombre ?? "(sin nombre)" }));
}

export async function permisosDeUsuario(usuarioId: string): Promise<string[]> {
  const { data, error } = await supabase.from("permisos_personalizados").select("permiso_id").eq("usuario_id", usuarioId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String((r as { permiso_id: string }).permiso_id));
}

/** Sincroniza los permisos explícitos del usuario PERSONALIZADO. */
export async function asignarPermisosUsuario(usuarioId: string, permisoIds: string[]): Promise<void> {
  const tid = await tenantId();
  const actuales = await permisosDeUsuario(usuarioId);
  const quitar = actuales.filter((p) => !permisoIds.includes(p));
  const poner = permisoIds.filter((p) => !actuales.includes(p));
  if (quitar.length > 0) {
    const { error } = await supabase.from("permisos_personalizados").delete().eq("usuario_id", usuarioId).in("permiso_id", quitar);
    if (error) throw new Error(error.message);
  }
  if (poner.length > 0) {
    const { error } = await supabase.from("permisos_personalizados").insert(
      poner.map((p) => ({ tenant_id: tid, usuario_id: usuarioId, permiso_id: p })),
    );
    if (error) throw new Error(error.message);
  }
}
