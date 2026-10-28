import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVISO_PRIVACIDAD, costoUsd, MENSAJE_FIJO, responder } from './cerebro.ts'

// Sin Deno en node: se simula la clave para que el módulo la lea como en producción.
;(globalThis as any).Deno = { env: { get: (k: string) => (k === 'ANTHROPIC_API_KEY' ? 'sk-prueba' : undefined) } }
const USO = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 500, cache_read_input_tokens: 2000 }
const turno = (o = {}) => ({ historial: [{ autor: 'CLIENTE' as const, texto: 'hola' }], modelo: 'haiku' as const, fundadorAbierta: true, nueva: false, ...o })
const resp = (content: unknown[], usage = USO, stop_reason = 'end_turn') => new Response(JSON.stringify({ content, usage, stop_reason }), { status: 200 })
const espia = () => {
  const llamadas: { body: any; headers: any }[] = []
  const h = {
    guardarProspecto: async (d: unknown) => { llamadas.push({ body: { guardar: d }, headers: null }); return 'guardado' },
    pasarAFermin: async () => 'ok',
    anotarPregunta: async () => 'ok',
  }
  return { h, llamadas }
}
function falso(respuestas: (() => Response | Promise<Response>)[]) {
  const cuerpos: any[] = []
  const f = (async (_u: string, init: RequestInit) => {
    cuerpos.push({ ...JSON.parse(init.body as string), _headers: init.headers })
    const r = respuestas.shift()!
    return r()
  }) as unknown as typeof fetch
  return { f, cuerpos }
}

test('costoUsd con los precios por millón', () => {
  assert.equal(costoUsd('haiku', { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 }), 0.1 + 0.5 + 0.2 + 0.01)
  assert.equal(costoUsd('sonnet', { input_tokens: 1e6, output_tokens: 1e6 }), 12)
})

test('solo texto: devuelve el texto, haiku y el costo del usage', async () => {
  const { f, cuerpos } = falso([() => resp([{ type: 'text', text: 'Hola' }])])
  const r = await responder(turno(), espia().h, f)
  assert.deepEqual(r, { texto: 'Hola', modelo: 'haiku', usd: costoUsd('haiku', USO), fallo: false })
  assert.equal(cuerpos[0].model, 'claude-haiku-5-5')
  assert.equal(cuerpos[0].max_tokens, 600)
  assert.equal(cuerpos[0].tools.length, 4)
})

test('guardar_prospecto llama la herramienta y manda el tool_result; usd acumula', async () => {
  const datos = { nombre: 'Ana', negocio: 'Tacos', cajas: 1, sucursales: 1, giro: null, ciudad: null, mensaje: null }
  const { f, cuerpos } = falso([
    () => resp([{ type: 'text', text: 'Anoto' }, { type: 'tool_use', id: 't1', name: 'guardar_prospecto', input: datos }]),
    () => resp([{ type: 'text', text: 'Listo' }]),
  ])
  const { h, llamadas } = espia()
  const r = await responder(turno(), h, f)
  assert.deepEqual(llamadas[0].body.guardar, datos)
  const ult = cuerpos[1].messages.at(-1)
  assert.equal(ult.role, 'user')
  assert.deepEqual(ult.content, [{ type: 'tool_result', tool_use_id: 't1', content: 'guardado' }])
  assert.equal(cuerpos[1].messages.at(-2).role, 'assistant')
  assert.equal(r.texto, 'Listo')
  assert.equal(r.usd, costoUsd('haiku', USO) * 2)
})

test('varias tool_use se responden en un solo mensaje y un error va con is_error', async () => {
  const { f, cuerpos } = falso([
    () => resp([{ type: 'tool_use', id: 'a', name: 'anotar_pregunta', input: { pregunta: 'x' } }, { type: 'tool_use', id: 'b', name: 'pasar_a_fermin', input: {} }]),
    () => resp([{ type: 'text', text: 'ok' }]),
  ])
  const h = { ...espia().h, anotarPregunta: async (): Promise<string> => { throw new Error('boom') } }
  const r = await responder(turno(), h, f)
  const ult = cuerpos[1].messages.at(-1).content
  assert.equal(ult.length, 2)
  assert.equal(ult[0].is_error, true)
  assert.equal(ult[0].tool_use_id, 'a')
  assert.equal(r.fallo, false)
})

