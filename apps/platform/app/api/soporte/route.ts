import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";
import { leerSoporte, type Soporte } from "../../lib/soporte";

// Canal de soporte de VIM (0142): el WhatsApp que ven todos los clientes en el admin y en la caja.
// Se lee y se escribe con service_role; cada cambio va a la bitácora con antes y después. Un número
// cambiado manda las dudas de todos los clientes a otro teléfono.

// Escritas a mano (no con join) para que scripts/auditar-consultas.mjs las pueda probar.
const COLUMNAS = "whatsapp, horario, correo";

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.sb.from("plataforma_soporte").select("whatsapp, horario, correo, updated_at").eq("id", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ datos: data ?? null });
}

/** PUT = el registro completo (whatsapp, horario, correo; null para vaciar los dos últimos) + `motivo`. */
export async function PUT(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 });
  const r = leerSoporte(body);
  if (!r.ok) return NextResponse.json({ error: "DATO_INVALIDO", campo: r.campo, detalle: r.detalle }, { status: 400 });

  const { data: antes } = await sb.from("plataforma_soporte").select(COLUMNAS).eq("id", true).maybeSingle();
  const { error } = await sb
    .from("plataforma_soporte")
    .upsert({ id: true, ...r.datos, updated_at: new Date().toISOString(), updated_by: auth.actor.id }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditar(sb, { accion: "plataforma.soporte", tenantId: null, motivo, payload: { antes: (antes as Soporte | null) ?? null, despues: r.datos } });
  return NextResponse.json({ ok: true, datos: r.datos });
}
