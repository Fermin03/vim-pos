import { NextResponse } from "next/server";

// Route handler server-side: reenvía a la Edge Function canónica `provisionar-tenant`,
// añadiendo el secreto X-Platform-Key desde el entorno del servidor (nunca llega al cliente).
// El panel de plataforma es un cliente delgado sobre esa API de provisioning.

export async function POST(req: Request) {
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
  return NextResponse.json(data, { status: res.status });
}
