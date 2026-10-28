import { test } from "node:test"
import assert from "node:assert/strict"
import { atenderMensaje, type DepsTurno, MENSAJE_AUDIO } from "./turno.ts"
import { AVISO_PRIVACIDAD, MENSAJE_FIJO } from "./cerebro.ts"

const ev = (texto = "hola", waId = "5214771234567") => ({ tipo: "mensaje" as const, waId, wamid: "w1", nombre: "Ana", texto })
const R = { conversacion_id: "c1", responder: true }

type Opc = {
  nueva?: boolean; masNuevo?: boolean; cupo?: boolean; ferminEscribio?: boolean; usdMes?: number; cruzo80?: boolean
  fallo?: boolean; modelo?: "haiku" | "sonnet"; modeloConv?: "haiku" | "sonnet"; envio?: { ok: boolean; wamid: string | null; error?: string }
  durante?: (d: DepsTurno) => Promise<void> // lo que pasa "durante" responder (p. ej. una herramienta)
  historial?: { autor: "CLIENTE" | "AGENTE" | "FERMIN"; texto: string }[]
}

function hacer(o: Opc = {}) {
  const llamadas: string[] = []
  const rpcs: { fn: string; args: any }[] = []
  const turnos: any[] = []
  const modelos: string[] = []
  const deps: DepsTurno = {
    rpc: async (fn, args) => {
      rpcs.push({ fn, args })
      const data = fn === "wa_sumar_uso" ? { usd_mes: args.p_usd === 0 ? (o.usdMes ?? 0) : 1, cruzo_80: o.cruzo80 ?? false } : true
      return { data, error: null }
    },
    leerConversacion: async () => ({ historial: o.historial ?? [], modelo: o.modeloConv ?? "haiku", fundadorAbierta: true, nueva: o.nueva ?? false }),
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
    numeroFermin: "5214779999999",
    esperar: async (ms) => { llamadas.push("esperar:" + ms) },
    hayMasNuevo: async () => o.masNuevo ?? false,
  }
  return { deps, llamadas, rpcs, turnos, modelos }
}

