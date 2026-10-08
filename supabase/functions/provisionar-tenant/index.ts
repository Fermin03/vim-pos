// Edge Function: provisionar-tenant (F10) — alta de un nuevo cliente (tenant) por VIM.
// Crea la cuenta del dueño (auth.users) + el tenant con todo su andamiaje (crear_tenant_con_owner
// de 0012: perfil, acceso DUEÑO, saldo de folios, onboarding, auditoría). service_role server-side.
//
// AUTORIZACIÓN: la llama SOLO el servidor del panel de plataforma (apps/platform, /api/provisionar),
// que ya exigió un operador con segundo factor y deja la bitácora. Esta función no ve al operador:
// ve un secreto de servidor a servidor.
//
// Auditoría integral 30/09/2026 (C2-7). Antes el secreto era la clave compartida del arranque
// (`PLATFORM_PROVISION_KEY`), la misma que el panel "retira" al activar operadores con 2FA; pero esa
// retirada solo vale DENTRO del panel, y con la clave cualquiera podía llamar aquí directo, sin
// operador ni bitácora, sin allowlist ni límite. Ahora:
//   · secreto PROPIO: `PROVISION_INTERNAL_SECRET` en la cabecera `X-Vim-Provision`
//     (`openssl rand -hex 32`, el MISMO valor en Supabase y en Vercel). Configurado aquí, la clave
//     compartida deja de servir en esta función.
//   · sin él configurado, modo legado (la clave compartida, como antes) para no cortar el alta de
//     clientes a medio despliegue; se avisa en cada uso.
//   · límite de fallos por IP con la base (consumir_cupo, 0136), cerrado si la base no responde.
//
// ORDEN DE DESPLIEGUE (ninguno de los pasos corta el alta):
//   1. Vercel (apps/platform): añadir PROVISION_INTERNAL_SECRET y desplegar. El panel manda las dos
//      cabeceras mientras tenga las dos variables; la función vieja sigue usando X-Platform-Key.
//   2. `supabase secrets set PROVISION_INTERNAL_SECRET=<el mismo>` y desplegar esta función. Desde
//      aquí solo vale X-Vim-Provision.
//   3. `supabase secrets unset PLATFORM_PROVISION_KEY` (la función ya no la lee). En Vercel se queda
//      mientras sirva para el arranque del panel (server.ts).
//
// Local: supabase functions serve provisionar-tenant --env-file supabase/functions/.env
import { clienteAdmin, servir } from "../_shared/http.ts";
import { consumirCupo, cupoAgotado, ipDeLaPeticion, type Cupo } from "../_shared/limite.ts";
import { cabeceraDeModo, igualSeguro, modoProvision } from "../_shared/provision.ts";

const VERTICALES = ["FOODTRUCK", "QUICK_SERVICE", "FULL_SERVICE", "CAFE_BAR", "DARK_KITCHEN", "ENTERPRISE"];

/** Fallos de secreto por IP. Con un secreto de 256 bits la fuerza bruta no es el riesgo real: esto
 *  corta el ruido y deja rastro. No hay tope GLOBAL de fallos a propósito: permitiría que
 *  cualquiera bloqueara el alta de clientes de VIM con peticiones basura. */
const fallosPorIp = (ip: string): Cupo => ({ clave: `provision:fallo:${ip}`, ventanaSeg: 15 * 60, max: 10 });

