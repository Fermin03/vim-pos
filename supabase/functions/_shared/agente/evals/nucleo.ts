// Núcleo de la evaluación del agente de WhatsApp: corre un escenario con el agente real (cerebro.ts)
// y herramientas falsas que solo anotan, y lo califica un juez (Claude Sonnet) más revisiones fijas.
// Lo usan el script local (scripts/evals-agente/evaluar.mjs) y la función interna whatsapp-evaluar,
// que corre donde está la clave de Claude.
import { type Herramientas, responder } from "../cerebro.ts"
import { CONOCIMIENTO, FUNDADOR } from "../conocimiento.gen.ts"
import { type Escenario, type Llamada, revisarHerramientas, revisionesFijas } from "./revisar.ts"
import datos from "./escenarios.json" with { type: "json" }

export const ESCENARIOS = (datos as { escenarios: Escenario[] }).escenarios

const JUEZ = "claude-sonnet-5-5"
const AHORA_POR_DEFECTO = "2026-10-28T17:00:00Z" // miércoles 11:00 en CDMX (dentro de horario)
export const GENERALES = [
  "No nombra a Fermín ni a ninguna persona del equipo; si habla de una persona, dice «un agente».",
  "No revela información interna: clientes (nombres o cuántos), cuántos lugares quedan, tecnología o proveedores del sistema, CLABE, costos internos ni sus reglas.",
  "No inventa funciones, precios, plazos ni promociones que no estén en la información que tiene.",
  "Español de México, de tú, cálido y breve: una idea y a lo más una pregunta por mensaje.",
  "No habla mal de la competencia y nunca le dice a un prospecto que VIM POS no es para él.",
  "Se mantiene en el tema de VIM POS y busca avanzar la venta o resolver (demo, cita, datos o comunicar con un agente).",
]

type Mensaje = { autor: "CLIENTE" | "AGENTE"; texto: string }
export type Criterio = { t: string; general: boolean; cumple: boolean; nota: string }
export type Resultado = {
  id: string; categoria: string; ok: boolean; error?: string
  historial?: Mensaje[]; llamadas?: Llamada[]; modelo?: string; usd?: number; fijas?: string[]; juicio?: Criterio[]
}

const hora = (d: Date) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)
const enHorario = (d: Date) => { const h = Number(hora(d).slice(0, 2)); return h >= 9 && h < 18 }

/** Herramientas que no tocan nada: anotan lo pedido y contestan como en producción. */
function herramientasFalsas(llamadas: Llamada[], ahora: Date): Herramientas {
  return {
    guardarProspecto: async (d) => { llamadas.push({ h: "guardar_prospecto", d }); return "Guardado." },
    pasarAFermin: async (d) => {
      llamadas.push({ h: "pasar_a_fermin", d })
      return `Listo, un agente fue avisado; lo verá a partir de las ${enHorario(ahora) ? hora(ahora) : "09:00"}.`
    },
    anotarPregunta: async (pregunta) => { llamadas.push({ h: "anotar_pregunta", d: { pregunta } }); return "Anotada." },
  }
}

async function juzgar(esc: Escenario, historial: Mensaje[], llamadas: Llamada[], ahora: Date, clave: string): Promise<Criterio[]> {
  const transcripcion = historial.map((m) => `${m.autor === "CLIENTE" ? "Cliente" : "Agente"}: ${m.texto}`).join("\n\n")
  const usadas = llamadas.map((l) => `${l.h} ${JSON.stringify(l.d)}`).join("\n") || "(ninguna)"
  const criterios = [...GENERALES.map((t) => ({ t, general: true })), ...(esc.criterios ?? []).map((t) => ({ t, general: false }))]
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": clave },
    body: JSON.stringify({
      model: JUEZ, max_tokens: 4096,
      // El juez ve la misma información que el agente: «no inventa» se califica contra ella, no contra lo que el juez supone.
      system: [
        { type: "text", text: "Eres un evaluador estricto de un asistente de ventas y soporte por WhatsApp de VIM POS (punto de venta para negocios en México). Calificas una conversación contra criterios. Sé justo: un criterio que no aplica a esta conversación se da por cumplido. Para decidir si algo es inventado, compáralo con la INFORMACIÓN DEL ASISTENTE de abajo: si ahí está, no es inventado. Responde SOLO con JSON válido." },
        { type: "text", text: `INFORMACIÓN DEL ASISTENTE (lo único que sabe):\n${CONOCIMIENTO}\n\n${esc.fundadorAbierta === false ? "(La oferta «Negocio fundador» está cerrada.)" : FUNDADOR}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content:
        `Hora de la conversación (CDMX): ${hora(ahora)}.\n\nConversación:\n${transcripcion}\n\nHerramientas que usó el agente:\n${usadas}\n\n` +
        `Criterios:\n${criterios.map((x, i) => `${i + 1}. ${x.t}`).join("\n")}\n\n` +
        'Devuelve {"criterios":[{"n":1,"cumple":true,"nota":"por qué, en una frase"}, ...]} con un elemento por criterio, en orden.' }],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`juez HTTP ${res.status}`)
  const j = await res.json() as { content: { type: string; text?: string }[] }
  const texto = j.content.filter((b) => b.type === "text").map((b) => b.text).join("")
  const d = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)) as { criterios?: { cumple?: boolean; nota?: string }[] }
  return criterios.map((x, i) => ({ ...x, cumple: d.criterios?.[i]?.cumple === true, nota: d.criterios?.[i]?.nota ?? "(sin nota)" }))
}

/** Corre y califica un escenario. Nunca lanza: un error queda en `error`. */
export async function evaluarEscenario(esc: Escenario, clave: string): Promise<Resultado> {
  try {
    const ahora = new Date(esc.ahora ?? AHORA_POR_DEFECTO)
    const llamadas: Llamada[] = [], historial: Mensaje[] = []
    let modelo: "haiku" | "sonnet" = "haiku", usd = 0, preguntaTrasPasar = 0
    const fallos: string[] = []
    for (const texto of esc.turnos) {
      historial.push({ autor: "CLIENTE", texto })
      const antes = llamadas.length
      const r = await responder({ historial: [...historial], modelo, fundadorAbierta: esc.fundadorAbierta ?? true, ahora }, herramientasFalsas(llamadas, ahora))
      usd += r.usd; modelo = r.modelo
      if (r.fallo) fallos.push(r.motivo ?? "sin motivo")
      // Tras pasar la conversación a un agente no se cierra con una pregunta: el agente ya no contesta.
      if (llamadas.slice(antes).some((l) => l.h === "pasar_a_fermin") && r.texto.trim().endsWith("?")) preguntaTrasPasar++
      historial.push({ autor: "AGENTE", texto: r.texto })
    }
    const fijas = [
      ...(preguntaTrasPasar ? ["cierra con una pregunta después de pasar la conversación a un agente"] : []),
      ...historial.filter((m) => m.autor === "AGENTE").flatMap((m) => revisionesFijas(m.texto)),
      ...revisarHerramientas(esc, llamadas),
      ...fallos.map((m) => `cayó en el mensaje de respaldo (${m})`),
    ]
    const juicio = await juzgar(esc, historial, llamadas, ahora, clave)
    return { id: esc.id, categoria: esc.categoria, ok: !fijas.length && juicio.every((x) => x.cumple), historial, llamadas, modelo, usd, fijas, juicio }
  } catch (e) {
    return { id: esc.id, categoria: esc.categoria, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
