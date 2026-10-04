import { NextResponse } from "next/server";
import { autorizar, ipDeCliente } from "../../lib/server";
import { CuentaPorCorreo, CuerpoCorreo, leerRechazoCorreo } from "../../lib/liberar-correo";

// Liberar un correo (0154, ADR 0028): la cuenta de un ex empleado que ya está desactivado se
// elimina para que esa persona pueda registrarse con el mismo correo.
//
//   POST { accion: "buscar", email }                       → de quién es ese correo y si se puede.
//   POST { accion: "liberar", email, usuario_id, motivo }  → elimina la cuenta. No se deshace.
//
// Todo va por POST: un correo es un dato personal y no debe quedar en una URL (ni en el historial
// del navegador ni en los registros del servidor).
//
// Las reglas (desactivado antes, nunca un dueño, nunca una caja) las impone la base dentro de la
// misma transacción que escribe y que asienta la bitácora; aquí solo se traduce su respuesta.

export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  const cuerpo = CuerpoCorreo.safeParse(crudo);
  if (!cuerpo.success) {
    const falta = cuerpo.error.issues[0]?.path[0];
    return falta === "motivo"
      ? NextResponse.json({ error: "MOTIVO_REQUERIDO", detalle: "Escribe el motivo (10 caracteres o más)." }, { status: 400 })
      : falta === "email"
        ? NextResponse.json({ error: "EMAIL_INVALIDO", detalle: "Ese correo no tiene forma de correo." }, { status: 400 })
        : NextResponse.json({ error: "CUERPO_INVALIDO" }, { status: 400 });
  }

  // La clave compartida no tiene persona detrás: ni ve de quién es un correo ni elimina cuentas.
  if (auth.actor.via !== "cuenta") {
    return NextResponse.json(
      { error: "REQUIERE_CUENTA", detalle: "Liberar un correo requiere entrar con tu cuenta de operador." },
      { status: 403 },
    );
  }

  const { data: previa, error: ePrevia } = await sb.rpc("usuario_por_correo", { p_email: cuerpo.data.email, p_actor: auth.actor.id });
  if (ePrevia) {
    console.error(`[correos] no se pudo buscar la cuenta (${ePrevia.code ?? "sin código"}): ${ePrevia.message}`);
    return NextResponse.json({ error: "ERROR_AL_BUSCAR", detalle: "No se pudo buscar ese correo. Quedó registrado para revisarlo." }, { status: 500 });
  }
  const cuenta = CuentaPorCorreo.safeParse(previa);
  if (!cuenta.success) return NextResponse.json({ error: "RESPUESTA_INESPERADA" }, { status: 500 });

  if (cuerpo.data.accion === "buscar") return NextResponse.json(cuenta.data);

  // Liberar: la cuenta se vuelve a buscar aquí, no se confía en la que mandó el navegador. Si el
  // correo cambió de manos entre la búsqueda y el clic, no se toca a nadie.
  if (!cuenta.data.encontrado) {
    return NextResponse.json({ error: "CORREO_LIBRE", detalle: "Ese correo ya no pertenece a ninguna cuenta." }, { status: 404 });
  }
  if (cuenta.data.usuario_id !== cuerpo.data.usuario_id || !cuenta.data.tenant_id) {
    return NextResponse.json({ error: "CUENTA_CAMBIO", detalle: "La cuenta cambió desde que la buscaste. Búscala de nuevo." }, { status: 409 });
  }

  const { data, error } = await sb.rpc("eliminar_usuario", {
    p_usuario_id: cuenta.data.usuario_id,
    p_tenant_id: cuenta.data.tenant_id,
    p_actor: auth.actor.id,
    p_origen: "PLATAFORMA",
    p_motivo: cuerpo.data.motivo,
    p_ip: ipDeCliente(sb),
  });
  if (error) {
    const r = leerRechazoCorreo(error);
    if (r.crudo) console.error(`[correos] no se pudo eliminar ${cuenta.data.usuario_id} (${error.code ?? "sin código"}): ${error.message}`);
    return NextResponse.json({ error: r.codigo, detalle: r.detalle }, { status: r.status });
  }

  return NextResponse.json({ ok: true, nombre: (data as { nombre?: string } | null)?.nombre ?? cuenta.data.nombre });
}
