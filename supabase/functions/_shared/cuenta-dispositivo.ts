// La cuenta de Auth de una caja (rol DISPOSITIVO) y el código corto para vincularla.
//
// La usan provisionar-dispositivo (el dueño genera credenciales o un código desde el panel) y
// canjear-codigo-caja (la caja canjea el código). En las dos, el resultado es el mismo: la cuenta
// de la caja existe, con una contraseña NUEVA que se devuelve una sola vez.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { registrarError } from "./errores.ts";
import { cajaIdDeEmail, correoDispositivo } from "./dispositivo.ts";

// Sin caracteres que se confundan al dictarlos o leerlos (0/O, 1/I/L).
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de 6 caracteres, p. ej. "K7M4QX". Se muestra como "K7M-4QX". */
export function generarCodigo(): string {
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => ALFABETO_CODIGO[n % ALFABETO_CODIGO.length]).join("");
}

/** Lo que tecleó la persona → el código como se guarda, o null si no puede serlo. */
export function normalizarCodigo(entrada: unknown): string | null {
  const c = String(entrada ?? "").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z2-9]{6}$/.test(c) ? c : null;
}

function generarPassword(): string {
  // Sin caracteres ambiguos (0/O/1/l/I) — por si alguien todavía la teclea a mano.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return "vim-" + Array.from(arr, (n) => chars[n % chars.length]).join("");
}

/** La cuenta de la caja entre las cuentas DISPOSITIVO del tenant (activas o no). "error" si falla. */
async function cuentaDeCajaPorAcceso(admin: SupabaseClient, tenantId: string, rolId: string, cajaId: string): Promise<string | null | "error"> {
  const { data, error } = await admin.from("usuarios_acceso").select("usuario_id")
    .eq("tenant_id", tenantId).eq("rol_id", rolId);
  if (error) { registrarError("cuenta-dispositivo", "ERROR_LISTAR_AUTH", error); return "error"; }
  const ids = [...new Set(((data ?? []) as { usuario_id: string }[]).map((a) => a.usuario_id))];
  for (const id of ids) {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (u?.user && cajaIdDeEmail(u.user.email) === cajaId.toLowerCase()) return id;
  }
  return null;
}

/** Último recurso: recorre Auth completo, por páginas, buscando la cuenta de la caja. */
async function cuentaDeCajaPaginando(admin: SupabaseClient, cajaId: string): Promise<string | null | "error"> {
  const POR_PAGINA = 1000;
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) { registrarError("cuenta-dispositivo", "ERROR_LISTAR_AUTH", error); return "error"; }
    const hallado = data.users.find((u) => cajaIdDeEmail(u.email) === cajaId.toLowerCase());
    if (hallado) return hallado.id;
    if (data.users.length < POR_PAGINA) return null;
  }
  return null;
}

export type CajaDeTenant = { id: string; tenantId: string; sucursalId: string; nombre: string };

/**
 * Crea la cuenta de la caja o, si ya existe, le pone una contraseña nueva (la anterior deja de
 * servir). Devuelve el correo y la contraseña, o el código de error para la respuesta.
 */
export async function asegurarCuentaDispositivo(
  admin: SupabaseClient, caja: CajaDeTenant, creadoPor: string,
): Promise<{ email: string; password: string } | { error: string; status: number }> {
  const { data: rol } = await admin.from("roles").select("id").eq("codigo", "DISPOSITIVO").eq("es_sistema", true).maybeSingle();
  if (!rol) return { error: "ROL_DISPOSITIVO_NO_ENCONTRADO", status: 500 };
  const rolId = (rol as { id: string }).id;

  // Email sintético derivado del caja_id
  const email = correoDispositivo(caja.id);
  const password = generarPassword();

  // Regenerar: la cuenta de esta caja ya existe, quizá con el dominio viejo (`vimpos.mx`, que no
  // es de VIM; ver `_shared/dispositivo.ts`). Se busca por el id de caja, no por el correo, y se
  // le pone la contraseña nueva y el correo bueno de una vez: la caja se vuelve a vincular con
  // estas credenciales de todos modos. Buscar solo por el correo nuevo crearía una segunda cuenta
  // para la misma caja.
  //
  // C2-8: antes se buscaba en `listUsers({ page: 1, perPage: 1000 })` — la PRIMERA página de TODO
  // Auth. Con más de mil usuarios en el proyecto, la cuenta de la caja podía no estar ahí y se
  // creaba una segunda (o fallaba el alta por correo duplicado). Ahora se busca entre las cuentas
  // DISPOSITIVO de este tenant (una por caja: pocas), y solo si el alta choca con una cuenta que no
  // tiene acceso (un alta anterior a medias) se recorre Auth paginando.
  let uid: string | null = null;
  let existente = await cuentaDeCajaPorAcceso(admin, caja.tenantId, rolId, caja.id);
  if (existente === "error") return { error: "ERROR_LISTAR_AUTH", status: 500 };
  if (!existente) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nombre: caja.nombre, tipo: "DISPOSITIVO" },
    });
    if (created?.user) {
      uid = created.user.id;
    } else if (/already|exists|registered|duplicate/i.test(createErr?.message ?? "")) {
      existente = await cuentaDeCajaPaginando(admin, caja.id);
      if (!existente || existente === "error") {
        registrarError("cuenta-dispositivo", "ERROR_CREAR_AUTH", createErr);
        return { error: "ERROR_CREAR_AUTH", status: 400 };
      }
    } else {
      registrarError("cuenta-dispositivo", "ERROR_CREAR_AUTH", createErr ?? "sin usuario");
      return { error: "ERROR_CREAR_AUTH", status: 400 };
    }
  }
  if (existente) {
    uid = existente;
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true, password });
    if (updErr) { registrarError("cuenta-dispositivo", "ERROR_ACTUALIZAR", updErr); return { error: "ERROR_ACTUALIZAR", status: 500 }; }
  }
  if (!uid) return { error: "ERROR_CREAR_AUTH", status: 400 };

  // Perfil del dispositivo (sin PIN) — upsert idempotente
  const { error: perfErr } = await admin.from("usuarios_perfil")
    .upsert({ id: uid, nombre: caja.nombre, estado: "ACTIVO" }, { onConflict: "id" });
  if (perfErr) { registrarError("cuenta-dispositivo", "DB_ERROR", perfErr); return { error: "DB_ERROR", status: 500 }; }

  // Acceso con rol DISPOSITIVO (si no existe ya)
  const { data: yaTiene } = await admin.from("usuarios_acceso").select("id").eq("usuario_id", uid).limit(1).maybeSingle();
  if (!yaTiene) {
    const { error: accInsErr } = await admin.from("usuarios_acceso").insert({
      usuario_id: uid, tenant_id: caja.tenantId, sucursal_id: caja.sucursalId, rol_id: rolId, created_by: creadoPor,
    });
    if (accInsErr) { registrarError("cuenta-dispositivo", "DB_ERROR", accInsErr); return { error: "DB_ERROR", status: 500 }; }
  }

  return { email, password };
}
