import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";
import { CAMPOS_DATOS_PAGO, leerDatosPago, type DatosPago } from "../../lib/datos-pago";

// Datos para pagarle a VIM (0141): banco, CLABE, WhatsApp… Los ve el dueño en "Plan y pagos" por la
// RPC `datos_pago_plataforma()`; aquí se leen y se escriben con service_role, y cada cambio va a la
// bitácora con antes y después — una CLABE cambiada es justo lo que alguien querría falsificar.

const COLUMNAS = CAMPOS_DATOS_PAGO.join(", ");

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.sb.from("plataforma_datos_pago").select(`${COLUMNAS}, updated_at`).eq("id", true).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ datos: data ?? null });
}

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
  const r = leerDatosPago(body);
  if (!r.ok) return NextResponse.json({ error: "DATO_INVALIDO", campo: r.campo, detalle: r.detalle }, { status: 400 });

  const { data: antes } = await sb.from("plataforma_datos_pago").select(COLUMNAS).eq("id", true).maybeSingle();
  const { error } = await sb
    .from("plataforma_datos_pago")
    .upsert({ id: true, ...r.datos, updated_at: new Date().toISOString(), updated_by: auth.actor.id }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditar(sb, { accion: "plataforma.datos_pago", tenantId: null, motivo, payload: { antes: (antes as DatosPago | null) ?? null, despues: r.datos } });
  return NextResponse.json({ ok: true, datos: r.datos });
}
