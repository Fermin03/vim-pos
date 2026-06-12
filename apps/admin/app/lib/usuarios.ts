"use client";
import { z } from "zod";
import { supabase } from "./supabase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const ROL_LABEL: Record<string, string> = {
  DUENO: "Dueño",
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
  PERSONAL: "Personal",
  PERSONALIZADO: "Personalizado",
};

export const ROLES_ASIGNABLES = ["ADMIN", "SUPERVISOR", "CAJERO", "PERSONAL", "PERSONALIZADO"] as const;

export type EstadoUsuario = "ACTIVO" | "BLOQUEADO_TEMP" | "BLOQUEADO_ADMIN" | "DESACTIVADO";

export type Usuario = {
  id: string;
  nombre: string;
  estado: EstadoUsuario;
  rolCodigo: string;
  rolNombre: string;
  activo: boolean;
  fechaUltimoLoginPin: string | null;
};

type FilaAcc = {
  usuario_id: string;
  activo: boolean;
  perfil: { nombre: string; estado: EstadoUsuario; fecha_ultimo_login_pin: string | null } | null;
  rol: { codigo: string } | null;
};

/** Lista todos los empleados del tenant (RLS lo aísla). Excluye cuentas DISPOSITIVO. */
export async function listarUsuarios(): Promise<Usuario[]> {
  // Primero accesos del tenant con rol
  const { data: accesos, error: e1 } = await supabase
    .from("usuarios_acceso")
    .select("usuario_id, activo, rol:roles(codigo)");
  if (e1) throw new Error(e1.message);

  type Acc = { usuario_id: string; activo: boolean; rol: { codigo: string } | null };
  const filtrados = ((accesos ?? []) as unknown as Acc[]).filter(
    (a) => a.rol?.codigo && a.rol.codigo !== "DISPOSITIVO",
  );
  if (filtrados.length === 0) return [];

  const ids = Array.from(new Set(filtrados.map((a) => a.usuario_id)));

  const { data: perfiles, error: e2 } = await supabase
    .from("usuarios_perfil")
    .select("id, nombre, estado, fecha_ultimo_login_pin")
    .in("id", ids);
  if (e2) throw new Error(e2.message);

  type Perfil = { id: string; nombre: string; estado: EstadoUsuario; fecha_ultimo_login_pin: string | null };
  const perfilPorId = new Map(((perfiles ?? []) as Perfil[]).map((p) => [p.id, p]));

  // Agrupamos por usuario, tomamos el rol más alto (jerarquía implícita por ROLES_LABEL_ORDER)
  const ROL_RANK: Record<string, number> = { DUENO: 5, ADMIN: 4, SUPERVISOR: 3, CAJERO: 2, PERSONAL: 1 };
  const porUsuario = new Map<string, Usuario>();
  for (const a of filtrados) {
    const perfil = perfilPorId.get(a.usuario_id);
    if (!perfil) continue;
    const prev = porUsuario.get(a.usuario_id);
    const rolCodigo = a.rol!.codigo;
    if (!prev || (ROL_RANK[rolCodigo] ?? 0) > (ROL_RANK[prev.rolCodigo] ?? 0)) {
      porUsuario.set(a.usuario_id, {
        id: a.usuario_id,
        nombre: perfil.nombre,
        estado: perfil.estado,
        rolCodigo,
        rolNombre: ROL_LABEL[rolCodigo] ?? rolCodigo,
        activo: a.activo,
        fechaUltimoLoginPin: perfil.fecha_ultimo_login_pin,
      });
    } else if (prev) {
      prev.activo = prev.activo || a.activo;
    }
  }
  return Array.from(porUsuario.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── Zod schemas ──────────────────────────────────────────────────────────────
export const nuevoUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  email: z.string().trim().email("Email inválido"),
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener 4 a 6 dígitos"),
  rol_codigo: z.enum(["ADMIN", "SUPERVISOR", "CAJERO", "PERSONAL", "PERSONALIZADO"]),
});
export type NuevoUsuarioInput = z.infer<typeof nuevoUsuarioSchema>;

export const resetPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener 4 a 6 dígitos"),
  confirmar: z.string(),
}).refine((d) => d.pin === d.confirmar, { message: "Los PIN no coinciden", path: ["confirmar"] });
export type ResetPinInput = z.infer<typeof resetPinSchema>;

// ── Mutaciones (Edge Functions + client-side) ────────────────────────────────
async function callEdge(endpoint: string, body: object): Promise<unknown> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token ?? ANON;
  const res = await fetch(`${URL}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data;
}

export async function crearEmpleado(input: NuevoUsuarioInput): Promise<void> {
  const datos = nuevoUsuarioSchema.parse(input);
  await callEdge("crear-empleado", datos);
}

export async function resetearPin(usuario_id: string, pin_nuevo: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin_nuevo)) throw new Error("PIN inválido");
  await callEdge("resetear-pin", { usuario_id, pin_nuevo });
}

/** Activa/desactiva accesos del usuario en el tenant. RLS lo restringe al tenant del admin. */
export async function setActivo(usuario_id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from("usuarios_acceso").update({ activo }).eq("usuario_id", usuario_id);
  if (error) throw new Error(error.message);
  // Reflejar en perfil
  const { error: e2 } = await supabase
    .from("usuarios_perfil")
    .update({ estado: activo ? "ACTIVO" : "DESACTIVADO" })
    .eq("id", usuario_id);
  if (e2) throw new Error(e2.message);
}

/** Cambia el rol del usuario (UPDATE en usuarios_acceso). RLS por tenant del admin. */
export async function cambiarRol(usuario_id: string, rolCodigoNuevo: string): Promise<void> {
  const { data: rol, error: e0 } = await supabase
    .from("roles")
    .select("id")
    .eq("codigo", rolCodigoNuevo)
    .eq("es_sistema", true)
    .maybeSingle();
  if (e0 || !rol) throw new Error("Rol no encontrado");
  const { error } = await supabase
    .from("usuarios_acceso")
    .update({ rol_id: (rol as { id: string }).id })
    .eq("usuario_id", usuario_id);
  if (error) throw new Error(error.message);
}

export function fechaCorta(s: string | null): string {
  if (!s) return "Nunca";
  const d = new Date(s);
  const ahora = new Date();
  const dif = (ahora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (dif < 1) return "Hoy";
  if (dif < 2) return "Ayer";
  if (dif < 30) return `Hace ${Math.floor(dif)} días`;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}
