import { NextResponse } from "next/server";
import { enlaceWhatsapp } from "@vim/db/soporte";
import { autorizar, auditar } from "../../../lib/server";
import { esUuid } from "../../../lib/whatsapp";

type Ctx = { params: Promise<{ id: string }> };

const LIMITE = 200;
const NO_EXISTE = () => NextResponse.json({ error: "NO_EXISTE", detalle: "Esa conversación ya no existe." }, { status: 404 });
const COLUMNAS_INTENTO = "id, estado, periodos, total, factura, preferencia_url, pagado_en, creado_en";
const COLUMNAS = "id, wa_id, nombre_perfil, estado, pausado_hasta, resumen, ultimo_mensaje_en, creado_en, prospecto:prospectos(id, negocio)";

/** Una conversación con sus últimos 200 mensajes (del más viejo al más nuevo) y sus intentos de pago (el más reciente primero). */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!esUuid(id)) return NO_EXISTE();

  const [conv, msgs, intentos] = await Promise.all([
    auth.sb.from("wa_conversaciones").select(COLUMNAS).eq("id", id).maybeSingle(),
    auth.sb.from("wa_mensajes").select("id, autor, texto, creado_en").eq("conversacion_id", id).order("creado_en", { ascending: false }).limit(LIMITE),
    auth.sb.from("wa_intentos_pago").select(COLUMNAS_INTENTO).eq("conversacion_id", id).order("creado_en", { ascending: false }),
  ]);
  const fallo = conv.error ?? msgs.error ?? intentos.error;
  if (fallo) return NextResponse.json({ error: fallo.message }, { status: 500 });
  const conversacion = conv.data as unknown as { wa_id: string } | null;
  if (!conversacion) return NO_EXISTE();

  return NextResponse.json({
    conversacion: { ...conversacion, enlace: enlaceWhatsapp(conversacion.wa_id, "") },
    mensajes: (msgs.data ?? []).reverse(),
    intentos: intentos.data ?? [],
  });
}

/** `{accion:"resolver"}`: usa el RPC `wa_resolver` (cierra y libera la pausa del agente). */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;
  if (!esUuid(id)) return NO_EXISTE();

  const body = (await req.json().catch(() => null)) as { accion?: unknown } | null;
  if (body?.accion !== "resolver") return NextResponse.json({ error: "BAD_REQUEST", detalle: "La acción es «resolver»." }, { status: 400 });

  const { data, error: e1 } = await sb.from("wa_conversaciones").select("id, estado").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const antes = data as { id: string; estado: string } | null;
  if (!antes) return NO_EXISTE();

  const { error } = await sb.rpc("wa_resolver", { p_conversacion_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sin el número del cliente: la bitácora no se borra nunca.
  await auditar(sb, {
    accion: "wa.resolver",
    tenantId: null,
    motivo: `Conversación de WhatsApp resuelta (antes: ${antes.estado})`,
    payload: { conversacion_id: id, estado_antes: antes.estado },
  });
  return NextResponse.json({ ok: true });
}
