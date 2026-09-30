import { NextResponse } from "next/server";
import { autorizar, auditar, SYSTEM_ADMIN_ID } from "../../lib/server";
import { enlaceAcceso, estadoOperador, validarInvitacion } from "../../lib/operadores";

/**
 * Operadores del panel (A8): quién de VIM puede entrar.
 *
 * Dar de alta NO manda correo: devuelve un enlace de un solo uso (vence en una hora) que quien
 * invita le pasa a la persona por el canal que quiera. Así no dependemos de que el correo de
 * Supabase salga, ni de dar de alta platform.vimpos.com.mx entre las URLs de redirección de Auth:
 * el enlace apunta a una página del propio panel, que canjea el token directamente.
 */

type Sb = Extract<Awaited<ReturnType<typeof autorizar>>, { sb: unknown }>["sb"];

/** El id de la cuenta con ese correo, o null. Auth no busca por correo: se recorren las páginas. */
async function buscarPorCorreo(sb: Sb, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

type Fila = { usuario_id: string; nombre: string; activo: boolean; activado_at: string | null; invitado_por: string; created_at: string; desactivado_at: string | null };

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { sb } = auth;

  const { data, error } = await sb
    .from("plataforma_operadores")
    .select("usuario_id, nombre, activo, activado_at, invitado_por, created_at, desactivado_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as Fila[];

  // El correo vive en auth.users; son pocas cuentas, se piden una por una.
  const correos = new Map<string, string>();
  await Promise.all(filas.map(async (f) => {
    const { data: u } = await sb.auth.admin.getUserById(f.usuario_id);
    if (u?.user?.email) correos.set(f.usuario_id, u.user.email);
  }));
  const nombres = new Map(filas.map((f) => [f.usuario_id, f.nombre]));

  return NextResponse.json({
    yo: auth.actor,
    operadores: filas.map((f) => ({
      id: f.usuario_id,
      nombre: f.nombre,
      email: correos.get(f.usuario_id) ?? null,
      estado: estadoOperador(f),
      activadoEl: f.activado_at,
      invitadoPor: f.invitado_por === SYSTEM_ADMIN_ID ? "Clave compartida" : (nombres.get(f.invitado_por) ?? "—"),
      creadoEl: f.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { sb, actor } = auth;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const v = validarInvitacion(body.nombre, body.email);
  if (!v.ok) return NextResponse.json({ error: "DATOS_INVALIDOS", detalle: v.detalle }, { status: 400 });

  // Una cuenta nueva y exclusiva para el panel. Reusar la de un dueño de negocio mezclaría dos
  // accesos en una sola contraseña, y cambiarla aquí se la cambiaría allá sin avisar. Se busca
  // ANTES de invitar: a un correo invitado que no ha confirmado, Auth le vuelve a emitir la
  // invitación en vez de fallar, y el choque aparecía después, como un error de llave duplicada.
  const existente = await buscarPorCorreo(sb, v.email);
  if (existente) {
    const { data: yaOp } = await sb.from("plataforma_operadores").select("usuario_id").eq("usuario_id", existente).maybeSingle();
    return NextResponse.json(yaOp
      ? { error: "YA_ES_OPERADOR", detalle: "Esa persona ya es operador. Si perdió el enlace o el teléfono, usa «Restablecer acceso»." }
      : { error: "CORREO_EN_USO", detalle: "Ese correo ya tiene cuenta en VIM. Usa uno exclusivo para el panel (por ejemplo nombre+panel@…)." },
    { status: 409 });
  }

  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: "invite", email: v.email });
  if (linkErr || !link?.properties?.hashed_token || !link.user) {
    return NextResponse.json({ error: "NO_SE_PUDO_INVITAR", detalle: linkErr?.message ?? "sin respuesta de Auth" }, { status: 500 });
  }

  const { error: insErr } = await sb.from("plataforma_operadores").insert({
    usuario_id: link.user.id,
    nombre: v.nombre,
    invitado_por: actor.id,
  });
  if (insErr) return NextResponse.json({ error: "NO_SE_PUDO_INVITAR", detalle: insErr.message }, { status: 500 });

  await auditar(sb, {
    accion: "plataforma.operador_invitar",
    motivo: `Alta de ${v.nombre} como operador del panel`,
    payload: { operador: link.user.id, email: v.email },
  });

  return NextResponse.json({
    ok: true,
    enlace: enlaceAcceso(new URL(req.url).origin, link.properties.hashed_token, "invite"),
  });
}
