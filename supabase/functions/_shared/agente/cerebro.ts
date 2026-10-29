// Un turno del agente de WhatsApp contra la Messages API de Claude, con herramientas.
// Puro salvo el fetch (inyectable) y la clave leída del entorno; se prueba con node --test.
import { CONOCIMIENTO, FUNDADOR, REGLAS } from "./conocimiento.gen.ts"
import { enHorario } from "../whatsapp/avisos.ts"

export const MENSAJE_FIJO = "Gracias por escribir. En breve un agente se comunica contigo."
export const AVISO_PRIVACIDAD = "Tus datos se tratan según nuestro aviso de privacidad: https://vimpos.com.mx/aviso-privacidad"

type Modelo = "haiku" | "sonnet"
type Uso = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }

export type Herramientas = {
  guardarProspecto(d: { nombre: string; negocio: string; cajas: number; sucursales: number; giro: string | null; ciudad: string | null; mensaje: string | null }): Promise<string>
  pasarAFermin(d: { estado: "PROSPECTO_CALIENTE" | "URGENTE_SOPORTE" | "DUDA_SIN_RESPUESTA" | "PAGO_POR_CONFIRMAR"; motivo: string; resumen: string }): Promise<string>
  anotarPregunta(pregunta: string): Promise<string>
  // Cobro: el negocio y el monto los pone la base desde la conversación verificada, nunca el modelo.
  pedirCodigo(correo: string): Promise<string>
  verificarCodigo(codigo: string): Promise<string>
  elegirNegocio(nombre: string): Promise<string>
  consultarAdeudo(adelanto: boolean): Promise<string>
  guardarDatosFactura(d: { rfc: string; razon_social: string; regimen: string; codigo_postal: string; uso_cfdi: string }): Promise<string>
  crearLigaPago(adelanto: boolean): Promise<string>
}
export type Turno = {
  historial: { autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string }[]
  modelo: Modelo
  fundadorAbierta: boolean
  aprendido?: string // bloqueAprendido(...): lo que VIM aprobó; "" o ausente = nada
  ahora?: Date // para pruebas; por defecto, new Date()
}

const IDS: Record<Modelo, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" }
// USD por millón de tokens: entrada, escritura de caché (1 h), lectura de caché, salida.
const PRECIOS: Record<Modelo, [number, number, number, number]> = { haiku: [0.1, 0.2, 0.01, 0.5], sonnet: [2, 4, 0.1, 10] }

export function costoUsd(modelo: Modelo, u: Uso): number {
  const [ent, esc, lec, sal] = PRECIOS[modelo]
  return (u.input_tokens * ent + (u.cache_creation_input_tokens ?? 0) * esc + (u.cache_read_input_tokens ?? 0) * lec + u.output_tokens * sal) / 1e6
}

const str = (description: string) => ({ type: "string", description })
const ESTADOS = ["PROSPECTO_CALIENTE", "URGENTE_SOPORTE", "DUDA_SIN_RESPUESTA", "PAGO_POR_CONFIRMAR"]
// Lo único que el modelo decide al cobrar: si es adelanto. Ni negocio ni monto.
const ADELANTO = {
  type: "object",
  properties: { adelanto: { type: "boolean", description: "true si está al corriente y quiere pagar el siguiente periodo por adelantado" } },
}
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
    description: "Comunica esta conversación con un agente de VIM (una persona).",
    input_schema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ESTADOS },
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
    name: "pedir_codigo",
    description: "Manda un código de 6 dígitos al correo de acceso del dueño para verificar que es el cliente.",
    input_schema: { type: "object", properties: { correo: str("Correo con el que entra a VIM POS") }, required: ["correo"] },
  },
  {
    name: "verificar_codigo",
    description: "Revisa el código que el cliente recibió por correo.",
    input_schema: { type: "object", properties: { codigo: str("Los 6 dígitos, sin espacios") }, required: ["codigo"] },
  },
  {
    name: "elegir_negocio",
    description: "Si el dueño tiene varios negocios, elige con cuál sigue la conversación.",
    input_schema: { type: "object", properties: { nombre: str("Nombre comercial del negocio") }, required: ["nombre"] },
  },
  {
    name: "consultar_adeudo",
    description: "Cuánto debe el negocio verificado: plan, extras, IVA, total, periodos y estado.",
    input_schema: ADELANTO,
  },
  {
    name: "guardar_datos_factura",
    description: "Guarda los datos fiscales para la factura, ya confirmados con el cliente.",
    input_schema: {
      type: "object",
      properties: {
        rfc: str("RFC"), razon_social: str("Nombre o razón social"), regimen: str("Régimen fiscal (clave de 3 dígitos)"),
        codigo_postal: str("Código postal fiscal, 5 dígitos"), uso_cfdi: str("Uso del CFDI (clave, p. ej. G03)"),
      },
      required: ["rfc", "razon_social", "regimen", "codigo_postal", "uso_cfdi"],
    },
  },
  {
    name: "crear_liga_pago",
    description: "Crea la liga de pago con tarjeta por el adeudo del negocio verificado.",
    input_schema: ADELANTO,
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
    const t = autor === "FERMIN" ? `(Agente de VIM) ${texto}` : texto
    if (!msgs.length && role !== "user") continue
    const ult = msgs.at(-1)
    if (ult?.role === role) ult.content += "\n" + t
    else msgs.push({ role, content: t })
  }
  return msgs
}

