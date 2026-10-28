// Envío por la WhatsApp Cloud API. Puro salvo la lectura de WA_* al llamar `enviar`.
// Con WA_KAPSO_API_KEY va por el proveedor Kapso, que replica la forma del Graph API en su propia
// URL y se autentica con X-API-Key; sin ella, directo a Meta con WA_TOKEN.

export function cuerpoTexto(waId: string, texto: string): object {
  return { messaging_product: "whatsapp", to: waId, type: "text", text: { body: texto, preview_url: true } };
}

export function cuerpoPlantilla(waId: string, nombre: string, parametros: string[]): object {
  return {
    messaging_product: "whatsapp", to: waId, type: "template",
    template: {
      name: nombre, language: { code: "es_MX" },
      components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }],
    },
  };
}

/** Nunca lanza: todo fallo vuelve como `{ ok: false, error }`; `status` es el HTTP de Meta (null si no hubo respuesta). */
export async function enviar(
  cuerpo: object,
  f: typeof fetch = fetch,
): Promise<{ ok: boolean; wamid: string | null; error: string | null; status: number | null }> {
  try {
    const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
    const version = env?.get("WA_GRAPH_VERSION") || "v24.0";
    const kapso = env?.get("WA_KAPSO_API_KEY");
    const base = kapso ? `https://api.kapso.ai/meta/whatsapp/${version}` : `https://graph.facebook.com/${version}`;
    const res = await f(`${base}/${env?.get("WA_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { ...(kapso ? { "X-API-Key": kapso } : { Authorization: `Bearer ${env?.get("WA_TOKEN")}` }), "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    // Kapso envuelve casi todas sus respuestas en `data`; Meta no.
    type Resp = { messages?: { id?: string }[]; error?: { message?: string } };
    const crudo = await res.json().catch(() => null) as (Resp & { data?: Resp }) | null;
    const json = crudo?.data ?? crudo;
    if (!res.ok) return { ok: false, wamid: null, error: json?.error?.message ?? crudo?.error?.message ?? `HTTP ${res.status}`, status: res.status };
    return { ok: true, wamid: json?.messages?.[0]?.id ?? null, error: null, status: res.status };
  } catch (e) {
    return { ok: false, wamid: null, error: e instanceof Error ? e.message : String(e), status: null };
  }
}