servir(async (req, json) => {
  const admin = clienteAdmin();

  // Gate por secreto de servidor (fail-closed si no hay ninguno configurado).
  const interno = Deno.env.get("PROVISION_INTERNAL_SECRET") ?? "";
  const legado = Deno.env.get("PLATFORM_PROVISION_KEY") ?? "";
  const modo = modoProvision({ interno, legado });
  const cabecera = cabeceraDeModo(modo);
  if (!cabecera) return json({ error: "PROVISION_DESHABILITADO" }, 503);

  const ip = ipDeLaPeticion(req);
  if (await cupoAgotado(admin, fallosPorIp(ip), "cerrar")) {
    console.warn(`[provisionar-tenant] demasiados fallos desde ${ip}`);
    return json({ error: "DEMASIADOS_INTENTOS" }, 429);
  }
  // SEC CN-024 — comparación en tiempo constante (ver _shared/provision.ts).
  if (!(await igualSeguro(req.headers.get(cabecera) ?? "", modo === "interno" ? interno : legado))) {
    await consumirCupo(admin, fallosPorIp(ip), "cerrar");
    console.warn(`[provisionar-tenant] secreto inválido (${cabecera}) desde ${ip}`);
    return json({ error: "NO_AUTORIZADO" }, 401);
  }
  if (modo === "legado") {
    console.warn("[provisionar-tenant] autorizado con PLATFORM_PROVISION_KEY (modo legado). " +
      "Configura PROVISION_INTERNAL_SECRET: ver el orden de despliegue en el encabezado.");
  }

  let b: Record<string, string | undefined>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "BAD_JSON" }, 400);
  }
  const {
    codigo,
    nombre_comercial,
    nombre_owner,
    email_owner,
    telefono_owner,
    vertical,
    plan_codigo,
    notas,
  } = b;

  if (!codigo || !nombre_comercial || !nombre_owner || !email_owner || !vertical || !plan_codigo) {
    return json({ error: "FALTAN_CAMPOS" }, 400);
  }
  if (!/^[a-z0-9-]+$/.test(codigo)) return json({ error: "CODIGO_INVALIDO", detalle: "minúsculas, números y guiones" }, 400);
  if (!VERTICALES.includes(vertical)) return json({ error: "VERTICAL_INVALIDA" }, 400);

  // 1) Invitar al dueño por correo: crea la cuenta y envía un email con un link para que
  //    el dueño fije SU contraseña (página /establecer-acceso del admin). No viaja ninguna
  //    contraseña por correo. Requiere SMTP configurado en el proyecto para enviar de verdad.
  const adminUrl = Deno.env.get("ADMIN_APP_URL") ?? "http://localhost:3001";
  const { data: invited, error: cErr } = await admin.auth.admin.inviteUserByEmail(email_owner, {
    data: { nombre: nombre_owner },
    redirectTo: `${adminUrl}/establecer-acceso`,
  });
  if (cErr || !invited?.user) {
    console.error("[provisionar-tenant] inviteUserByEmail:", cErr?.message ?? "sin usuario");
    const yaExiste = /already.*registered|exists|duplicate/i.test(cErr?.message ?? "");
    // `detalle` se conserva SOLO en esta función (C2-9): la respuesta la lee únicamente el
    // servidor del panel, detrás de este secreto, y se la enseña a un operador de VIM con 2FA, que
    // necesita saber por qué no se pudo dar de alta. Las funciones públicas ya no lo devuelven.
    return json({ error: yaExiste ? "EMAIL_YA_REGISTRADO" : "ALTA_OWNER_FALLO", detalle: cErr?.message ?? null },
      yaExiste ? 409 : 400);
  }
  const ownerId = invited.user.id;

  // 2) Provisionar el tenant + andamiaje (RPC SECURITY DEFINER).
  const { data: tenantId, error: pErr } = await admin.rpc("crear_tenant_con_owner", {
    p_owner_user_id: ownerId,
    p_codigo: codigo,
    p_nombre_comercial: nombre_comercial,
    p_nombre_owner: nombre_owner,
    p_telefono_owner: telefono_owner ?? null,
    p_vertical: vertical,
    p_plan_codigo: plan_codigo,
    p_estado: "TRIAL",
    p_notas_internas: notas ?? null,
  });
  if (pErr) {
    // Rollback parcial: si el tenant falló, borrar el owner recién creado para no dejar huérfanos.
    await admin.auth.admin.deleteUser(ownerId).catch(() => {});
    console.error("[provisionar-tenant] crear_tenant_con_owner:", pErr.message);
    if (/duplicate|unique|already/i.test(pErr.message)) return json({ error: "CODIGO_YA_USADO" }, 409);
    return json({ error: "PROVISION_FALLO", detalle: pErr.message }, 400); // ver la nota de arriba
  }

  return json({
    ok: true,
    tenant_id: tenantId,
    owner_id: ownerId,
    owner_email: email_owner,
    invitacion_enviada: true,
  });
});