const LIMITE_TEXTO = 1500

// Corta en el último fin de oración («. », «! », «? » o fin) a ≤1500 puntos de código; nunca en el
// punto de un número o de una URL. Sin fin de oración, corte duro (sin partir un emoji).
export const MAX_TOKENS = 2048

/** WhatsApp no es Markdown: negrita con un asterisco y sin almohadillas de título. */
const aWhatsApp = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "")

function recortar(t: string): string {
  const cp = [...t]
  if (cp.length <= LIMITE_TEXTO) return t
  const corte = cp.slice(0, LIMITE_TEXTO + 1).join("") // +1: ¿el signo del borde va seguido de espacio?
  let i = -1
  for (const m of corte.matchAll(/[.!?](?=\s)/g)) i = m.index
  return i > 0 ? corte.slice(0, i + 1) : cp.slice(0, LIMITE_TEXTO).join("")
}

const TZ = "America/Mexico_City"
// Bloque sin caché: la hora cambia en cada turno y no debe invalidar el caché de las reglas.
export function bloqueAhora(ahora: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(ahora).map((x) => [x.type, x.value]))
  return `Ahora: ${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}, hora del centro de México. ` +
    `Horario de atención de un agente: 9:00–18:00 (${enHorario(ahora) ? "dentro" : "fuera"} del horario).`
}

const txt = (v: unknown, max = 1000, min = 1) => typeof v === "string" && v.trim().length >= min && v.length <= max
const ent = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 99
const cad = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v.trim())
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i

// Devuelve lo que falta o está mal; "" si la entrada es válida. El mensaje vuelve al modelo.
function invalido(nombre: string, i: Record<string, unknown> | null): string {
  if (!i || typeof i !== "object") return "Datos faltantes o inválidos: todos."
  const mal: string[] = []
  if (nombre === "guardar_prospecto") {
    if (!txt(i.nombre, 120, 2)) mal.push("nombre (2 a 120 caracteres)")
    if (!txt(i.negocio, 150, 2)) mal.push("negocio (2 a 150 caracteres)")
    if (!ent(i.cajas)) mal.push("cajas (entero 1 a 99)")
    if (!ent(i.sucursales)) mal.push("sucursales (entero 1 a 99)")
  } else if (nombre === "pasar_a_fermin") {
    if (!ESTADOS.includes(i.estado as string)) mal.push("estado (" + ESTADOS.join("|") + ")")
    if (!txt(i.motivo)) mal.push("motivo")
    if (!txt(i.resumen)) mal.push("resumen")
  } else if (nombre === "anotar_pregunta") {
    if (!txt(i.pregunta, 500)) mal.push("pregunta (máx. 500 caracteres)")
  } else if (nombre === "pedir_codigo") {
    if (!txt(i.correo, 254) || !cad(i.correo, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)) mal.push("correo (nombre@dominio)")
  } else if (nombre === "verificar_codigo") {
    if (typeof i.codigo !== "string" || !/^\d{6}$/.test(i.codigo)) mal.push("codigo (6 dígitos)")
  } else if (nombre === "elegir_negocio") {
    if (!txt(i.nombre, 150)) mal.push("nombre")
  } else if (nombre === "consultar_adeudo" || nombre === "crear_liga_pago") {
    if (i.adelanto !== undefined && typeof i.adelanto !== "boolean") mal.push("adelanto (true o false)")
  } else if (nombre === "guardar_datos_factura") {
    if (!cad(i.rfc, RFC)) mal.push("rfc (12 o 13 caracteres)")
    if (!txt(i.razon_social, 300)) mal.push("razon_social")
    if (!txt(i.regimen, 100)) mal.push("regimen")
    if (!cad(i.codigo_postal, /^\d{5}$/)) mal.push("codigo_postal (5 dígitos)")
    if (!txt(i.uso_cfdi, 100)) mal.push("uso_cfdi")
  }
  return mal.length ? "Datos faltantes o inválidos: " + mal.join(", ") + ". Pídeselos al cliente si hace falta." : ""
}