test('escalar_modelo repite con sonnet y acumula el costo de ambos', async () => {
  const { f, cuerpos } = falso([
    () => resp([{ type: 'tool_use', id: 'e', name: 'escalar_modelo', input: {} }]),
    () => resp([{ type: 'text', text: 'Respuesta' }]),
  ])
  const r = await responder(turno(), espia().h, f)
  assert.equal(cuerpos[1].model, 'claude-sonnet-5-5')
  assert.equal(r.modelo, 'sonnet')
  assert.equal(r.usd, costoUsd('haiku', USO) + costoUsd('sonnet', USO))
})

test('fetch que lanza, 529 o 5 vueltas sin texto: mensaje fijo', async () => {
  const lanza = falso([() => { throw new Error('red') }])
  assert.deepEqual(await responder(turno(), espia().h, lanza.f), { texto: MENSAJE_FIJO, modelo: 'haiku', usd: 0, fallo: true })
  const e529 = falso([() => new Response('{}', { status: 529 })])
  assert.equal((await responder(turno(), espia().h, e529.f)).fallo, true)
  const bucle = falso(Array.from({ length: 5 }, () => () => resp([{ type: 'tool_use', id: 'x', name: 'anotar_pregunta', input: { pregunta: 'q' } }])))
  const r = await responder(turno(), espia().h, bucle.f)
  assert.equal(r.texto, MENSAJE_FIJO)
  assert.equal(r.fallo, true)
  assert.equal(bucle.cuerpos.length, 5)
})

test('nueva agrega el aviso de privacidad', async () => {
  const { f } = falso([() => resp([{ type: 'text', text: 'Hola' }])])
  const r = await responder(turno({ nueva: true }), espia().h, f)
  assert.ok(r.texto.endsWith(AVISO_PRIVACIDAD))
})

test('fundadorAbierta:false no incluye $499; el último bloque lleva cache 1h', async () => {
  const a = falso([() => resp([{ type: 'text', text: 'x' }])])
  await responder(turno({ fundadorAbierta: false }), espia().h, a.f)
  assert.ok(a.cuerpos[0].system.every((b: any) => !b.text.includes('$499')))
  assert.equal(a.cuerpos[0].system.length, 2)
  const b = falso([() => resp([{ type: 'text', text: 'x' }])])
  await responder(turno(), espia().h, b.f)
  assert.equal(b.cuerpos[0].system.length, 3)
  assert.deepEqual(b.cuerpos[0].system.at(-1).cache_control, { type: 'ephemeral', ttl: '1h' })
})

test('historial: une roles iguales, prefija a Fermín y descarta turnos iniciales que no son del cliente', async () => {
  const { f, cuerpos } = falso([() => resp([{ type: 'text', text: 'x' }])])
  await responder(turno({ historial: [
    { autor: 'FERMIN', texto: 'inicio' },
    { autor: 'CLIENTE', texto: 'a' },
    { autor: 'CLIENTE', texto: 'b' },
    { autor: 'FERMIN', texto: 'c' },
    { autor: 'AGENTE', texto: 'd' },
    { autor: 'CLIENTE', texto: 'e' },
  ] }), espia().h, f)
  assert.deepEqual(cuerpos[0].messages, [
    { role: 'user', content: 'a\nb' },
    { role: 'assistant', content: '(Fermín) c\nd' },
    { role: 'user', content: 'e' },
  ])
})

