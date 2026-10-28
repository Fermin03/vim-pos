import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPropuestas, proponer } from './revisor.ts'

const prop = (o: Record<string, unknown> = {}) => ({
  tipo: 'DUDA', comercial: false, pregunta: '¿Hacen envíos?', texto: 'Sí, en León.', evidencia: 'Cliente preguntó y Fermín contestó.',
  escenario: { turnos: ['¿Hacen envíos?'], criterios: ['Responde según la lección.'] }, conversacion_id: null, ...o,
})

test('filtrarPropuestas: 7 válidas se cortan a 5', () => {
  const r = filtrarPropuestas({ propuestas: Array.from({ length: 7 }, (_, i) => prop({ texto: `t${i}` })) })
  assert.equal(r.length, 5)
  assert.equal(r[0].texto, 't0')
})

test('filtrarPropuestas: teléfono o correo en texto, pregunta o evidencia la descarta', () => {
  const r = filtrarPropuestas({ propuestas: [
    prop({ evidencia: 'Llamó al 4771234567' }),
    prop({ evidencia: 'Llamó al 477 123 4567' }),
    prop({ texto: 'Escribe a juan@correo.com' }),
    prop({ pregunta: '¿Y a 5214771234567?' }),
    prop({ texto: 'Cuesta $699 al mes' }),
  ] })
  assert.equal(r.length, 1)
  assert.equal(r[0].texto, 'Cuesta $699 al mes')
})

test('filtrarPropuestas: tipo inválido, largos y forma incorrecta quedan fuera', () => {
  const r = filtrarPropuestas({ propuestas: [
    prop({ tipo: 'OTRO' }),
    prop({ texto: 'x'.repeat(2001) }),
    prop({ evidencia: 'x'.repeat(1001) }),
    prop({ texto: '' }),
    prop({ comercial: 'sí' }),
    prop({ pregunta: null }), // DUDA sin pregunta
    prop({ escenario: { turnos: [], criterios: ['c'] } }),
    prop({ escenario: null }),
    null,
    'basura',
    prop({ tipo: 'TONO', pregunta: null, texto: 'Ante prisa, sé breve.' }),
  ] })
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, 'TONO')
  assert.equal(r[0].pregunta, null)
})

test('filtrarPropuestas: conversacion_id solo si es texto; basura y null dan []', () => {
  assert.equal(filtrarPropuestas({ propuestas: [prop({ conversacion_id: 7 })] })[0].conversacion_id, null)
  assert.equal(filtrarPropuestas({ propuestas: [prop({ conversacion_id: 'abc' })] })[0].conversacion_id, 'abc')
  for (const malo of [null, undefined, 'x', 3, [], {}, { propuestas: 'no' }, { propuestas: null }]) assert.deepEqual(filtrarPropuestas(malo), [])
})

const ctx = { conocimiento: 'CONOCIMIENTO', aprendido: '' }
const resp = (cuerpo: unknown, status = 200) => (async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch

test('proponer: extrae el JSON envuelto en prosa e ignora bloques de pensamiento', async () => {
  const texto = 'Claro, aquí van:\n```json\n' + JSON.stringify({ propuestas: [prop()] }) + '\n```\nListo.'
  const r = await proponer('conv', ctx, 'clave', resp({ content: [{ type: 'thinking', thinking: '{"propuestas":[]}' }, { type: 'text', text: texto }] }))
  assert.equal(r.length, 1)
  assert.equal(r[0].tipo, 'DUDA')
})

test('proponer: envía el modelo, el tope y la clave', async () => {
  let visto: { url: string; init: RequestInit } | null = null
  const f = (async (url: string, init: RequestInit) => {
    visto = { url, init }
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"propuestas":[]}' }] }))
  }) as unknown as typeof fetch
  await proponer('CONVERSACIONES', { conocimiento: 'SABER', aprendido: 'APRENDIDO' }, 'k', f)
  const cuerpo = JSON.parse(String(visto!.init.body))
  assert.equal(cuerpo.model, 'claude-sonnet-5-5')
  assert.equal(cuerpo.max_tokens, 8192)
  assert.equal((visto!.init.headers as Record<string, string>)['x-api-key'], 'k')
  assert.ok(JSON.stringify(cuerpo).includes('SABER') && JSON.stringify(cuerpo).includes('APRENDIDO') && JSON.stringify(cuerpo).includes('CONVERSACIONES'))
})

test('proponer: HTTP 500, red caída, texto sin JSON o sin clave dan []', async () => {
  const mudo = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await proponer('c', ctx, 'k', resp({}, 500)), [])
    assert.deepEqual(await proponer('c', ctx, 'k', (async () => { throw new Error('red') }) as unknown as typeof fetch), [])
    assert.deepEqual(await proponer('c', ctx, 'k', resp({ content: [{ type: 'text', text: 'no hay nada' }] })), [])
    assert.deepEqual(await proponer('c', ctx, '', resp({ content: [] })), [])
  } finally { console.error = mudo }
})
