import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";
import { esUuid } from "../../../lib/whatsapp";

// Lo que el agente de WhatsApp aprendió (wa_lecciones, 0287). service_role: la tabla niega a todos por RLS.
const LIMITE = 200;

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.sb
    .from("wa_lecciones")
    .select("id, tipo, comercial, pregunta, texto, evidencia, estado, creado_en, decidido_en")
    .order("creado_en", { ascending: false })
    .limit(LIMITE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lecciones: data ?? [], limite: LIMITE });
}

/** `{accion:"quitar", id}`: retira una lección aprobada; el agente deja de usarla. */
export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const body = (await req.json().catch(() => null)) as { accion?: unknown; id?: unknown } | null;
  if (body?.accion !== "quitar" || typeof body.id !== "string") {
    return NextResponse.json({ error: "BAD_REQUEST", detalle: "Manda accion «quitar» y el id de la lección." }, { status: 400 });
  }
  const id = body.id;
  if (!esUuid(id)) return NextResponse.json({ error: "NO_EXISTE", detalle: "Esa lección ya no existe." }, { status: 404 });

  // Solo las aprobadas: si ya no lo está (retirada, caducada…) el update no toca nada.
  const { data, error } = await sb.from("wa_lecciones").update({ estado: "RETIRADA" }).eq("id", id).eq("estado", "APROBADA").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "NO_APROBADA", detalle: "Esa lección ya no está aprobada." }, { status: 409 });

  await auditar(sb, {
    accion: "wa.leccion_quitar",
    tenantId: null,
    motivo: "Lección aprendida por el agente de WhatsApp, retirada",
    payload: { leccion_id: id },
  });
  return NextResponse.json({ ok: true });
}
