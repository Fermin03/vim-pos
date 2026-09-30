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

export async function POST(req: Request) {
  const auth = await autorizar(req);
  if ("error" in auth) return auth.error;

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const key = process.env.PLATFORM_PROVISION_KEY;
  if (!url || !anon) return NextResponse.json({ error: "SERVIDOR_SIN_CONFIG" }, { status: 500 });
  if (!key) return NextResponse.json({ error: "PROVISION_DESHABILITADO" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const res = await fetch(`${url}/functions/v1/provisionar-tenant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "X-Platform-Key": key,
    },
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
