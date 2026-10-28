import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atenderFermin, interpretar, TEXTO_NO_ENTIENDO, textoLeccion, type DepsRevision, type Leccion } from './revision.ts'
import { MARCADOR } from './revisor.ts'

const lec = (id: string, o: Partial<Leccion> = {}): Leccion => ({
  id, tipo: 'DUDA', comercial: false, pregunta: '¿Hacen envíos?', texto: 'Sí, en León.', evidencia: 'Cliente preguntó y no supimos.',
  estado: 'PENDIENTE', orden: null, wamid_envio: null, wamid_confirmacion: null, ...o,
})

// Deps en memoria: guarda las lecciones y lo enviado. `fallan`: números de envío (1, 2…) que devuelven ok:false.
function fake(ls: Leccion[], fallan: number[] = []) {
  const enviados: string[] = []
  let n = 0
  const deps: DepsRevision = {
    lecciones: async (estados) => ls.filter((l) => estados.includes(l.estado)),
    actualizar: async (id, c) => { Object.assign(ls.find((l) => l.id === id)!, c) },
    enviar: async (t) => { enviados.push(t); return fallan.includes(++n) ? { ok: false, wamid: null } : { ok: true, wamid: 'out' + n } },
    ahora: () => new Date('2026-10-28T12:00:00Z'),
  }
  return { ls, enviados, deps }
}
const msg = (texto: string, respondeA: string | null = null) => ({ wamid: 'in', texto, respondeA })
const enviadas = (...ids: string[]) => ids.map((id, i) => lec(id, { estado: 'ENVIADA', orden: i + 1, wamid_envio: 'w' + id }))
const DESLIZA = 'Desliza el mensaje de la lección y contesta ahí (o escribe el número: «SÍ 2»).'

test('interpretar: cada forma', () => {
  assert.deepEqual(interpretar(' VER '), { accion: 'VER' })
  for (const t of ['sí', 'SI', 'Sí.', 'va', 'OK!']) assert.deepEqual(interpretar(t), { accion: 'SI', numero: null })
  assert.deepEqual(interpretar('No'), { accion: 'NO', numero: null })
  assert.deepEqual(interpretar('QUITAR'), { accion: 'QUITAR', numero: null })
  assert.deepEqual(interpretar('SÍ 2'), { accion: 'SI', numero: 2 })
  assert.deepEqual(interpretar('2 sí'), { accion: 'SI', numero: 2 })
  assert.deepEqual(interpretar('no 3'), { accion: 'NO', numero: 3 })
  assert.deepEqual(interpretar('2: Di que sí hay envíos'), { accion: 'CORRECCION', numero: 2, texto: 'sí hay envíos' })
  assert.deepEqual(interpretar('Mejor di que no cobramos envío'), { accion: 'CORRECCION', numero: null, texto: 'no cobramos envío' })
})

test('interpretar: SÍ/NO con cola que no es número ni cortesía no se guarda (Ruling H)', () => {
  for (const t of ['Sí, solo León', 'Sí, me parece bien', 'No, eso fue solo para ese cliente', 'Claro que sí hacemos envíos', 'no hacemos envíos a domicilio'])
    assert.deepEqual(interpretar(t), { accion: 'NO_ENTIENDO' }, t)
  for (const t of ['Sí, por favor', 'sí porfa', 'ok va', 'Sí, gracias, porfa']) assert.deepEqual(interpretar(t), { accion: 'SI', numero: null }, t)
  assert.deepEqual(interpretar('Sí, gracias 2'), { accion: 'SI', numero: 2 })
})

