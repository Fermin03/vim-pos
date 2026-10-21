"use client";
import { supabase } from "./supabase";
import { tenantId } from "./datos";

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

// Desde la migración 0132 la base decide quién toca qué: DUEÑO/ADMIN del negocio, nunca el rol
// Dueño, el rol Administrador solo lo ajusta un Dueño y nadie edita sus propios permisos
// personalizados. Un INSERT rechazado llega como 42501 ("row-level security"), pero un DELETE
// rechazado NO da error: el RLS simplemente no ve la fila y borra cero. Por eso los borrados piden
// las filas de vuelta y cuentan, en vez de dar por hecho que se borraron.
export const MSG_SIN_PERMISO_ROL =
  "No tienes permiso para cambiar este rol. El rol Administrador solo lo ajusta el dueño.";
export const MSG_SIN_PERMISO_USUARIO =
  "No tienes permiso para cambiar los permisos de este usuario (los tuyos o los del dueño los cambia el dueño).";

type ErrorPg = { code?: string; message: string };

export function esRechazoDePermisos(error: ErrorPg): boolean {
  return error.code === "42501" || /row-level security|permission denied/i.test(error.message);
}

/** D71 — quita un permiso a un rol del sistema en ESTE tenant (solo restrictivo). */
export async function quitarPermiso(rolId: string, permisoId: string): Promise<void> {
  const tid = await tenantId();
  const { error } = await supabase.from("rol_permiso_overrides").insert({ tenant_id: tid, rol_id: rolId, permiso_id: permisoId });
  if (error && esRechazoDePermisos(error)) throw new Error(MSG_SIN_PERMISO_ROL);
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

/** Restaura el permiso del sistema (borra el override). */
export async function restaurarPermiso(rolId: string, permisoId: string): Promise<void> {
  const { data, error } = await supabase
    .from("rol_permiso_overrides")
    .delete()
    .eq("rol_id", rolId)
    .eq("permiso_id", permisoId)
    .select("id");
  if (error) throw new Error(esRechazoDePermisos(error) ? MSG_SIN_PERMISO_ROL : error.message);
  // La pantalla solo ofrece "restaurar" cuando el override existe: cero filas = el RLS lo impidió.
  if ((data ?? []).length === 0) throw new Error(MSG_SIN_PERMISO_ROL);
}

// ── D72: permisos del rol PERSONALIZADO por usuario ──────────────────────────

export type UsuarioPersonalizado = { usuarioId: string; nombre: string };

/** Usuarios del tenant con rol PERSONALIZADO. */
export async function usuariosPersonalizados(): Promise<UsuarioPersonalizado[]> {
  // El nombre se lee en DOS consultas, no con un embed.
  //
  // `usuarios_acceso.usuario_id` y `usuarios_perfil.id` apuntan los dos a `auth.users`, pero NO hay
  // una clave foránea entre ellas, así que PostgREST no puede recorrer ese camino: el embed
  // `perfil:usuarios_perfil(nombre)` respondía PGRST200 y esta pantalla no cargaba nunca.
  const { data, error } = await supabase
    .from("usuarios_acceso")
    .select("usuario_id, rol:roles(codigo)")
    .eq("activo", true);
  if (error) throw new Error(error.message);

  const accesos = ((data ?? []) as unknown as { usuario_id: string; rol: { codigo: string } | null }[])
    .filter((r) => r.rol?.codigo === "PERSONALIZADO");
  if (accesos.length === 0) return [];

  const { data: perfiles } = await supabase
    .from("usuarios_perfil")
    .select("id, nombre")
    .in("id", accesos.map((a) => a.usuario_id));
  const nombres = new Map(((perfiles ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre]));

  return accesos.map((r) => ({ usuarioId: r.usuario_id, nombre: nombres.get(r.usuario_id) ?? "(sin nombre)" }));
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
    const { data, error } = await supabase
      .from("permisos_personalizados")
      .delete()
      .eq("usuario_id", usuarioId)
      .in("permiso_id", quitar)
      .select("id");
    if (error) throw new Error(esRechazoDePermisos(error) ? MSG_SIN_PERMISO_USUARIO : error.message);
    if ((data ?? []).length < quitar.length) throw new Error(MSG_SIN_PERMISO_USUARIO);
  }
  if (poner.length > 0) {
    const { error } = await supabase.from("permisos_personalizados").insert(
      poner.map((p) => ({ tenant_id: tid, usuario_id: usuarioId, permiso_id: p })),
    );
    if (error) throw new Error(esRechazoDePermisos(error) ? MSG_SIN_PERMISO_USUARIO : error.message);
  }
}
