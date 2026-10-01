import { NextResponse } from "next/server";
import { actorDe, auditar, autorizar, ipDeCliente } from "../../../../lib/server";
import { nombreCoincide } from "../../../../lib/confirmacion";
import { agruparPorBucket, CuerpoEliminar, leerRechazo, PALABRA_ELIMINAR, ResultadoEliminar, VistaPrevia } from "../../../../lib/eliminar";

// Eliminar un cliente por completo (0144, ADR 0023). Ruta propia y no una `accion` más del PATCH
// de la ficha: es lo único del panel que no se puede deshacer, y no debe poder dispararse por
// equivocarse de `accion` en un cuerpo.
//
//   GET  → vista previa: qué se va a borrar y, si no se puede, por qué. No escribe nada.
//   POST → elimina. Pide motivo, el nombre del negocio y la palabra ELIMINAR.
//
// Las reglas (solo CANCELADO, nunca con CFDI timbrados) las impone la base, dentro de la misma
// transacción que borra: aquí solo se traduce su respuesta.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const { data, error } = await auth.sb.rpc("eliminar_tenant_vista_previa", { p_tenant_id: id });
  if (error) {
    const r = leerRechazo(error.message);
    return NextResponse.json({ error: r.codigo, detalle: r.detalle }, { status: r.status });
  }
  const previa = VistaPrevia.safeParse(data);
  if (!previa.success) return NextResponse.json({ error: "RESPUESTA_INESPERADA" }, { status: 500 });
  return NextResponse.json(previa.data);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const cuerpo = CuerpoEliminar.safeParse(crudo);
  if (!cuerpo.success) {
    const falta = cuerpo.error.issues[0]?.path[0];
    return falta === "motivo"
      ? NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 })
      : NextResponse.json({ error: "CUERPO_INVALIDO" }, { status: 400 });
  }
  if (cuerpo.data.confirmacion !== PALABRA_ELIMINAR) {
    return NextResponse.json({ error: "CONFIRMACION_INVALIDA", detalle: `Escribe ${PALABRA_ELIMINAR} para confirmar.` }, { status: 400 });
  }

  // El nombre se comprueba aquí contra la base, no contra lo que diga el navegador: es la prueba
  // de que quien confirma sabe a quién está borrando.
  const { data: tRaw, error: tErr } = await sb.from("tenants").select("nombre_comercial").eq("id", id).maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  const nombre = (tRaw as { nombre_comercial?: string } | null)?.nombre_comercial;
  if (!nombre) return NextResponse.json({ error: "TENANT_NO_EXISTE", detalle: "Ese cliente no existe (o ya se eliminó)." }, { status: 404 });
  if (!nombreCoincide(nombre, cuerpo.data.nombre)) {
    return NextResponse.json({ error: "NOMBRE_NO_COINCIDE", detalle: "El nombre escrito no es el de este cliente." }, { status: 400 });
  }

  // Todo o nada: filas, cuentas, archivo y bitácora van en una transacción de la base.
  const { data, error } = await sb.rpc("eliminar_tenant", {
    p_tenant_id: id,
    p_motivo: cuerpo.data.motivo,
    p_operador: actorDe(sb).id,
    p_confirmacion: cuerpo.data.confirmacion,
    p_ip: ipDeCliente(sb),
  });
  if (error) {
    const r = leerRechazo(error.message);
    if (r.status === 500) console.error(`[eliminar] no se pudo eliminar ${id}: ${error.message}`);
    return NextResponse.json({ error: r.codigo, detalle: r.detalle }, { status: r.status });
  }
  const res = ResultadoEliminar.safeParse(data);
  if (!res.success) {
    // El negocio YA se eliminó (la RPC no dio error); solo no entendemos su respuesta.
    console.error(`[eliminar] ${id} eliminado, pero la respuesta de la base no tiene la forma esperada`);
    return NextResponse.json({ ok: true, resumen: null, cuentas_conservadas: [], archivos: { borrados: 0, fallos: [] } });
  }

  // Los archivos se borran por la API de Storage, y solo después de que la base confirmó: borrar
  // filas de storage.objects dejaría los archivos en el disco. Si esto falla el negocio ya no
  // existe, así que no se revierte nada: se dice cuáles quedaron y se asienta para limpiarlos.
  let borrados = 0;
  const fallos: string[] = [];
  for (const [bucket, nombres] of agruparPorBucket(res.data.archivos)) {
    const { error: e } = await sb.storage.from(bucket).remove(nombres);
    if (e) fallos.push(...nombres.map((n) => `${bucket}/${n}: ${e.message}`));
    else borrados += nombres.length;
  }
  if (res.data.archivos.length > 0) {
    await auditar(sb, {
      accion: "tenant.eliminar_archivos",
      motivo: fallos.length > 0 ? "Quedaron archivos sin borrar tras eliminar al cliente" : "Archivos borrados tras eliminar al cliente",
      payload: { tenant_eliminado: res.data.tenant, borrados, fallos },
    });
  }

  return NextResponse.json({
    ok: true,
    resumen: res.data.resumen,
    cuentas_conservadas: res.data.cuentas_conservadas,
    archivos: { borrados, fallos },
  });
}
