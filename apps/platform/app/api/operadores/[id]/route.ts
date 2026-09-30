import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";
import { enlaceAcceso, motivoValido } from "../../../lib/operadores";

/**
 * Acciones sobre un operador del panel (A8):
 *  · desactivar  — deja de entrar en su siguiente petición (se revisa en cada una, no al expirar
 *                  el token).
 *  · reactivar   — vuelve a entrar con su misma contraseña y su mismo segundo factor.
 *  · restablecer — perdió el teléfono o la contraseña: se le borran los factores y se genera un
 *                  enlace para elegir contraseña y dar de alta el autenticador otra vez.
 *
 * También con la clave compartida: solo sirve mientras nadie ha activado su cuenta, y es
 * justo entonces cuando hace falta volver a generar un enlace que venció sin usarse (invitar otra
 * vez chocaría con el correo, que ya quedó registrado). Lo que nadie hace es aplicárselo a sí
 * mismo: desactivarse o restablecerse es la forma más corta de dejar a VIM fuera de su panel.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { sb, actor } = auth;
  const { id } = await ctx.params;

  if (id === actor.id) return NextResponse.json({ error: "NO_A_TI_MISMO", detalle: "Esto lo tiene que hacer otro operador." }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_JSON" }, { status: 400 }); }
  const accion = String(body.accion ?? "");
  const motivo = motivoValido(body.motivo);
  if (!motivo) return NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 });

  const { data: op } = await sb.from("plataforma_operadores").select("usuario_id, nombre, activo").eq("usuario_id", id).maybeSingle();
  const fila = op as { usuario_id: string; nombre: string; activo: boolean } | null;
  if (!fila) return NextResponse.json({ error: "NO_EXISTE" }, { status: 404 });

  if (accion === "desactivar" || accion === "reactivar") {
    const activo = accion === "reactivar";
    const { error } = await sb.from("plataforma_operadores")
      .update({ activo, desactivado_at: activo ? null : new Date().toISOString() })
      .eq("usuario_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditar(sb, { accion: `plataforma.operador_${accion}`, motivo, payload: { operador: id, nombre: fila.nombre } });
    return NextResponse.json({ ok: true });
  }

  if (accion === "restablecer") {
    const { data: u } = await sb.auth.admin.getUserById(id);
    const email = u?.user?.email;
    if (!email) return NextResponse.json({ error: "SIN_CORREO" }, { status: 500 });

    // Sin factores y sin activar: el enlace lo lleva a elegir contraseña y a dar de alta el
    // autenticador de nuevo. Si era el único operador activado, la clave compartida vuelve a servir
    // mientras tanto — a propósito: es la salida si nadie más puede entrar.
    const { data: fs } = await sb.auth.admin.mfa.listFactors({ userId: id });
    for (const f of fs?.factors ?? []) await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    await sb.from("plataforma_operadores").update({ activado_at: null }).eq("usuario_id", id);

    const { data: link, error } = await sb.auth.admin.generateLink({ type: "recovery", email });
    if (error || !link?.properties?.hashed_token) return NextResponse.json({ error: "NO_SE_PUDO", detalle: error?.message }, { status: 500 });
    await auditar(sb, { accion: "plataforma.operador_restablecer", motivo, payload: { operador: id, nombre: fila.nombre } });
    return NextResponse.json({ ok: true, enlace: enlaceAcceso(new URL(req.url).origin, link.properties.hashed_token, "recovery") });
  }

  return NextResponse.json({ error: "ACCION_INVALIDA" }, { status: 400 });
}
