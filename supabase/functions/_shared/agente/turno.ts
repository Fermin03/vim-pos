// Un turno del agente de WhatsApp: registra el mensaje, decide si contesta, llama al cerebro y envía.
// Todo lo externo entra por `deps`, así que se prueba con node --test sin red ni base.
import { type Herramientas, MENSAJE_FIJO, type responder, type Turno } from "./cerebro.ts"
import type { Evento } from "../whatsapp/aviso-meta.ts"
import type { ClienteRpc } from "../limite.ts"

export type DepsTurno = {
  rpc: ClienteRpc["rpc"]
  leerConversacion(id: string): Promise<{ historial: Turno["historial"]; modelo: "haiku" | "sonnet"; fundadorAbierta: boolean }>
  responder: typeof responder
  enviar: (waId: string, texto: string) => Promise<{ ok: boolean; wamid: string | null }>
  cupo: (waId: string) => Promise<boolean>
  pausada: (conversacionId: string) => Promise<boolean>
  herramientas: (conversacionId: string) => Herramientas
  topeUsd: number
}

export const MENSAJE_AUDIO = "No puedo escuchar audios, ¿me lo escribes?"

export async function atenderMensaje(e: Extract<Evento, { tipo: "mensaje" }>, deps: DepsTurno): Promise<void> {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await deps.rpc(fn, args)
    if (error) throw new Error(`${fn}: ${error.message}`)
    return data as any
  }
  const r = await rpc("wa_registrar_entrante", { p_wa_id: e.waId, p_wamid: e.wamid, p_nombre: e.nombre, p_texto: e.texto })
  if (!r.responder) return
  if (!await deps.cupo(e.waId)) { console.error("[whatsapp] cupo agotado", e.waId); return }

  const id: string = r.conversacion_id
  const pasar = (estado: string, motivo: string, resumen: string) =>
    rpc("wa_pasar_a_fermin", { p_conversacion_id: id, p_estado: estado, p_motivo: motivo, p_resumen: resumen })
  // Fermín puede haber escrito mientras el modelo pensaba: se vuelve a mirar justo antes de enviar.
  const decir = async (texto: string) => {
    if (await deps.pausada(id)) return
    const s = await deps.enviar(e.waId, texto)
    if (s.ok && s.wamid) await rpc("wa_registrar_salida", { p_conversacion_id: id, p_wamid: s.wamid, p_autor: "AGENTE", p_texto: texto })
  }

  if (e.texto === "[audio]") return decir(MENSAJE_AUDIO)

  const antes = await rpc("wa_sumar_uso", { p_usd: 0, p_tope: deps.topeUsd })
  if (Number(antes.usd_mes) >= deps.topeUsd) {
    await decir(MENSAJE_FIJO)
    await pasar("DUDA_SIN_RESPUESTA", "Tope de gasto de IA", "Se alcanzó el tope mensual de IA; contestar a mano")
    return
  }

  const conv = await deps.leerConversacion(id)
  const t = await deps.responder({ ...conv, nueva: !!r.nueva }, deps.herramientas(id))
  const uso = await rpc("wa_sumar_uso", { p_usd: t.usd, p_tope: deps.topeUsd })
  // Aviso general (sin conversación): wa_pasar_a_fermin con id NULL solo inserta el aviso.
  if (uso.cruzo_80) {
    await rpc("wa_pasar_a_fermin", { p_conversacion_id: null, p_estado: "ACTIVA", p_motivo: "Gasto de IA", p_resumen: "Claude va en 80 % del tope del mes" })
  }
  await decir(t.texto)
  if (t.fallo) await pasar("DUDA_SIN_RESPUESTA", "El agente no pudo responder", "El agente no pudo responder; contestar a mano")
}