test('interpretar: «no, mejor/di que/dile que …» corrige; los prefijos se quitan en toda corrección (Ruling I)', () => {
  assert.deepEqual(interpretar('no, di que enviamos a todo León'), { accion: 'CORRECCION', numero: null, texto: 'enviamos a todo León' })
  assert.deepEqual(interpretar('No, dile que sí enviamos'), { accion: 'CORRECCION', numero: null, texto: 'sí enviamos' })
  assert.deepEqual(interpretar('Dile que abrimos a las 9 de la mañana'), { accion: 'CORRECCION', numero: null, texto: 'abrimos a las 9 de la mañana' })
  assert.deepEqual(interpretar('1: MEJOR DÍ QUE abrimos a las 9'), { accion: 'CORRECCION', numero: 1, texto: 'abrimos a las 9' })
  assert.deepEqual(interpretar('Mejorar el horario los domingos'), { accion: 'CORRECCION', numero: null, texto: 'Mejorar el horario los domingos' })
  for (const t of ['2: mejor', 'no, mejor', 'Mejor di que', 'no, dile que']) assert.deepEqual(interpretar(t), { accion: 'NO_ENTIENDO' }, t)
})

test('interpretar: palabras SÍ/NO ampliadas y colas cortas', () => {
  for (const t of ['okay', 'Okey', 'dale', 'sale', 'claro', 'perfecto', 'listo', 'correcto', 'de acuerdo', '👍', '✅', 'Sí, gracias', 'ok gracias', 'de acuerdo, gracias'])
    assert.deepEqual(interpretar(t), { accion: 'SI', numero: null }, t)
  for (const t of ['nel', 'nop', '❌', '👎', 'no gracias', 'No, gracias']) assert.deepEqual(interpretar(t), { accion: 'NO', numero: null }, t)
  assert.deepEqual(interpretar('sí, 2'), { accion: 'SI', numero: 2 })
  assert.deepEqual(interpretar('no gracias 3'), { accion: 'NO', numero: 3 })
})

test('interpretar: «no, mejor di que …» corrige; otro «no, …» largo pregunta (Ruling L)', () => {
  assert.deepEqual(interpretar('No, mejor di que enviamos a todo León'), { accion: 'CORRECCION', numero: null, texto: 'enviamos a todo León' })
  assert.deepEqual(interpretar('no, hacemos envíos solo en León'), { accion: 'NO_ENTIENDO' })
})

test('interpretar: 1–2 palabras no reconocidas no se guardan', () => {
  for (const t of ['gracias', 'Solo León', 'hola']) assert.deepEqual(interpretar(t), { accion: 'NO_ENTIENDO' }, t)
})

test('interpretar: «9:00 a 18:00…» no es la lección 9; el número va de 1 a 5 y sin dígito tras «:»', () => {
  assert.deepEqual(interpretar('9:00 a 18:00 de lunes a viernes'), { accion: 'CORRECCION', numero: null, texto: '9:00 a 18:00 de lunes a viernes' })
  assert.deepEqual(interpretar('2:30 de la tarde cerramos'), { accion: 'CORRECCION', numero: null, texto: '2:30 de la tarde cerramos' })
  assert.deepEqual(interpretar('6: Di que sí hay envíos'), { accion: 'CORRECCION', numero: null, texto: '6: Di que sí hay envíos' })
})

test('textoLeccion: formato fijo, con la pregunta cuando la hay', () => {
  assert.equal(
    textoLeccion(lec('a', { tipo: 'PREGUNTA', comercial: true }), 2, 3),
    '*Lección 2 de 3 · Pregunta sin respuesta · Comercial*\nCliente preguntó y no supimos.\nSi preguntan: «¿Hacen envíos?»\nEl agente diría: «Sí, en León.»\nResponde *SÍ*, *NO* o escribe la corrección.',
  )
  assert.equal(
    textoLeccion(lec('a', { tipo: 'TONO', pregunta: null, texto: 'Tutea.' }), 1, 1),
    '*Lección 1 de 1 · Tono*\nCliente preguntó y no supimos.\nEl agente diría: «Tutea.»\nResponde *SÍ*, *NO* o escribe la corrección.',
  )
})

test('VER manda 3 mensajes y marca ENVIADA con orden 1..3', async () => {
  const f = fake([lec('a'), lec('b'), lec('c')])
  await atenderFermin(msg('ver'), f.deps)
  assert.equal(f.enviados.length, 3)
  assert.match(f.enviados[1], /^\*Lección 2 de 3/)
  assert.deepEqual(f.ls.map((l) => [l.estado, l.orden, l.wamid_envio]), [['ENVIADA', 1, 'out1'], ['ENVIADA', 2, 'out2'], ['ENVIADA', 3, 'out3']])
})

