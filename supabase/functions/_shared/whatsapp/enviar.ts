// Envío por la WhatsApp Cloud API (Graph). Puro salvo la lectura de WA_* al llamar `enviar`.

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
    const res = await f(`https://graph.facebook.com/${env?.get("WA_GRAPH_VERSION")}/${env?.get("WA_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env?.get("WA_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => null) as { messages?: { id?: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, wamid: null, error: json?.error?.message ?? `HTTP ${res.status}`, status: res.status };
    return { ok: true, wamid: json?.messages?.[0]?.id ?? null, error: null, status: res.status };
  } catch (e) {
    return { ok: false, wamid: null, error: e instanceof Error ? e.message : String(e), status: null };
  }
}
