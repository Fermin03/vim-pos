import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../lib/server";
import { enlaceProspecto, leerCambioProspecto, prefijoNuevoCliente, type Prospecto } from "../../../lib/prospectos";

// Un prospecto: leerlo (para pre-llenar "Nuevo cliente"), moverlo de estado y borrarlo.
// Todo con service_role y todo lo que escribe queda en la bitácora.
//
// QUÉ VA A LA BITÁCORA Y QUÉ NO. El negocio y el estado, sí: sin ellos el asiento no dice nada. El
// nombre de la persona y su WhatsApp, no: la bitácora no se borra nunca y el aviso de privacidad
// promete no guardar el contacto de un prospecto más de lo necesario (`borrar_prospectos_viejos`).

const COLUMNAS = "id, nombre, whatsapp, negocio, cajas, sucursales, giro, usa_hoy, mensaje, origen, utm_source, utm_campaign, estado, notas, atendido_en, estado_cambiado_en, creado_en";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const { data, error } = await auth.sb.from("prospectos").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const p = data as unknown as Prospecto | null;
  if (!p) return NextResponse.json({ error: "NO_EXISTE", detalle: "Ese prospecto ya no existe." }, { status: 404 });
  return NextResponse.json({ prospecto: { ...p, enlace: enlaceProspecto(p) }, prefijo: prefijoNuevoCliente(p) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const r = leerCambioProspecto(body);
  if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: 400 });

  const { data: antesRaw, error: e1 } = await sb.from("prospectos").select("id, negocio, estado, notas").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const antes = antesRaw as { id: string; negocio: string; estado: string; notas: string | null } | null;
  if (!antes) return NextResponse.json({ error: "NO_EXISTE", detalle: "Ese prospecto ya no existe." }, { status: 404 });

  // Solo lo que de verdad cambia: guardar dos veces lo mismo no debe llenar la bitácora.
  const patch: { estado?: string; notas?: string | null } = {};
  if (r.cambio.estado !== undefined && r.cambio.estado !== antes.estado) patch.estado = r.cambio.estado;
  if (r.cambio.notas !== undefined && r.cambio.notas !== (antes.notas ?? null)) patch.notas = r.cambio.notas;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, sinCambios: true });

  // Las fechas (`estado_cambiado_en`, `atendido_en`) las sella el trigger de 0145, no esta ruta.
  const { error } = await sb.from("prospectos").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditar(sb, {
    accion: "prospecto.seguimiento",
    tenantId: null,
    motivo: patch.estado ? `Prospecto ${antes.negocio}: ${antes.estado} → ${patch.estado}` : `Prospecto ${antes.negocio}: nota de seguimiento`,
    payload: {
      prospecto_id: id, negocio: antes.negocio,
      estado_antes: antes.estado, estado_despues: patch.estado ?? antes.estado,
      nota_cambiada: "notas" in patch,
    },
  });
  return NextResponse.json({ ok: true });
}

/**
 * Borrar un prospecto: entradas de prueba del formulario, duplicados, bots. Es un borrado de
 * verdad (la tabla no tiene `deleted_at`: guardar el contacto de alguien "borrado" sería lo
 * contrario de lo que promete el aviso de privacidad), así que pide motivo y deja rastro.
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 10) return NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 });

  const { data: antesRaw, error: e1 } = await sb.from("prospectos").select("id, negocio, estado, origen, creado_en").eq("id", id).maybeSingle();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const antes = antesRaw as { id: string; negocio: string; estado: string; origen: string; creado_en: string } | null;
  if (!antes) return NextResponse.json({ error: "NO_EXISTE", detalle: "Ese prospecto ya no existe." }, { status: 404 });

  // LA BITÁCORA VA ANTES. Es un borrado de verdad: si se borrara primero y el asiento fallara,
  // quedaría un prospecto desaparecido sin rastro de quién ni por qué. Al revés, lo peor que puede
  // pasar es un asiento de un borrado que no ocurrió, y ese caso se anota justo abajo.
  const payload = { prospecto_id: id, negocio: antes.negocio, estado: antes.estado, origen: antes.origen, creado_en: antes.creado_en };
  const asentado = await auditar(sb, { accion: "prospecto.eliminar", tenantId: null, motivo, payload });
  if (asentado === false) {
    return NextResponse.json(
      { error: "BITACORA_NO_DISPONIBLE", detalle: "No se pudo dejar constancia en la bitácora, así que no se borró. Intenta de nuevo en un momento." },
      { status: 500 },
    );
  }

  const { error } = await sb.from("prospectos").delete().eq("id", id);
  if (error) {
    await auditar(sb, { accion: "prospecto.eliminar_fallido", tenantId: null, motivo: `No se borró: ${error.message}`, payload });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
