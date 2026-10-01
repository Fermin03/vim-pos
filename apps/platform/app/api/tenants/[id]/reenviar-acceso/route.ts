import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../../../lib/server";
import { accesoDeDueno, esLimiteDeCorreo, mensajeReenvio, type UsuarioAuth } from "../../../../lib/acceso-dueno";

// Reenviar al dueño su correo de acceso (roadmap A5): la invitación si lo dio de alta VIM, o la
// confirmación de registro si se registró solo (ver lib/acceso-dueno.ts). Solo mientras NO haya
// confirmado su correo; a un dueño que ya entra no se le manda nada desde aquí — si olvidó su
// contraseña, la recupera él desde el inicio de sesión del admin.
//
// LÍMITES. Auth ya limita a un correo por minuto por cuenta. Encima va un cupo propio en la base
// (`consumir_cupo`, 0136): uno por minuto y cinco por hora POR NEGOCIO. El de Auth no protege de un
// operador con el dedo pesado ni deja rastro; este sí. Si la base del cupo no responde, no se
// manda: es un correo a un tercero, no algo que valga la pena mandar a ciegas.

const MINUTO = "60 seconds";
const HORA = "3600 seconds";
const MAX_POR_HORA = 5;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;
  const sb = auth.sb;
  const { id } = await ctx.params;

  const { data: tenant } = await sb.from("tenants").select("usuario_dueno_id, nombre_comercial").eq("id", id).maybeSingle();
  const ownerId = (tenant as { usuario_dueno_id?: string | null } | null)?.usuario_dueno_id;
  if (!ownerId) return NextResponse.json({ error: "TENANT_SIN_DUENO", detalle: "Este negocio no tiene una cuenta de dueño." }, { status: 400 });

  const [{ data: userRes }, { data: onb }] = await Promise.all([
    sb.auth.admin.getUserById(ownerId),
    sb.from("tenant_onboarding_estado").select("terminos_version").eq("tenant_id", id).maybeSingle(),
  ]);
  const usuario = (userRes?.user ?? null) as (UsuarioAuth & { id?: string }) | null;
  const acceso = accesoDeDueno(usuario, (onb as { terminos_version?: string | null } | null)?.terminos_version ?? null);
  if (!acceso?.email) return NextResponse.json({ error: "DUENO_SIN_EMAIL", detalle: "La cuenta del dueño no tiene correo." }, { status: 400 });
  if (acceso.confirmadoEl) {
    return NextResponse.json({ error: "YA_CONFIRMADO", detalle: "El dueño ya confirmó su correo. Si olvidó su contraseña, la recupera desde el inicio de sesión." }, { status: 409 });
  }

  // Cupo por negocio: primero el del minuto, luego el de la hora.
  for (const [clave, ventana, max] of [
    [`reenvio-acceso:minuto:${id}`, MINUTO, 1],
    [`reenvio-acceso:hora:${id}`, HORA, MAX_POR_HORA],
  ] as const) {
    const { data: cabe, error } = await sb.rpc("consumir_cupo", { p_clave: clave, p_ventana: ventana, p_max: max });
    if (error || typeof cabe !== "boolean") {
      console.error(`[reenviar-acceso] consumir_cupo(${clave}) falló: ${error?.message ?? "respuesta no booleana"}`);
      return NextResponse.json({ error: "NO_DISPONIBLE", detalle: "No se pudo comprobar el límite de envíos. Intenta en un momento." }, { status: 503 });
    }
    if (!cabe) {
      return NextResponse.json(
        ventana === MINUTO
          ? { error: "ESPERA_UN_MINUTO", detalle: "Acabas de reenviarlo. Espera un minuto antes de mandar otro." }
          : { error: "DEMASIADOS_ENVIOS", detalle: `Ya se reenvió ${MAX_POR_HORA} veces en la última hora. Revisa con el dueño que el correo sea el correcto.` },
        { status: 429 },
      );
    }
  }

  const adminUrl = (process.env.ADMIN_APP_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  const nombre = usuario?.user_metadata?.nombre;
  const { error: envioError } = acceso.tipo === "invitacion"
    // A una cuenta invitada que no ha confirmado, Auth le vuelve a emitir la invitación (y el
    // enlace anterior deja de servir). Los metadatos se mandan iguales para no perder el nombre.
    ? await sb.auth.admin.inviteUserByEmail(acceso.email, {
      data: typeof nombre === "string" ? { nombre } : undefined,
      redirectTo: `${adminUrl}/establecer-acceso`,
    })
    : await sb.auth.resend({ type: "signup", email: acceso.email, options: { emailRedirectTo: `${adminUrl}/cuenta-confirmada` } });

  if (envioError) {
    if (esLimiteDeCorreo(envioError)) {
      return NextResponse.json({ error: "ESPERA_UN_MINUTO", detalle: "El servidor de correo pide esperar un minuto entre un envío y otro a la misma cuenta." }, { status: 429 });
    }
    console.error(`[reenviar-acceso] ${acceso.tipo} a ${id}: ${envioError.message}`);
    return NextResponse.json({ error: "ENVIO_FALLO", detalle: `No se pudo mandar el correo: ${envioError.message}` }, { status: 502 });
  }

  await auditar(sb, {
    accion: "tenant.reenviar_acceso",
    tenantId: id,
    motivo: acceso.tipo === "invitacion" ? "Reenvío de la invitación al dueño" : "Reenvío de la confirmación de registro al dueño",
    payload: { tipo: acceso.tipo, email: acceso.email },
  });
  return NextResponse.json({ ok: true, tipo: acceso.tipo, email: acceso.email, mensaje: mensajeReenvio(acceso.tipo, acceso.email) });
}
