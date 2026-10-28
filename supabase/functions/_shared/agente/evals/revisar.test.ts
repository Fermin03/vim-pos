import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revisarHerramientas, revisionesFijas } from './revisar.ts'

test('respuesta limpia: sin fallas', () => {
  assert.deepEqual(revisionesFijas('El plan *Esencial* cuesta $699 al mes más IVA. ¿Cuántas cajas tienes?'), [])
})

test('nombrar a Fermín (con o sin acento), CLABE o la IA es falla', () => {
  assert.deepEqual(revisionesFijas('Te comunico con Fermín'), ['dice «fermin»'])
  assert.deepEqual(revisionesFijas('Soy Claude, hecho por Anthropic'), ['dice «anthropic»', 'dice «claude»'])
  assert.deepEqual(revisionesFijas('Nuestra CLABE es…'), ['dice «clabe»'])
})

test('Markdown y largo', () => {
  assert.equal(revisionesFijas('- **Esencial:** $699').length, 1)
  assert.equal(revisionesFijas('## Planes\nalgo').length, 1)
  assert.deepEqual(revisionesFijas('a'.repeat(1501)), ['pasa de 1500 caracteres'])
})

test('emojis y abrir con exclamación', () => {
  assert.deepEqual(revisionesFijas('Va, te ayudo 🙌'), ['usa emojis'])
  assert.deepEqual(revisionesFijas('¡Qué bien! Sí sirve.'), ['abre con exclamación'])
  assert.deepEqual(revisionesFijas('Sí sirve. ¡Te va a gustar!'), [])
})

test('herramientas: debe / no_debe, con estado opcional', () => {
  const llamadas = [{ h: 'pasar_a_fermin', d: { estado: 'URGENTE_SOPORTE' } }]
  assert.deepEqual(revisarHerramientas({ debe: ['pasar_a_fermin:URGENTE_SOPORTE'] }, llamadas), [])
  assert.deepEqual(revisarHerramientas({ debe: ['pasar_a_fermin:PROSPECTO_CALIENTE'] }, llamadas), ['no usó pasar_a_fermin:PROSPECTO_CALIENTE'])
  assert.deepEqual(revisarHerramientas({ no_debe: ['pasar_a_fermin'] }, llamadas), ['usó pasar_a_fermin y no debía'])
  assert.deepEqual(revisarHerramientas({ debe: ['guardar_prospecto'] }, []), ['no usó guardar_prospecto'])
})
