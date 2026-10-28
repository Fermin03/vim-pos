import { test } from "node:test"
import assert from "node:assert/strict"
import { atenderMensaje, type DepsTurno, MENSAJE_AUDIO } from "./turno.ts"
import { MENSAJE_FIJO } from "./cerebro.ts"

const ev = (texto = "hola") => ({ tipo: "mensaje" as const, waId: "5214771234567", wamid: "w1", nombre: "Ana", texto })

function hacer(o: { entrante?: object; cupo?: boolean; pausada?: boolean; usdMes?: number; fallo?: boolean } = {}) {
  const llamadas: string[] = []
  const rpcs: { fn: string; args: any }[] = []
  const deps: DepsTurno = {
    rpc: async (fn, args) => {
      rpcs.push({ fn, args })
      const data = fn === "wa_registrar_entrante" ? { conversacion_id: "c1", duplicado: false, nueva: false, responder: true, ...o.entrante }
        : fn === "wa_sumar_uso" ? { usd_mes: args.p_usd === 0 ? (o.usdMes ?? 0) : 1, cruzo_80: false } : true
      return { data, error: null }
    },
    leerConversacion: async () => ({ historial: [], modelo: "haiku", fundadorAbierta: true }),
    responder: async () => { llamadas.push("responder"); return { texto: o.fallo ? MENSAJE_FIJO : "listo", modelo: "haiku", usd: 0.01, fallo: !!o.fallo } },
    enviar: async (_w, texto) => { llamadas.push("enviar:" + texto); return { ok: true, wamid: "out1" } },
    cupo: async () => o.cupo ?? true,
    pausada: async () => o.pausada ?? false,
    herramientas: () => ({} as any),
    topeUsd: 100,
  }
  return { deps, llamadas, rpcs }
}

test("responder:false no contesta", async () => {
  const { deps, llamadas } = hacer({ entrante: { responder: false } })
  await atenderMensaje(ev(), deps)
  assert.deepEqual(llamadas, [])
})
test("cupo agotado no llama a responder", async () => {
  const { deps, llamadas } = hacer({ cupo: false })
  await atenderMensaje(ev(), deps)
  assert.deepEqual(llamadas, [])
})
test("audio: pide texto y no responde", async () => {
  const { deps, llamadas } = hacer()
  await atenderMensaje(ev("[audio]"), deps)
  assert.deepEqual(llamadas, ["enviar:" + MENSAJE_AUDIO])
})
test("pausada antes de enviar: no envía", async () => {
  const { deps, llamadas } = hacer({ pausada: true })
  await atenderMensaje(ev(), deps)
  assert.deepEqual(llamadas, ["responder"])
})
test("fallo: envía el mensaje fijo y pasa a Fermín", async () => {
  const { deps, llamadas, rpcs } = hacer({ fallo: true })
  await atenderMensaje(ev(), deps)
  assert.ok(llamadas.includes("enviar:" + MENSAJE_FIJO))
  assert.equal(rpcs.find((r) => r.fn === "wa_pasar_a_fermin")?.args.p_estado, "DUDA_SIN_RESPUESTA")
})
test("tope alcanzado: mensaje fijo sin responder", async () => {
  const { deps, llamadas, rpcs } = hacer({ usdMes: 100 })
  await atenderMensaje(ev(), deps)
  assert.deepEqual(llamadas, ["enviar:" + MENSAJE_FIJO])
  assert.ok(rpcs.some((r) => r.fn === "wa_pasar_a_fermin"))
})