test('VER manda máximo 5 y sin pendientes lo dice', async () => {
  const f = fake(Array.from({ length: 7 }, (_, i) => lec('p' + i)))
  await atenderFermin(msg('VER'), f.deps)
  assert.equal(f.enviados.length, 5)
  assert.equal(f.ls.filter((l) => l.estado === 'PENDIENTE').length, 2)
  const v = fake([lec('x', { estado: 'APROBADA' })])
  await atenderFermin(msg('VER'), v.deps)
  assert.deepEqual(v.enviados, ['No hay lecciones pendientes.'])
})

test('sí deslizado aprueba la correcta; no descarta', async () => {
  const f = fake(enviadas('a', 'b', 'c'))
  await atenderFermin(msg('sí', 'wb'), f.deps)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA', 'ENVIADA'])
  assert.equal((f.ls[1] as Leccion & { decidido_en?: string }).decidido_en, '2026-10-28T12:00:00.000Z')
  await atenderFermin(msg('no', 'wc'), f.deps)
  assert.equal(f.ls[2].estado, 'DESCARTADA')
  assert.equal(f.enviados.length, 0)
})

test('corrección aprueba con ese texto (sin «mejor di que») y manda el eco con QUITAR', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('Mejor di que enviamos a todo León', 'wa'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.ls[0].texto], ['APROBADA', 'enviamos a todo León'])
  assert.deepEqual(f.enviados, ['Listo. Desde ahora digo: «enviamos a todo León». Para quitarlo, responde QUITAR a este mensaje.'])
  assert.equal(f.ls[0].wamid_confirmacion, 'out1')
  await atenderFermin(msg('quitar', 'out1'), f.deps)
  assert.equal(f.ls[0].estado, 'RETIRADA')
  assert.equal(f.enviados[1], 'Listo, ya no lo digo.')
})

test('con una sola ENVIADA sin deslizar: «ok», «va», «listo» piden deslizar; deslizando, «ok» aprueba', async () => {
  for (const t of ['ok', 'va', 'listo', '👍']) {
    const f = fake(enviadas('a'))
    await atenderFermin(msg(t), f.deps)
    assert.deepEqual([f.ls[0].estado, f.enviados], ['ENVIADA', [DESLIZA]], t)
  }
  for (const t of ['Sí, gracias', 'nel']) {
    const f = fake(enviadas('a'))
    await atenderFermin(msg(t), f.deps)
    assert.notEqual(f.ls[0].estado, 'ENVIADA', t)
  }
  const g = fake(enviadas('a'))
  await atenderFermin(msg('ok', 'wa'), g.deps)
  assert.equal(g.ls[0].estado, 'APROBADA')
})

test('«Sí, solo León» deslizado no guarda nada y explica cómo corregir', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('Sí, solo León', 'wa'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.ls[0].texto], ['ENVIADA', 'Sí, en León.'])
  assert.deepEqual(f.enviados, [TEXTO_NO_ENTIENDO])
})

test('PREGUNTA con el marcador: SÍ no la aprueba; NO la descarta; corrección la aprueba con el texto', async () => {
  const f = fake(enviadas('a', 'b', 'c'))
  for (const l of f.ls) Object.assign(l, { tipo: 'PREGUNTA', texto: MARCADOR })
  await atenderFermin(msg('sí', 'wa'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.enviados], ['ENVIADA', ['Escribe la respuesta para esa pregunta.']])
  await atenderFermin(msg('no', 'wb'), f.deps)
  assert.equal(f.ls[1].estado, 'DESCARTADA')
  await atenderFermin(msg('Hacemos envíos en todo León', 'wc'), f.deps)
  assert.deepEqual([f.ls[2].estado, f.ls[2].texto], ['APROBADA', 'Hacemos envíos en todo León'])
})

test('respondeA que no es de ninguna ENVIADA: vale el número del texto', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('sí 2', 'otro'), f.deps)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA'])
})

