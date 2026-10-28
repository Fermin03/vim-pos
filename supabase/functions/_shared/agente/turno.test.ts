import { test } from "node:test"
import assert from "node:assert/strict"
import { atenderMensaje, type DepsTurno, MENSAJE_AUDIO } from "./turno.ts"
import { MENSAJE_FIJO } from "./cerebro.ts"

const ev = (texto = "hola") => ({ tipo: "mensaje" as const, waId: "5214771234567", wamid: "w1", nombre: "Ana", texto })

type Opc = {
  entrante?: object; cupo?: boolean; ferminEscribio?: boolean; usdMes?: number; cruzo80?: boolean
  fallo?: boolean; modelo?: "haiku" | "sonnet"; modeloConv?: "haiku" | "sonnet"; envio?: { ok: boolean; wamid: string | null; error?: string }
  durante?: (d: DepsTurno) => Promise<void> // lo que pasa "durante" responder (p. ej. una herramienta)
}

function hacer(o: Opc = {}) {
  const llamadas: string[] = []
  const rpcs: { fn: string; args: any }[] = []
  const turnos: any[] = []
  const modelos: string[] = []
  const deps: DepsTurno = {
    rpc: async (fn, args) => {
      rpcs.push({ fn, args })
      const data = fn === "wa_registrar_entrante" ? { conversacion_id: "c1", duplicado: false, nueva: false, responder: true, ...o.entrante }
        : fn === "wa_sumar_uso" ? { usd_mes: args.p_usd === 0 ? (o.usdMes ?? 0) : 1, cruzo_80: o.cruzo80 ?? false } : true
      return { data, error: null }
    },
    leerConversacion: async () => ({ historial: [], modelo: o.modeloConv ?? "haiku", fundadorAbierta: true }),
    responder: async (t) => {
      llamadas.push("responder"); turnos.push(t)
      await o.durante?.(deps)
      return { texto: o.fallo ? MENSAJE_FIJO : "listo", modelo: o.modelo ?? "haiku", usd: 0.01, fallo: !!o.fallo }
    },
    enviar: async (_w, texto) => { llamadas.push("enviar:" + texto); return o.envio ?? { ok: true, wamid: "out1" } },
    cupo: async () => o.cupo ?? true,
    ferminEscribio: async () => o.ferminEscribio ?? false,
    guardarModelo: async (_id, m) => { modelos.push(m) },
    herramientas: () => ({} as any),
    topeUsd: 100,
  }
  return { deps, llamadas, rpcs, turnos, modelos }
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
test("Fermín escribió durante el turno: no envía", async () => {
  const { deps, llamadas } = hacer({ ferminEscribio: true })
  await atenderMensaje(ev(), deps)
  assert.deepEqual(llamadas, ["responder"])
})
test("el agente pasa a Fermín durante el turno (pausa propia): la respuesta SÍ se envía", async () => {
  // ferminEscribio solo cuenta mensajes FERMIN: la pausa de pasar_a_fermin no los crea.
  const { deps, llamadas, rpcs } = hacer({
    durante: async (d) => { await d.rpc("wa_pasar_a_fermin", { p_conversacion_id: "c1", p_estado: "PROSPECTO_CALIENTE", p_motivo: "m", p_resumen: "r" }) },
  })
  await atenderMensaje(ev(), deps)
  assert.ok(llamadas.includes("enviar:listo"))
  assert.ok(rpcs.some((r) => r.fn === "wa_registrar_salida"))
})
test("ferminEscribio recibe el inicio del turno", async () => {
  const antes = new Date()
  const { deps } = hacer()
  let desde: Date | null = null
  deps.ferminEscribio = async (_id, d) => { desde = d; return false }
  await atenderMensaje(ev(), deps)
  assert.ok(desde! >= antes && desde! <= new Date())
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
test("escalada a sonnet se guarda; si ya era sonnet o sigue en haiku, no", async () => {
  const a = hacer({ modelo: "sonnet" }); await atenderMensaje(ev(), a.deps); assert.deepEqual(a.modelos, ["sonnet"])
  const b = hacer({ modelo: "sonnet", modeloConv: "sonnet" }); await atenderMensaje(ev(), b.deps); assert.deepEqual(b.modelos, [])
  const c = hacer(); await atenderMensaje(ev(), c.deps); assert.deepEqual(c.modelos, [])
})
test("envío fallido: se pasa a Fermín con el motivo y no se registra salida", async () => {
  const { deps, rpcs } = hacer({ envio: { ok: false, wamid: null, error: "token vencido" } })
  await atenderMensaje(ev(), deps)
  const p = rpcs.find((r) => r.fn === "wa_pasar_a_fermin")!.args
  assert.deepEqual([p.p_conversacion_id, p.p_estado, p.p_motivo], ["c1", "DUDA_SIN_RESPUESTA", "No se pudo enviar"])
  assert.match(p.p_resumen, /token vencido/)
  assert.ok(!rpcs.some((r) => r.fn === "wa_registrar_salida"))
})
test("envío ok sin wamid: no se registra salida ni se pasa a Fermín", async () => {
  const { deps, rpcs } = hacer({ envio: { ok: true, wamid: null } })
  await atenderMensaje(ev(), deps)
  assert.ok(!rpcs.some((r) => r.fn === "wa_registrar_salida" || r.fn === "wa_pasar_a_fermin"))
})
test("cruzó 80 %: aviso general sin conversación", async () => {
  const { deps, rpcs } = hacer({ cruzo80: true })
  await atenderMensaje(ev(), deps)
  const avisos = rpcs.filter((r) => r.fn === "wa_pasar_a_fermin")
  assert.ok(avisos.length >= 1)
  for (const { args } of avisos) {
    assert.equal(args.p_conversacion_id, null)
    assert.equal(args.p_motivo, "Gasto de IA")
    assert.equal(args.p_resumen, "Claude va en 80 % del tope del mes")
  }
})
test("cruzo_80 de la primera suma (usd 0) tampoco se pierde", async () => {
  const { deps, rpcs } = hacer({ cruzo80: true, usdMes: 100 }) // tope: se sale tras la primera suma
  await atenderMensaje(ev(), deps)
  assert.ok(rpcs.some((r) => r.fn === "wa_pasar_a_fermin" && r.args.p_conversacion_id === null))
})
test("conversación nueva llega a responder con nueva:true", async () => {
  const a = hacer({ entrante: { nueva: true } }); await atenderMensaje(ev(), a.deps); assert.equal(a.turnos[0].nueva, true)
  const b = hacer(); await atenderMensaje(ev(), b.deps); assert.equal(b.turnos[0].nueva, false)
})
test("envío ok: wa_registrar_salida con AGENTE y el wamid devuelto", async () => {
  const { deps, rpcs } = hacer()
  await atenderMensaje(ev(), deps)
  const s = rpcs.find((r) => r.fn === "wa_registrar_salida")!.args
  assert.deepEqual(s, { p_conversacion_id: "c1", p_wamid: "out1", p_autor: "AGENTE", p_texto: "listo" })
})
