import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";
import { ESTADOS_WA } from "../../lib/whatsapp";

// Bandeja del agente de WhatsApp (0286). service_role: las tablas wa_* niegan a todos por RLS.
const LIMITE = 200;

export async function GET(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const q = new URL(req.url).searchParams;

  const estado = q.get("estado");
  if (estado && !(ESTADOS_WA as readonly string[]).includes(estado)) {
    return NextResponse.json({ error: "ESTADO_INVALIDO", detalle: "Ese estado no existe." }, { status: 400 });
  }

  // Conteo por estado de TODAS las conversaciones, aparte de la lista: con el filtro puesto, los
  // contadores de los demás estados irían a cero. También lo lee la barra lateral (`solo=conteo`).
  const conteos = await Promise.all(
    ESTADOS_WA.map((e) => sb.from("wa_conversaciones").select("id", { count: "exact", head: true }).eq("estado", e)),
  );
  const fallo = conteos.find((c) => c.error)?.error;
  if (fallo) return NextResponse.json({ error: fallo.message }, { status: 500 });
  const conteo = Object.fromEntries(ESTADOS_WA.map((e, i) => [e, conteos[i]!.count ?? 0]));
  if (q.get("solo") === "conteo") return NextResponse.json({ conteo });

  let lista = sb
    .from("wa_conversaciones")
    .select("id, wa_id, nombre_perfil, estado, pausado_hasta, resumen, ultimo_mensaje_en, creado_en, prospecto:prospectos(id, negocio)")
    .order("ultimo_mensaje_en", { ascending: false, nullsFirst: false })
    .limit(LIMITE);
  if (estado) lista = lista.eq("estado", estado);
  const [{ data, error }, cfg] = await Promise.all([lista, sb.from("wa_config").select("fundador_abierta").eq("id", true).maybeSingle()]);
  if (error ?? cfg.error) return NextResponse.json({ error: (error ?? cfg.error)!.message }, { status: 500 });

  return NextResponse.json({
    conversaciones: data ?? [],
    conteo,
    fundador_abierta: (cfg.data as { fundador_abierta: boolean } | null)?.fundador_abierta ?? true,
    limite: LIMITE,
  });
}

/** `{accion:"fundador", abierta}`: enciende o apaga la oferta «Negocio fundador» en el agente. */
export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  const body = (await req.json().catch(() => null)) as { accion?: unknown; abierta?: unknown } | null;
  if (body?.accion !== "fundador" || typeof body.abierta !== "boolean") {
    return NextResponse.json({ error: "BAD_REQUEST", detalle: "Manda accion «fundador» y abierta true o false." }, { status: 400 });
  }

  const { error } = await sb.from("wa_config").update({ fundador_abierta: body.abierta }).eq("id", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditar(sb, {
    accion: "wa.fundador",
    tenantId: null,
    motivo: `Oferta «Negocio fundador» ${body.abierta ? "abierta" : "cerrada"} en el agente de WhatsApp`,
    payload: { abierta: body.abierta },
  });
  return NextResponse.json({ ok: true, fundador_abierta: body.abierta });
}
