import { NextResponse } from "next/server";
import { autorizar, auditar } from "../../lib/server";

// Route handler server-side: reenvía a la Edge Function canónica `provisionar-tenant`,
// añadiendo el secreto X-Platform-Key desde el entorno del servidor (nunca llega al cliente).
// El panel de plataforma es un cliente delgado sobre esa API de provisioning.
//
// SEC — esta ruta NO pedía autorización: ponía la clave del servidor y reenviaba lo que llegara,
// así que cualquiera que conociera la URL podía dar de alta un negocio con su dueño en producción
// (comprobado el 30 sep 2026: una petición anónima llegaba a la función y la clave ya pasaba). Ahora
// exige lo mismo que el resto del panel y queda en la bitácora.
//
// Auditoría integral 30/09/2026 (C2-7) — el secreto de servidor a servidor. La Edge Function tiene
// ahora el suyo, PROVISION_INTERNAL_SECRET (cabecera X-Vim-Provision), que solo conocen este servidor
// y la función: la clave compartida del arranque (PLATFORM_PROVISION_KEY) la "retira" server.ts al
// activar operadores, pero esa retirada no alcanzaba a la función, que la seguía aceptando sola.
//
// Mientras existan las DOS variables, se mandan las dos cabeceras: así da igual si la función que
// está desplegada es la vieja (lee X-Platform-Key) o la nueva (con PROVISION_INTERNAL_SECRET
// configurado solo lee X-Vim-Provision). Orden de despliegue en supabase/functions/provisionar-tenant.

export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const key = process.env.PLATFORM_PROVISION_KEY?.trim();
  const interno = process.env.PROVISION_INTERNAL_SECRET?.trim();
  if (!url || !anon) return NextResponse.json({ error: "SERVIDOR_SIN_CONFIG" }, { status: 500 });
  if (!interno && !key) return NextResponse.json({ error: "PROVISION_DESHABILITADO" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: anon,
    Authorization: `Bearer ${anon}`,
  };
  if (interno) headers["X-Vim-Provision"] = interno;
  if (key) headers["X-Platform-Key"] = key; // solo para una función aún sin PROVISION_INTERNAL_SECRET

  const res = await fetch(`${url}/functions/v1/provisionar-tenant`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "RESPUESTA_INVALIDA" }));
  const tenantId = (data as { tenant_id?: string }).tenant_id;
  if (res.ok && tenantId) {
    const b = body as { nombre_comercial?: string; email_owner?: string; plan_codigo?: string };
    await auditar(auth.sb, {
      accion: "tenant.provisionar",
      tenantId,
      motivo: "Alta de negocio desde el panel",
      payload: { nombre: b.nombre_comercial ?? null, dueno: b.email_owner ?? null, plan: b.plan_codigo ?? null },
    });
  }
  return NextResponse.json(data, { status: res.status });
}
