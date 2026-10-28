// Un turno del agente de WhatsApp: con el mensaje ya registrado (lo hace el webhook antes de
// contestar 200), decide si contesta, llama al cerebro y envía.
// Todo lo externo entra por `deps`, así que se prueba con node --test sin red ni base.
import { AVISO_PRIVACIDAD, type Herramientas, MENSAJE_FIJO, type responder, type Turno } from "./cerebro.ts"
import type { Evento } from "../whatsapp/aviso-meta.ts"
import type { ClienteRpc } from "../limite.ts"
import { registrarError } from "../errores.ts"

export type DepsTurno = {
  rpc: ClienteRpc["rpc"]
  /** `nueva`: el agente aún no ha escrito en la conversación (ningún mensaje AGENTE). */
  leerConversacion(id: string): Promise<{ historial: Turno["historial"]; modelo: "haiku" | "sonnet"; fundadorAbierta: boolean; nueva: boolean }>
  responder: typeof responder
  enviar: (waId: string, texto: string) => Promise<{ ok: boolean; wamid: string | null; error?: string | null }>
  cupo: (waId: string) => Promise<boolean>
  /** ¿Fermín escribió en esta conversación después de `desde`? (mensaje FERMIN con creado_en > desde) */
  ferminEscribio: (conversacionId: string, desde: Date) => Promise<boolean>
  guardarModelo: (conversacionId: string, modelo: "sonnet") => Promise<void>
  herramientas: (conversacionId: string) => Herramientas
  topeUsd: number
  /** WA_NUMERO_FERMIN: sus propios mensajes (p. ej. al contestar un aviso) se registran pero no se responden. */
  numeroFermin: string
  /** Espera de la ráfaga: si el cliente manda varios mensajes seguidos, solo contesta el turno del último. */
  esperar: (ms: number) => Promise<void>
  /** ¿Hay un mensaje CLIENTE más nuevo que `wamid` en la conversación? */
  hayMasNuevo: (conversacionId: string, wamid: string) => Promise<boolean>
}

export const MENSAJE_AUDIO = "No puedo escuchar audios, ¿me lo escribes?"
export const ESPERA_RAFAGA_MS = 4000

const diez = (n: string) => n.replace(/\D/g, "").slice(-10)

export async function atenderMensaje(
  e: Extract<Evento, { tipo: "mensaje" }>,
  r: { conversacion_id: string; responder: boolean },
  deps: DepsTurno,
): Promise<void> {
  if (!r.responder) return
  if (deps.numeroFermin && diez(e.waId) === diez(deps.numeroFermin)) return
  const id = r.conversacion_id
  await deps.esperar(ESPERA_RAFAGA_MS)
  if (await deps.hayMasNuevo(id, e.wamid)) return
  if (!await deps.cupo(e.waId)) { console.error("[whatsapp] cupo agotado", id); return }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await deps.rpc(fn, args)
    if (error) throw new Error(`${fn}: ${error.message}`)
    return data as any
  }
  const desde = new Date()
  const pasar = (estado: string, motivo: string, resumen: string) =>
    rpc("wa_pasar_a_fermin", { p_conversacion_id: id, p_estado: estado, p_motivo: motivo, p_resumen: resumen })
  // Aviso general (sin conversación): wa_pasar_a_fermin con id NULL solo inserta el aviso.
  const sumar = async (usd: number) => {
    const uso = await rpc("wa_sumar_uso", { p_usd: usd, p_tope: deps.topeUsd })
    if (uso.cruzo_80) {
      await rpc("wa_pasar_a_fermin", { p_conversacion_id: null, p_estado: "ACTIVA", p_motivo: "Gasto de IA", p_resumen: "Claude va en 80 % del tope del mes" })
    }
    return Number(uso.usd_mes)
  }
  const conv = await deps.leerConversacion(id)
  // Solo se calla si Fermín escribió DURANTE este turno; que el agente mismo pause (pasar_a_fermin) no lo calla.
  // El primer mensaje del agente en la conversación lleva el aviso de privacidad, sea cual sea.
  const decir = async (texto: string) => {
    if (conv.nueva) texto += "\n\n" + AVISO_PRIVACIDAD
    if (await deps.ferminEscribio(id, desde)) return
    const s = await deps.enviar(e.waId, texto)
    if (!s.ok) {
      const motivo = [...(s.error ?? "error desconocido")].slice(0, 200).join("")
      registrarError("whatsapp-webhook", "ENVIO", motivo)
      await pasar("DUDA_SIN_RESPUESTA", "No se pudo enviar", `No se pudo enviar la respuesta por WhatsApp: ${motivo}`)
      return
    }
    if (!s.wamid) { console.error("[whatsapp] envío sin wamid; no se registra la salida"); return }
    await rpc("wa_registrar_salida", { p_conversacion_id: id, p_wamid: s.wamid, p_autor: "AGENTE", p_texto: texto })
  }

  if (e.texto === "[audio]") return decir(MENSAJE_AUDIO)

  if (await sumar(0) >= deps.topeUsd) {
    await decir(MENSAJE_FIJO)
    await pasar("DUDA_SIN_RESPUESTA", "Tope de gasto de IA", "Se alcanzó el tope mensual de IA; contestar a mano")
    return
  }

  const t = await deps.responder(conv, deps.herramientas(id))
  // Primero se envía: la contabilidad no debe tumbar la respuesta al cliente.
  await decir(t.texto)
  try {
    if (t.modelo === "sonnet" && conv.modelo !== "sonnet") await deps.guardarModelo(id, "sonnet")
  } catch (err) { registrarError("whatsapp-webhook", "MODELO", err) }
  try { await sumar(t.usd) } catch (err) { registrarError("whatsapp-webhook", "USO", err) }
  if (t.fallo) await pasar("DUDA_SIN_RESPUESTA", "El agente no pudo responder", "El agente no pudo responder; contestar a mano")
}
