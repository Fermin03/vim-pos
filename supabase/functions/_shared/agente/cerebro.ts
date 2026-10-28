// Un turno del agente de WhatsApp contra la Messages API de Claude, con herramientas.
// Puro salvo el fetch (inyectable) y la clave leída del entorno; se prueba con node --test.
import { CONOCIMIENTO, FUNDADOR, REGLAS } from "./conocimiento.gen.ts"

export const MENSAJE_FIJO = "¡Gracias por escribir! En breve te contesta Fermín."
export const AVISO_PRIVACIDAD = "Tus datos se tratan según nuestro aviso de privacidad: https://vimpos.com.mx/aviso-privacidad"

type Modelo = "haiku" | "sonnet"
type Uso = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }

export type Herramientas = {
  guardarProspecto(d: { nombre: string; negocio: string; cajas: number; sucursales: number; giro: string | null; ciudad: string | null; mensaje: string | null }): Promise<string>
  pasarAFermin(d: { estado: "PROSPECTO_CALIENTE" | "URGENTE_SOPORTE" | "DUDA_SIN_RESPUESTA"; motivo: string; resumen: string }): Promise<string>
  anotarPregunta(pregunta: string): Promise<string>
}
export type Turno = {
  historial: { autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string }[]
  modelo: Modelo
  fundadorAbierta: boolean
  nueva: boolean
}

const IDS: Record<Modelo, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" }
// USD por millón de tokens: entrada, escritura de caché (1 h), lectura de caché, salida.
const PRECIOS: Record<Modelo, [number, number, number, number]> = { haiku: [0.1, 0.2, 0.01, 0.5], sonnet: [2, 4, 0.1, 10] }

export function costoUsd(modelo: Modelo, u: Uso): number {
  const [ent, esc, lec, sal] = PRECIOS[modelo]
  return (u.input_tokens * ent + (u.cache_creation_input_tokens ?? 0) * esc + (u.cache_read_input_tokens ?? 0) * lec + u.output_tokens * sal) / 1e6
}

const str = (description: string) => ({ type: "string", description })
const HERRAMIENTAS = [
  {
    name: "guardar_prospecto",
    description: "Guarda los datos de un prospecto cuando ya los dio.",
    input_schema: {
      type: "object",
      properties: {
        nombre: str("Nombre de la persona"), negocio: str("Nombre del negocio"),
        cajas: { type: "integer", description: "Cajas que necesita" }, sucursales: { type: "integer", description: "Sucursales" },
        giro: str("Giro del negocio"), ciudad: str("Ciudad"), mensaje: str("Lo que pidió, en pocas palabras"),
      },
      required: ["nombre", "negocio", "cajas", "sucursales"],
    },
  },
  {
    name: "pasar_a_fermin",
    description: "Avisa a Fermín que esta conversación necesita a una persona.",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["PROSPECTO_CALIENTE", "URGENTE_SOPORTE", "DUDA_SIN_RESPUESTA"] },
        motivo: str("Por qué se pasa"), resumen: str("Resumen breve de la conversación"),
      },
      required: ["estado", "motivo", "resumen"],
    },
  },
  {
    name: "anotar_pregunta",
    description: "Anota una pregunta que no supiste contestar.",
    input_schema: { type: "object", properties: { pregunta: str("La pregunta tal cual") }, required: ["pregunta"] },
  },
  {
    name: "escalar_modelo",
    description: "Pide un modelo más capaz para responder esta conversación.",
    input_schema: { type: "object", properties: {} },
  },
]

// La API exige empezar con user y alternar roles: se descartan los turnos iniciales que no son del
// cliente (el agente solo contesta a un mensaje suyo) y los consecutivos del mismo rol se unen.
function aMensajes(h: Turno["historial"]) {
  const msgs: { role: "user" | "assistant"; content: string }[] = []
  for (const { autor, texto } of h) {
    const role = autor === "CLIENTE" ? "user" : "assistant"
    const t = autor === "FERMIN" ? `(Fermín) ${texto}` : texto
    if (!msgs.length && role !== "user") continue
    const ult = msgs.at(-1)
    if (ult?.role === role) ult.content += "\n" + t
    else msgs.push({ role, content: t })
  }
  return msgs
}

export async function responder(
  t: Turno,
  h: Herramientas,
  f: typeof fetch = fetch,
): Promise<{ texto: string; modelo: Modelo; usd: number; fallo: boolean }> {
  const clave = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("ANTHROPIC_API_KEY") ?? ""
  const system: Record<string, unknown>[] = [REGLAS, CONOCIMIENTO, ...(t.fundadorAbierta ? [FUNDADOR] : [])].map((text) => ({ type: "text", text }))
  system[system.length - 1].cache_control = { type: "ephemeral", ttl: "1h" }
  const messages: { role: string; content: unknown }[] = aMensajes(t.historial)
  let modelo = t.modelo
  let usd = 0
  const fallo = () => ({ texto: MENSAJE_FIJO, modelo, usd, fallo: true })

  try {
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const res = await f("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": clave },
        body: JSON.stringify({ model: IDS[modelo], max_tokens: 600, system, tools: HERRAMIENTAS, messages }),
      })
      if (!res.ok) return fallo()
      const r = await res.json() as { content: { type: string; [k: string]: any }[]; usage: Uso }
      usd += costoUsd(modelo, r.usage)
      const usos = r.content.filter((b) => b.type === "tool_use")
      if (!usos.length) {
        const texto = r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim()
        if (!texto) return fallo()
        return { texto: t.nueva ? texto + "\n\n" + AVISO_PRIVACIDAD : texto, modelo, usd, fallo: false }
      }
      messages.push({ role: "assistant", content: r.content })
      const resultados = []
      for (const u of usos) {
        try {
          let out: string
          if (u.name === "guardar_prospecto") out = await h.guardarProspecto(u.input)
          else if (u.name === "pasar_a_fermin") out = await h.pasarAFermin(u.input)
          else if (u.name === "anotar_pregunta") out = await h.anotarPregunta(u.input.pregunta)
          else if (u.name === "escalar_modelo") { modelo = "sonnet"; out = "Listo, ahora respondes con un modelo más capaz." }
          else throw new Error("herramienta desconocida")
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: out })
        } catch {
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: "No se pudo ejecutar.", is_error: true })
        }
      }
      messages.push({ role: "user", content: resultados })
    }
  } catch {
    return fallo()
  }
  return fallo()
}