export async function responder(
  t: Turno,
  h: Herramientas,
  f: typeof fetch = fetch,
): Promise<{ texto: string; modelo: Modelo; usd: number; fallo: boolean; motivo?: string }> {
  const clave = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("ANTHROPIC_API_KEY") ?? ""
  const system: Record<string, unknown>[] = [REGLAS, CONOCIMIENTO, ...(t.fundadorAbierta ? [FUNDADOR] : [])].map((text) => ({ type: "text", text }))
  system[system.length - 1].cache_control = { type: "ephemeral", ttl: "1h" }
  if (t.aprendido) system.push({ type: "text", text: t.aprendido, cache_control: { type: "ephemeral", ttl: "1h" } })
  system.push({ type: "text", text: bloqueAhora(t.ahora ?? new Date()) +
    (t.fundadorAbierta ? "" : " La oferta «Negocio fundador» está CERRADA: no la menciones ni la ofrezcas.") })
  const hist = aMensajes(t.historial)
  const messages: { role: string; content: unknown }[] = hist
  let modelo = t.modelo
  let usd = 0
  const fallo = (motivo: string) => ({ texto: MENSAJE_FIJO, modelo, usd, fallo: true, motivo })
  // Texto que el modelo escribió junto a una herramienta: si después ya no agrega nada, ese es el mensaje.
  let dicho = ""
  if (hist.at(-1)?.role !== "user") return fallo("historial sin mensaje del cliente al final")
  if (!clave) { console.error("falta ANTHROPIC_API_KEY"); return fallo("falta ANTHROPIC_API_KEY") }

  try {
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const res = await f("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": clave },
        // El modelo piensa antes de responder (bloques «thinking») y eso gasta del mismo tope: con 600
        // se cortaba antes de llegar al texto o a la herramienta. El largo del mensaje lo limitan las
        // reglas (600 caracteres) y `recortar`, no este número.
        body: JSON.stringify({ model: IDS[modelo], max_tokens: MAX_TOKENS, system, tools: HERRAMIENTAS, messages }),
        signal: AbortSignal.timeout(25_000),
      })
      if (!res.ok) { console.error("Anthropic HTTP", res.status); return fallo(`Anthropic HTTP ${res.status}`) }
      const r = await res.json() as { stop_reason?: string; content: { type: string; [k: string]: any }[]; usage: Uso }
      usd += costoUsd(modelo, r.usage)
      const usos = r.content.filter((b) => b.type === "tool_use")
      // Sin texto ni herramienta útil: se deja la forma de la respuesta en el log (nunca el contenido).
      const forma = () => {
        const f = `sin respuesta útil: ${r.stop_reason} ${r.content.map((b) => b.type).join(",")}`
        console.error("Anthropic " + f)
        return f
      }
      if (r.stop_reason === "max_tokens" && usos.length) return fallo(forma()) // la entrada pudo quedar cortada
      const texto = r.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim()
      if (!usos.length) {
        if (!texto && !dicho) return fallo(forma())
        return { texto: recortar(aWhatsApp(texto || dicho)), modelo, usd, fallo: false }
      }
      if (texto) dicho = texto
      messages.push({ role: "assistant", content: r.content })
      const resultados = []
      for (const u of usos) {
        try {
          const falta = invalido(u.name, u.input)
          if (falta) {
            resultados.push({ type: "tool_result", tool_use_id: u.id, content: falta, is_error: true })
            continue
          }
          let out: string
          if (u.name === "guardar_prospecto") out = await h.guardarProspecto(u.input)
          else if (u.name === "pasar_a_fermin") out = await h.pasarAFermin(u.input)
          else if (u.name === "anotar_pregunta") out = await h.anotarPregunta(u.input.pregunta)
          else if (u.name === "pedir_codigo") out = await h.pedirCodigo(u.input.correo.trim())
          else if (u.name === "verificar_codigo") out = await h.verificarCodigo(u.input.codigo)
          else if (u.name === "elegir_negocio") out = await h.elegirNegocio(u.input.nombre.trim())
          // Solo el boolean: un tenant_id o un monto que mande el modelo no llega a la herramienta.
          else if (u.name === "consultar_adeudo") out = await h.consultarAdeudo(u.input.adelanto === true)
          else if (u.name === "crear_liga_pago") out = await h.crearLigaPago(u.input.adelanto === true)
          else if (u.name === "guardar_datos_factura") {
            const d = u.input
            out = await h.guardarDatosFactura({
              rfc: d.rfc.trim().toUpperCase(), razon_social: d.razon_social.trim(), regimen: d.regimen.trim(),
              codigo_postal: d.codigo_postal.trim(), uso_cfdi: d.uso_cfdi.trim(),
            })
          }
          else if (u.name === "escalar_modelo") { modelo = "sonnet"; out = "Listo, ahora respondes con un modelo más capaz." }
          else throw new Error("herramienta desconocida")
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: out })
        } catch {
          resultados.push({ type: "tool_result", tool_use_id: u.id, content: "No se pudo ejecutar.", is_error: true })
        }
      }
      messages.push({ role: "user", content: resultados })
    }
  } catch (e) {
    console.error("Anthropic error", (e as Error)?.name)
    return fallo(`error ${(e as Error)?.name}`)
  }
  console.error("Anthropic: 5 vueltas sin texto")
  return fallo("5 vueltas sin texto")
}