test('max_tokens con tool_use: no ejecuta y es fallo; con solo texto conserva el texto', async () => {
  const { h, llamadas } = espia()
  const datos = { nombre: 'Ana', negocio: 'T', cajas: 1, sucursales: 1 }
  const a = falso([() => resp([{ type: 'tool_use', id: 't', name: 'guardar_prospecto', input: datos }], USO, 'max_tokens')])
  const r = await responder(turno(), h, a.f)
  assert.equal(r.fallo, true)
  assert.equal(llamadas.length, 0)
  const b = falso([() => resp([{ type: 'text', text: 'Corto' }], USO, 'max_tokens')])
  const r2 = await responder(turno(), h, b.f)
  assert.deepEqual([r2.texto, r2.fallo], ['Corto', false])
})

test('entrada inválida: is_error con lo que falta y sin llamar al handler', async () => {
  const casos: [string, unknown][] = [
    ['guardar_prospecto', { nombre: ' ', negocio: 'T', cajas: 1.5, sucursales: 100 }],
    ['guardar_prospecto', { nombre: 'A', negocio: 'T', cajas: '2', sucursales: 0 }],
    ['pasar_a_fermin', { estado: 'OTRO', motivo: '', resumen: 'x' }],
    ['anotar_pregunta', { pregunta: 'x'.repeat(501) }],
    ['anotar_pregunta', {}],
  ]
  for (const [name, input] of casos) {
    const { f, cuerpos } = falso([() => resp([{ type: 'tool_use', id: 'i', name, input }]), () => resp([{ type: 'text', text: 'ok' }])])
    let llamado = false
    const h = { guardarProspecto: async () => { llamado = true; return '' }, pasarAFermin: async () => { llamado = true; return '' }, anotarPregunta: async () => { llamado = true; return '' } }
    const r = await responder(turno(), h, f)
    const tr = cuerpos[1].messages.at(-1).content[0]
    assert.equal(tr.is_error, true)
    assert.match(tr.content, /faltantes o inválidos/)
    assert.equal(llamado, false)
    assert.equal(r.fallo, false)
  }
})

test('texto largo: corta en el último fin de oración a ≤1500; sin fin, corte duro; el aviso va después', async () => {
  const a = falso([() => resp([{ type: 'text', text: 'Hola. ' + 'a'.repeat(1700) }])])
  assert.equal((await responder(turno(), espia().h, a.f)).texto, 'Hola.')
  const dura = falso([() => resp([{ type: 'text', text: 'b'.repeat(2000) }])])
  assert.equal((await responder(turno(), espia().h, dura.f)).texto.length, 1500)
  const n = falso([() => resp([{ type: 'text', text: 'c'.repeat(1400) + '. ' + 'd'.repeat(500) }])])
  const r = await responder(turno({ nueva: true }), espia().h, n.f)
  assert.equal(r.texto, 'c'.repeat(1400) + '.\n\n' + AVISO_PRIVACIDAD)
})

test('timeout (AbortError) va por fallo y el fetch lleva signal', async () => {
  let signal: unknown
  const f = (async (_u: string, init: RequestInit) => { signal = init.signal; throw new DOMException('t', 'AbortError') }) as unknown as typeof fetch
  const r = await responder(turno(), espia().h, f)
  assert.equal(r.fallo, true)
  assert.ok(signal instanceof AbortSignal)
})

test('historial vacío o que no termina en CLIENTE: fallo sin llamar a la API', async () => {
  for (const historial of [[], [{ autor: 'FERMIN' as const, texto: 'x' }], [{ autor: 'CLIENTE' as const, texto: 'a' }, { autor: 'AGENTE' as const, texto: 'b' }]]) {
    const { f, cuerpos } = falso([])
    const r = await responder(turno({ historial }), espia().h, f)
    assert.equal(r.fallo, true)
    assert.equal(cuerpos.length, 0)
  }
})

test('sin ANTHROPIC_API_KEY: fallo sin llamar a fetch', async () => {
  const D = (globalThis as any).Deno
  ;(globalThis as any).Deno = { env: { get: () => undefined } }
  try {
    const { f, cuerpos } = falso([])
    assert.equal((await responder(turno(), espia().h, f)).fallo, true)
    assert.equal(cuerpos.length, 0)
  } finally { (globalThis as any).Deno = D }
})