test('contestar a una lección ya decidida lo dice en vez de callar', async () => {
  const f = fake([
    ...enviadas('a'),
    lec('b', { estado: 'APROBADA', wamid_envio: 'wb', wamid_confirmacion: 'cb' }),
    lec('c', { estado: 'CADUCADA', wamid_envio: 'wc' }),
    lec('d', { estado: 'RETIRADA', wamid_envio: 'wd', wamid_confirmacion: 'cd' }),
  ])
  await atenderFermin(msg('sí', 'wb'), f.deps)
  await atenderFermin(msg('no', 'wc'), f.deps)
  await atenderFermin(msg('QUITAR', 'cd'), f.deps)
  assert.deepEqual(f.enviados, ['Esa lección ya está aprobada.', 'Esa lección ya está caducada.', 'Esa lección ya está retirada.'])
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA', 'CADUCADA', 'RETIRADA'])
})

test('«SÍ 2» sin deslizar aprueba la 2', async () => {
  const f = fake(enviadas('a', 'b', 'c'))
  await atenderFermin(msg('SÍ 2'), f.deps)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'APROBADA', 'ENVIADA'])
})

test('«sí» sin deslizar con 2 esperando: pide deslizar y no cambia nada', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('sí'), f.deps)
  assert.deepEqual(f.enviados, [DESLIZA])
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'ENVIADA'])
})

test('«gracias» sin ENVIADA no envía nada', async () => {
  const f = fake([lec('a', { estado: 'APROBADA' })])
  await atenderFermin(msg('gracias'), f.deps)
  assert.equal(f.enviados.length, 0)
})

test('con una sola ENVIADA: «sí» sin deslizar aprueba; «gracias» no cambia nada y pide deslizar', async () => {
  const g = fake(enviadas('a'))
  await atenderFermin(msg('gracias'), g.deps)
  assert.equal(g.ls[0].estado, 'ENVIADA')
  assert.deepEqual(g.enviados, [DESLIZA])
  await atenderFermin(msg('sí'), g.deps)
  assert.equal(g.ls[0].estado, 'APROBADA')
})

test('corrección larga sin deslizar ni número, con una sola ENVIADA, tampoco se aplica', async () => {
  const f = fake(enviadas('a'))
  await atenderFermin(msg('Atendemos de lunes a viernes'), f.deps)
  assert.equal(f.ls[0].estado, 'ENVIADA')
  assert.deepEqual(f.enviados, [DESLIZA])
})

test('corrección con número aplica sin deslizar', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('2: Di que enviamos a todo León'), f.deps)
  assert.deepEqual([f.ls[1].estado, f.ls[1].texto], ['APROBADA', 'enviamos a todo León'])
})

test('VER con tanda abierta reenvía las ENVIADA (mismo orden, nuevo wamid) y no manda PENDIENTE', async () => {
  const f = fake([...enviadas('a', 'b', 'c'), lec('p')])
  await atenderFermin(msg('sí', 'wa'), f.deps)
  await atenderFermin(msg('VER'), f.deps)
  assert.equal(f.enviados.length, 2)
  assert.match(f.enviados[0], /^\*Lección 2 de 3/)
  assert.match(f.enviados[1], /^\*Lección 3 de 3/)
  assert.deepEqual(f.ls.map((l) => [l.estado, l.orden, l.wamid_envio]), [['APROBADA', 1, 'wa'], ['ENVIADA', 2, 'out1'], ['ENVIADA', 3, 'out2'], ['PENDIENTE', null, null]])
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
  assert.equal(f.enviados[1], 'Listo, ya no lo digo.')
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

test('deslizado «9:00 a 18:00 de lunes a viernes» se guarda completo', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('9:00 a 18:00 de lunes a viernes', 'wb'), f.deps)
  assert.deepEqual([f.ls[1].estado, f.ls[1].texto], ['APROBADA', '9:00 a 18:00 de lunes a viernes'])
})

test('2 palabras deslizadas no reconocidas no se guardan: pregunta y no cambia nada', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('gracias', 'wa'), f.deps)
  assert.deepEqual(f.enviados, [TEXTO_NO_ENTIENDO])
  assert.match(TEXTO_NO_ENTIENDO, /di que/)
  assert.deepEqual(f.ls.map((l) => l.estado), ['ENVIADA', 'ENVIADA'])
})

