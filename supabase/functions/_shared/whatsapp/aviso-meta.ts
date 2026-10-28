// Avisos (webhooks) de Meta para el agente de WhatsApp: verificación de firma y lectura del JSON.
// Puro: solo crypto.subtle, se prueba con node --test.

export type Evento =
  | { tipo: "mensaje"; waId: string; wamid: string; nombre: string | null; texto: string }
  | { tipo: "eco"; waId: string; wamid: string; texto: string };

type Msg = { type: string; text?: { body?: string }; [k: string]: unknown };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** `cabecera` = X-Hub-Signature-256 (`sha256=<hex>`): HMAC-SHA256 del cuerpo CRUDO. */
export async function firmaMetaValida(cuerpo: string, cabecera: string | null, secreto: string): Promise<boolean> {
  if (!cabecera?.startsWith("sha256=")) return false;
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = enc.encode(hex(await crypto.subtle.sign("HMAC", llave, enc.encode(cuerpo))));
  const recibida = enc.encode(cabecera.slice(7));
  if (esperada.length !== recibida.length) return false;
  let dif = 0;
  for (let i = 0; i < esperada.length; i++) dif |= esperada[i] ^ recibida[i];
  return dif === 0;
}

export function textoDe(msg: Msg): string {
  const caption = (msg.image as { caption?: string } | undefined)?.caption;
  const t = msg.type === "text" ? (msg.text?.body ?? "")
    : msg.type === "audio" || msg.type === "voice" ? "[audio]"
    : msg.type === "image" ? "[imagen]" + (caption ? " " + caption : "")
    : msg.type === "location" ? "[ubicación]"
    : msg.type === "sticker" ? "[sticker]"
    : "[" + msg.type + "]";
  return t.slice(0, 2000);
}

type J = Record<string, unknown>;
const lista = (x: unknown): J[] => (Array.isArray(x) ? x.filter((i): i is J => !!i && typeof i === "object") : []);
const obj = (x: unknown): J => (x && typeof x === "object" ? (x as J) : {});

// Tipos que no son algo que el cliente escribió: no disparan respuesta.
const IGNORADOS = new Set(["reaction", "unsupported", "system", "errors"]);

/** Nunca lanza: lo que no entiende, lo ignora (statuses incluidos). Con `numeroId` (WA_PHONE_NUMBER_ID),
 *  ignora los avisos de otro número de la misma cuenta. */
export function leerAviso(json: unknown, numeroId?: string): Evento[] {
  const eventos: Evento[] = [];
  for (const entry of lista(obj(json).entry)) {
    for (const cambio of lista(entry.changes)) {
      const v = obj(cambio.value);
      if (numeroId && obj(v.metadata).phone_number_id !== numeroId) continue;
      if (cambio.field === "messages") {
        const n = obj(obj(lista(v.contacts)[0]).profile).name;
        const nombre = typeof n === "string" ? n : null;
        for (const m of lista(v.messages)) {
          if (typeof m.from === "string" && typeof m.id === "string" && !IGNORADOS.has(m.type as string)) {
            eventos.push({ tipo: "mensaje", waId: m.from, wamid: m.id, nombre, texto: textoDe(m as Msg) });
          }
        }
      } else if (cambio.field === "smb_message_echoes") {
        // Forma tomada de la doc de coexistencia: sin verificar con aviso real (Task 9).
        for (const m of lista(v.message_echoes)) {
          if (typeof m.to === "string" && typeof m.id === "string") {
            eventos.push({ tipo: "eco", waId: m.to, wamid: m.id, texto: textoDe(m as Msg) });
          }
        }
      }
    }
  }
  return eventos;
}
