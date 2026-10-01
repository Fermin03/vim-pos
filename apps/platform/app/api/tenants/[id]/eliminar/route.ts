import { NextResponse } from "next/server";
import { actorDe, autorizar, ipDeCliente } from "../../../../lib/server";
import { nombreCoincide } from "../../../../lib/confirmacion";
import { CuerpoEliminar, leerRechazo, PALABRA_ELIMINAR, ResultadoEliminar, VistaPrevia } from "../../../../lib/eliminar";
import { limpiarArchivosEliminado } from "../../../../lib/eliminar-archivos";

// Eliminar un cliente por completo (0144, ADR 0023). Ruta propia y no una `accion` más del PATCH
// de la ficha: es lo único del panel que no se puede deshacer, y no debe poder dispararse por
// equivocarse de `accion` en un cuerpo.
//
//   GET  → vista previa: qué se va a borrar y, si no se puede, por qué. No escribe nada.
//   POST → elimina. Pide motivo, el nombre del negocio y la palabra ELIMINAR, y la cuenta
//          individual del operador (con segundo factor): la clave compartida no elimina.
//
// Las reglas (solo CANCELADO, nunca con CFDI timbrados, espera tras la baja) las impone la base,
// dentro de la misma transacción que borra: aquí solo se traduce su respuesta.

// La función de la base se corta sola a los 50 s (su `statement_timeout`) y revierte todo. Este
// límite va por encima para que la ruta alcance a contestar "no se borró nada" en vez de que la
// plataforma la mate a media respuesta y el operador no sepa qué pasó.
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const { data, error } = await auth.sb.rpc("eliminar_tenant_vista_previa", { p_tenant_id: id });
  if (error) {
    const r = leerRechazo(error);
    if (!r.crudo) return NextResponse.json({ error: r.codigo, detalle: r.detalle }, { status: r.status });
    // El texto de Postgres se queda en el servidor.
    console.error(`[eliminar] vista previa de ${id} (${error.code ?? "sin código"}): ${error.message}`);
    return NextResponse.json(
      { error: "ERROR_EN_VISTA_PREVIA", detalle: "No se pudo calcular qué se borraría. Quedó registrado para revisarlo." },
      { status: 500 },
    );
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

  // La clave compartida es de todos y de nadie: no tiene segundo factor ni persona detrás. Sirve
  // para arrancar el panel, no para lo único que no se puede deshacer.
  if (auth.actor.via !== "cuenta") {
    return NextResponse.json(
      { error: "REQUIERE_CUENTA", detalle: "Eliminar un cliente requiere entrar con tu cuenta de operador." },
      { status: 403 },
    );
  }

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
  if (tErr) {
    console.error(`[eliminar] no se pudo leer el cliente ${id}: ${tErr.message}`);
    return NextResponse.json({ error: "ERROR_AL_ELIMINAR", detalle: "No se borró nada: no se pudo leer al cliente." }, { status: 500 });
  }
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
    const r = leerRechazo(error);
    // Lo que no se le enseña al operador se queda aquí, entero.
    if (r.crudo) console.error(`[eliminar] no se pudo eliminar ${id} (${error.code ?? "sin código"}): ${error.message}`);
    return NextResponse.json({ error: r.codigo, detalle: r.detalle }, { status: r.status });
  }

  // A partir de aquí el cliente YA no existe: nada de lo que sigue puede contestar con error.
  //
  // Los archivos se borran por la API de Storage, y solo después de que la base confirmó: borrar
  // filas de storage.objects dejaría los archivos en el disco. La lista quedó guardada en
  // tenants_eliminados dentro de la transacción; si esto falla (o el servidor muere aquí), lo que
  // falte se reintenta desde "Clientes eliminados".
  const archivos = (await limpiarArchivosEliminado(sb, id)) ?? { borrados: 0, pendientes: 0 };

  const res = ResultadoEliminar.safeParse(data);
  if (!res.success) console.error(`[eliminar] ${id} eliminado, pero la respuesta de la base no tiene la forma esperada`);

  return NextResponse.json({
    ok: true,
    resumen: res.success ? res.data.resumen : null,
    cuentas_conservadas: res.success ? res.data.cuentas_conservadas : [],
    archivos,
  });
}