test('«Sí, gracias» deslizado aprueba; «No, mejor di que X» deslizado corrige con X', async () => {
  const f = fake(enviadas('a', 'b'))
  await atenderFermin(msg('Sí, gracias', 'wa'), f.deps)
  await atenderFermin(msg('No, mejor di que enviamos a todo León', 'wb'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.ls[0].texto], ['APROBADA', 'Sí, en León.'])
  assert.deepEqual([f.ls[1].estado, f.ls[1].texto], ['APROBADA', 'enviamos a todo León'])
})

test('tanda trabada por una caducada: el siguiente VER empieza limpio y los conteos son de esa tanda', async () => {
  const f = fake([
    lec('x', { estado: 'APROBADA', orden: 1, wamid_envio: 'wx' }),
    lec('y', { estado: 'CADUCADA', orden: 2, wamid_envio: 'wy' }),
    lec('p1'), lec('p2'),
  ])
  await atenderFermin(msg('VER'), f.deps)
  assert.deepEqual(f.ls.map((l) => [l.estado, l.orden]), [['APROBADA', null], ['CADUCADA', null], ['ENVIADA', 1], ['ENVIADA', 2]])
  assert.match(f.enviados[0], /^\*Lección 1 de 2/)
  await atenderFermin(msg('sí', 'out1'), f.deps)
  await atenderFermin(msg('no', 'out2'), f.deps)
  assert.deepEqual(f.enviados.slice(2), ['Listo: 1 aprendidas, 1 descartadas.'])
})

test('la tanda se cierra releyendo ENVIADA tras actualizar (no con la foto previa)', async () => {
  const f = fake(enviadas('a', 'b'))
  // Otra decisión entra entre la lectura inicial y el cierre: b se descarta mientras se aprueba a.
  const actualizar = f.deps.actualizar
  f.deps.actualizar = async (id, c) => { await actualizar(id, c); if (id === 'a') f.ls[1].estado = 'DESCARTADA' }
  await atenderFermin(msg('sí', 'wa'), f.deps)
  assert.deepEqual(f.enviados, ['Listo: 1 aprendidas, 1 descartadas.'])
})

test('respondeA ajeno con ENVIADA vigentes pide deslizar; sin ENVIADA calla', async () => {
  const f = fake(enviadas('a'))
  await atenderFermin(msg('sí', 'otro'), f.deps)
  await atenderFermin(msg('QUITAR', 'otro'), f.deps)
  assert.deepEqual(f.enviados, [DESLIZA, DESLIZA])
  assert.equal(f.ls[0].estado, 'ENVIADA')
  const g = fake([])
  await atenderFermin(msg('sí', 'otro'), g.deps)
  assert.equal(g.enviados.length, 0)
})

test('detección comercial ampliada', async () => {
  for (const t of ['Cuesta 699 pesos al mes', 'Es gratis el primer mes', 'Cobramos 5% de comisión', 'Hay oferta mensual']) {
    const f = fake(enviadas('a'))
    await atenderFermin(msg(t, 'wa'), f.deps)
    assert.equal(f.ls[0].comercial, true, t)
    assert.match(f.enviados[0], /^Listo\. Ojo:/, t)
  }
  const g = fake(enviadas('a'))
  await atenderFermin(msg('Atendemos en León y alrededores', 'wa'), g.deps)
  assert.equal(g.ls[0].comercial, false)
})

test('envío fallido en VER: no marca ENVIADA y numera solo las enviadas', async () => {
  const f = fake([lec('a'), lec('b'), lec('c')], [2])
  await atenderFermin(msg('VER'), f.deps)
  assert.deepEqual(f.ls.map((l) => [l.estado, l.orden]), [['ENVIADA', 1], ['PENDIENTE', null], ['ENVIADA', 2]])
})

test('aviso comercial que falla: la aprobación se queda, sin wamid_confirmacion y sin romper', async () => {
  const f = fake(enviadas('a', 'b'), [1])
  f.ls[0].comercial = true
  await atenderFermin(msg('sí', 'wa'), f.deps)
  assert.deepEqual([f.ls[0].estado, f.ls[0].wamid_confirmacion], ['APROBADA', null])
})
