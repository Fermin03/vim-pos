import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONOCIMIENTO, FUNDADOR, REGLAS } from './conocimiento.gen.ts'

const plano = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

test('el conocimiento completo cabe en el presupuesto de tokens', () => {
  assert.ok(CONOCIMIENTO.length + REGLAS.length + FUNDADOR.length < 60_000)
})

test('no menciona nada interno', () => {
  const todo = plano(CONOCIMIENTO + REGLAS + FUNDADOR)
  for (const p of ['knock', 'clabe', 'service_role', 'supabase', 'vercel', '@gmail', 'testimonio', 'referido']) {
    assert.ok(!todo.includes(p), `contiene «${p}»`)
  }
})

test('las reglas traen demo, horario y zona de citas', () => {
  for (const s of ['demo.vimpos.com.mx', '9:00', 'León', 'Purísima']) assert.ok(REGLAS.includes(s), s)
})

test('hay conocimiento de todas las fuentes y solo tres versiones de novedades', () => {
  for (const s of ['## llms.txt', '## precios.md', '## novedades.md', '## demo.md']) assert.ok(CONOCIMIENTO.includes(s), s)
  assert.ok(!CONOCIMIENTO.includes('0.4.100'))
})
