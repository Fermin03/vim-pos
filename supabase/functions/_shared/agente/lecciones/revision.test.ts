import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atenderFermin, interpretar, textoLeccion, type DepsRevision, type Leccion } from './revision.ts'

const lec = (id: string, o: Partial<Leccion> = {}): Leccion => ({
  id, tipo: 'DUDA', comercial: false, pregunta: '¿Hacen envíos?', texto: 'Sí, en León.', evidencia: 'Cliente preguntó y no supimos.',
  estado: 'PENDIENTE', orden: null, wamid_envio: null, wamid_confirmacion: null, ...o,
})

// Deps en memoria: guarda las lecciones y lo enviado.
function fake(ls: Leccion[]) {
  const enviados: string[] = []
  let n = 0
  const deps: DepsRevision = {
    lecciones: async (estados) => ls.filter((l) => estados.includes(l.estado)),
    actualizar: async (id, c) => { Object.assign(ls.find((l) => l.id === id)!, c) },
    enviar: async (t) => { enviados.push(t); return { ok: true, wamid: 'out' + ++n } },
    ahora: () => new Date('2026-10-28T12:00:00Z'),
  }
  return { ls, enviados, deps }
}
const msg = (texto: string, respondeA: string | null = null) => ({ wamid: 'in', texto, respondeA })
const enviadas = (...ids: string[]) => ids.map((id, i) => lec(id, { estado: 'ENVIADA', orden: i + 1, wamid_envio: 'w' + id }))

test('interpretar: cada forma', () => {
  assert.deepEqual(interpretar(' VER '), { accion: 'VER' })
  for (const t of ['sí', 'SI', 'Sí.', 'va', 'OK!']) assert.deepEqual(interpretar(t), { accion: 'SI', numero: null })
  assert.deepEqual(interpretar('No'), { accion: 'NO', numero: null })
  assert.deepEqual(interpretar('QUITAR'), { accion: 'QUITAR', numero: null })
  assert.deepEqual(interpretar('SÍ 2'), { accion: 'SI', numero: 2 })
  assert.deepEqual(interpretar('2 sí'), { accion: 'SI', numero: 2 })
  assert.deepEqual(interpretar('no 3'), { accion: 'NO', numero: 3 })
  assert.deepEqual(interpretar('2: Di que sí hay envíos'), { accion: 'CORRECCION', numero: 2, texto: 'Di que sí hay envíos' })
  assert.deepEqual(interpretar('Mejor di que no'), { accion: 'CORRECCION', numero: null, texto: 'Mejor di que no' })
})

test('textoLeccion: formato fijo', () => {
  assert.equal(
    textoLeccion(lec('a', { tipo: 'PREGUNTA', comercial: true }), 2, 3),
    '*Lección 2 de 3 · Pregunta sin respuesta · Comercial*\nCliente preguntó y no supimos.\nEl agente aprendería: «Sí, en León.»\nResponde *SÍ*, *NO* o escribe la corrección.',
  )
  assert.match(textoLeccion(lec('a', { tipo: 'TONO' }), 1, 1), /^\*Lección 1 de 1 · Tono\*\n/)
})

test('VER manda 3 mensajes y marca ENVIADA con orden 1..3', async () => {
  const f = fake([lec('a'), lec('b'), lec('c')])
  await atenderFermin(msg('ver'), f.deps)
  assert.equal(f.enviados.length, 3)
  assert.match(f.enviados[1], /^\*Lección 2 de 3/)
  assert.deepEqual(f.ls.map((l) => [l.estado, l.orden, l.wamid_envio]), [['ENVIADA', 1, 'out1'], ['ENVIADA', 2, 'out2'], ['ENVIADA', 3, 'out3']])
})

test('VER manda máximo 5 y sin pendientes no contesta', async () => {
  const f = fake(Array.from({ length: 7 }, (_, i) => lec('p' + i)))
  await atenderFermin(msg('VER'), f.deps)
  assert.equal(f.enviados.length, 5)
  assert.equal(f.ls.filter((l) => l.estado === 'PENDIENTE').length, 2)
  const v = fake([])
  await atenderFermin(msg('VER'), v.deps)
  assert.equal(v.enviados.length, 0)
})