test("responder:false no contesta", async () => {
  const { deps, llamadas } = hacer()
  await atenderMensaje(ev(), { ...R, responder: false }, deps)
  assert.deepEqual(llamadas, [])
})
test("cupo agotado no llama a responder", async () => {
  const { deps, llamadas } = hacer({ cupo: false })
  await atenderMensaje(ev(), R, deps)
  assert.deepEqual(llamadas.filter((l) => !l.startsWith("esperar")), [])
})
test("audio: pide texto y no responde", async () => {
  const { deps, llamadas } = hacer()
  await atenderMensaje(ev("[audio]"), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "enviar:" + MENSAJE_AUDIO])
})
test("audio al final de una ráfaga con texto: contesta el cerebro, no el mensaje de audio", async () => {
  const { deps, llamadas } = hacer({ historial: [
    { autor: "AGENTE", texto: "¡Hola!" },
    { autor: "CLIENTE", texto: "¿Cuánto cuesta para una taquería?" },
    { autor: "CLIENTE", texto: "[audio]" },
  ] })
  await atenderMensaje(ev("[audio]"), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "responder", "enviar:listo"])
})
test("lo que Fermín ya contestó no cuenta: un audio después de su mensaje pide texto", async () => {
  const { deps, llamadas } = hacer({ historial: [
    { autor: "CLIENTE", texto: "¿Cuánto cuesta?" },
    { autor: "FERMIN", texto: "Te marco en un rato" },
    { autor: "CLIENTE", texto: "[audio]" },
  ] })
  await atenderMensaje(ev("[audio]"), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "enviar:" + MENSAJE_AUDIO])
})
test("solo audios sin contestar: pide texto", async () => {
  const { deps, llamadas } = hacer({ historial: [
    { autor: "AGENTE", texto: "¡Hola!" },
    { autor: "CLIENTE", texto: "[audio]" },
    { autor: "CLIENTE", texto: "[audio]" },
  ] })
  await atenderMensaje(ev("[audio]"), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "enviar:" + MENSAJE_AUDIO])
})
test("Fermín escribió durante el turno: no envía", async () => {
  const { deps, llamadas } = hacer({ ferminEscribio: true })
  await atenderMensaje(ev(), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "responder"])
})
test("el agente pasa a Fermín durante el turno (pausa propia): la respuesta SÍ se envía", async () => {
  // ferminEscribio solo cuenta mensajes FERMIN: la pausa de pasar_a_fermin no los crea.
  const { deps, llamadas, rpcs } = hacer({
    durante: async (d) => { await d.rpc("wa_pasar_a_fermin", { p_conversacion_id: "c1", p_estado: "PROSPECTO_CALIENTE", p_motivo: "m", p_resumen: "r" }) },
  })
  await atenderMensaje(ev(), R, deps)
  assert.ok(llamadas.includes("enviar:listo"))
  assert.ok(rpcs.some((r) => r.fn === "wa_registrar_salida"))
})
test("ferminEscribio recibe el inicio del turno", async () => {
  const antes = new Date()
  const { deps } = hacer()
  let desde: Date | null = null
  deps.ferminEscribio = async (_id, d) => { desde = d; return false }
  await atenderMensaje(ev(), R, deps)
  assert.ok(desde! >= antes && desde! <= new Date())
})
test("fallo: envía el mensaje fijo y pasa a Fermín", async () => {
  const { deps, llamadas, rpcs } = hacer({ fallo: true })
  await atenderMensaje(ev(), R, deps)
  assert.ok(llamadas.includes("enviar:" + MENSAJE_FIJO))
  assert.equal(rpcs.find((r) => r.fn === "wa_pasar_a_fermin")?.args.p_estado, "DUDA_SIN_RESPUESTA")
})
test("tope alcanzado: mensaje fijo sin responder", async () => {
  const { deps, llamadas, rpcs } = hacer({ usdMes: 100 })
  await atenderMensaje(ev(), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "enviar:" + MENSAJE_FIJO])
  assert.ok(rpcs.some((r) => r.fn === "wa_pasar_a_fermin"))
})
test("escalada a sonnet se guarda; si ya era sonnet o sigue en haiku, no", async () => {
  const a = hacer({ modelo: "sonnet" }); await atenderMensaje(ev(), R, a.deps); assert.deepEqual(a.modelos, ["sonnet"])
  const b = hacer({ modelo: "sonnet", modeloConv: "sonnet" }); await atenderMensaje(ev(), R, b.deps); assert.deepEqual(b.modelos, [])
  const c = hacer(); await atenderMensaje(ev(), R, c.deps); assert.deepEqual(c.modelos, [])
})
test("envío fallido: se pasa a Fermín con el motivo y no se registra salida", async () => {
  const { deps, rpcs } = hacer({ envio: { ok: false, wamid: null, error: "token vencido" } })
  await atenderMensaje(ev(), R, deps)
  const p = rpcs.find((r) => r.fn === "wa_pasar_a_fermin")!.args
  assert.deepEqual([p.p_conversacion_id, p.p_estado, p.p_motivo], ["c1", "DUDA_SIN_RESPUESTA", "No se pudo enviar"])
  assert.match(p.p_resumen, /token vencido/)
  assert.ok(!rpcs.some((r) => r.fn === "wa_registrar_salida"))
})
test("envío ok sin wamid: no se registra salida ni se pasa a Fermín", async () => {
  const { deps, rpcs } = hacer({ envio: { ok: true, wamid: null } })
  await atenderMensaje(ev(), R, deps)
  assert.ok(!rpcs.some((r) => r.fn === "wa_registrar_salida" || r.fn === "wa_pasar_a_fermin"))
})
test("cruzó 80 %: aviso general sin conversación", async () => {
  const { deps, rpcs } = hacer({ cruzo80: true })
  await atenderMensaje(ev(), R, deps)
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
  await atenderMensaje(ev(), R, deps)
  assert.ok(rpcs.some((r) => r.fn === "wa_pasar_a_fermin" && r.args.p_conversacion_id === null))
})
test("envío ok: wa_registrar_salida con AGENTE y el wamid devuelto", async () => {
  const { deps, rpcs } = hacer()
  await atenderMensaje(ev(), R, deps)
  const s = rpcs.find((r) => r.fn === "wa_registrar_salida")!.args
  assert.deepEqual(s, { p_conversacion_id: "c1", p_wamid: "out1", p_autor: "AGENTE", p_texto: "listo" })
})
test("ráfaga: espera 4 s y, si llegó otro mensaje del cliente, este turno no contesta ni gasta cupo", async () => {
  const { deps, llamadas, rpcs } = hacer({ masNuevo: true })
  let cupo = 0
  deps.cupo = async () => { cupo++; return true }
  let pregunta: unknown[] = []
  deps.hayMasNuevo = async (id, wamid) => { pregunta = [id, wamid]; return true }
  await atenderMensaje(ev(), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000"])
  assert.deepEqual(pregunta, ["c1", "w1"])
  assert.equal(cupo, 0)
  assert.equal(rpcs.length, 0)
})
test("ráfaga: el turno del último mensaje sí contesta", async () => {
  const { deps, llamadas } = hacer()
  await atenderMensaje(ev(), R, deps)
  assert.deepEqual(llamadas, ["esperar:4000", "responder", "enviar:listo"])
})
test("mensaje del propio número de Fermín (con o sin 1 tras el 52): se registra pero no se contesta", async () => {
  for (const waId of ["5214779999999", "524779999999"]) {
    const { deps, llamadas, rpcs } = hacer()
    await atenderMensaje(ev("ok, gracias", waId), R, deps)
    assert.deepEqual(llamadas, [])
    assert.equal(rpcs.length, 0)
  }
})
test("conversación nueva: el aviso de privacidad va en la respuesta, en el audio y en el mensaje fijo", async () => {
  const a = hacer({ nueva: true }); await atenderMensaje(ev(), R, a.deps)
  assert.ok(a.llamadas.includes("enviar:listo\n\n" + AVISO_PRIVACIDAD))
  const b = hacer({ nueva: true }); await atenderMensaje(ev("[audio]"), R, b.deps)
  assert.deepEqual(b.llamadas.at(-1), "enviar:" + MENSAJE_AUDIO + "\n\n" + AVISO_PRIVACIDAD)
  const c = hacer({ nueva: true, usdMes: 100 }); await atenderMensaje(ev(), R, c.deps)
  assert.deepEqual(c.llamadas.at(-1), "enviar:" + MENSAJE_FIJO + "\n\n" + AVISO_PRIVACIDAD)
  const d = hacer({ nueva: true, fallo: true }); await atenderMensaje(ev(), R, d.deps)
  assert.ok(d.llamadas.includes("enviar:" + MENSAJE_FIJO + "\n\n" + AVISO_PRIVACIDAD))
  const e = hacer(); await atenderMensaje(ev(), R, e.deps)
  assert.ok(e.llamadas.includes("enviar:listo"))
})
test("si guardarModelo o wa_sumar_uso fallan después de responder, la respuesta ya salió y no lanza", async () => {
  const { deps, llamadas } = hacer({ modelo: "sonnet" })
  deps.guardarModelo = async () => { throw new Error("bd caída") }
  const rpc = deps.rpc
  deps.rpc = async (fn, args) => fn === "wa_sumar_uso" && args.p_usd !== 0 ? { data: null, error: { message: "bd caída" } } : rpc(fn, args)
  await atenderMensaje(ev(), R, deps)
  assert.ok(llamadas.includes("enviar:listo"))
})
test("el log de cupo agotado no lleva el número del cliente", async () => {
  const { deps } = hacer({ cupo: false })
  const err = console.error
  const logs: string[] = []
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")) }
  try { await atenderMensaje(ev(), R, deps) } finally { console.error = err }
  assert.ok(logs.length === 1 && !logs[0].includes("4771234567"), logs[0])
})