test('sí deslizado aprueba la correcta; no descarta', async () => {
  const f = fake(enviadas('a', 'b', 'c'))
  await atenderFermin(msg('sí', 'wb'), f.deps)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA', 'ENVIADA'])
  assert.equal(f.ls[1].decidido_en, '2026-10-28T12:00:00.000Z')
  await atenderFermin(msg('no', 'wc'), f.deps)
  assert.equal(f.ls[2].estado, 'DESCARTADA')
  assert.equal(f.enviados.length, 0)
})

test('corrección aprueba con ese texto', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('Mejor di que enviamos a todo León', 'wa'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.ls[0].texto], ['APROBADA', 'Mejor di que enviamos a todo León'])
})

test('«SÍ 2» sin deslizar aprueba la 2', async () => {
  const f = fake(enviadas('a', 'b', 'c'))
  await atenderFermin(msg('SÍ 2'), f.deps)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA', 'ENVIADA'])
})

test('«sí» sin deslizar con 2 esperando: pide deslizar y no cambia nada', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('sí'), f.deps)
  assert.deepEqual(f.enviados, ['Desliza el mensaje de la lección y contesta ahí (o escribe el número: «SÍ 2»).'])
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'ENVIADA'])
})

test('«gracias» sin ENVIADA no envía nada; con una sola ENVIADA y sin deslizar, aplica a esa', async () => {
  const f = fake([lec('a', { estado: 'APROBADA' })])
  await atenderFermin(msg('gracias'), f.deps)
  await atenderFermin(msg('sí'), f.deps)
  assert.equal(f.enviados.length, 0)
  const g = fake(enviadas('a'))
  await atenderFermin(msg('sí'), g.deps)
  assert.equal(g.ls[0].estado, 'APROBADA')
})

test('corrección con teléfono o correo no se guarda y avisa', async () => {
  for (const t of ['Llama al 4771234567', 'Escribe a juan@correo.com', 'Al 477 123 45 67']) {
    const f = fake(enviadas('a', 'b'))
    await atenderFermin(msg(t, 'wa'), f.deps)
    assert.equal(f.ls[0].estado, 'ENVIADA')
    assert.deepEqual(f.enviados, ['Esa corrección trae datos de un cliente; escríbela sin teléfonos ni correos.'])
  }
})

test('aprobar comercial manda el aviso; QUITAR a ese aviso la retira', async () => {
  const f = fake(enviadas('a', 'b'))
  f.ls[0].comercial = true
  await atenderFermin(msg('sí', 'wa'), f.deps)
  assert.equal(f.enviados[0], 'Listo. Ojo: desde ahora a todos los que pregunten les digo: «Sí, en León.». Para quitarlo, responde QUITAR a este mensaje o entra a /platform.')
  assert.equal(f.ls[0].wamid_confirmacion, 'out1')
  await atenderFermin(msg('QUITAR', 'out1'), f.deps)
  assert.equal(f.ls[0].estado, 'RETIRADA')
})

test('corrección que menciona precio se marca comercial', async () => {
  const f = fake(enviadas('a'))
  await atenderFermin(msg('El plan básico cuesta $699', 'wa'), f.deps)
  assert.equal(f.ls[0].comercial, true)
  assert.match(f.enviados[0], /^Listo\. Ojo:/)
})

test('al decidir la última: confirmación con los conteos de la tanda', async () => {
  const f = fake([...enviadas('a', 'b', 'c'), lec('vieja', { estado: 'APROBADA' })])
  await atenderFermin(msg('sí', 'wa'), f.deps)
  await atenderFermin(msg('no', 'wb'), f.deps)
  assert.equal(f.enviados.length, 0)
  await atenderFermin(msg('sí', 'wc'), f.deps)
  assert.deepEqual(f.enviados, ['Listo: 2 aprendidas, 1 descartadas.'])
})
