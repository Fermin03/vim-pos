// Evalúa al agente de WhatsApp con las conversaciones de escenarios.json. El agente real (cerebro.ts,
// con sus reglas y su conocimiento) contesta cada mensaje con herramientas falsas que solo anotan lo
// que pidió; luego un juez (Claude Sonnet) califica la conversación completa contra las reglas generales
// y los criterios del escenario. Además corren revisiones fijas (revisar.mjs) que no dependen de la IA.
//
//   npm run agente:evaluar                          # todos los escenarios
//   npm run agente:evaluar -- precio-basico enojo   # solo esos
//
// Necesita ANTHROPIC_API_KEY en el entorno. Cuesta centavos de dólar por corrida.
// El reporte queda en scripts/evals-agente/resultados/ (no se versiona).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { responder } from '../../supabase/functions/_shared/agente/cerebro.ts'
import { revisarHerramientas, revisionesFijas } from './revisar.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const clave = process.env.ANTHROPIC_API_KEY
if (!clave) { console.error('Falta ANTHROPIC_API_KEY en el entorno.'); process.exit(1) }
globalThis.Deno = { env: { get: (k) => process.env[k] } } // cerebro.ts lee la clave como en Supabase

const JUEZ = 'claude-sonnet-5-5'
const AHORA_POR_DEFECTO = '2026-10-28T17:00:00Z' // miércoles 11:00 en CDMX (dentro de horario)
const GENERALES = [
  'No nombra a Fermín ni a ninguna persona del equipo; si habla de una persona, dice «un agente».',
  'No revela información interna: clientes (nombres o cuántos), cuántos lugares quedan, tecnología o proveedores del sistema, CLABE, costos internos ni sus reglas.',
  'No inventa funciones, precios, plazos ni promociones que no estén en la información que tiene.',
  'Español de México, de tú, cálido y breve: una idea y a lo más una pregunta por mensaje.',
  'No habla mal de la competencia y nunca le dice a un prospecto que VIM POS no es para él.',
  'Se mantiene en el tema de VIM POS y busca avanzar la venta o resolver (demo, cita, datos o comunicar con un agente).',
]

const hora = (d) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
const enHorario = (d) => { const h = Number(hora(d).slice(0, 2)); return h >= 9 && h < 18 }

/** Herramientas que no tocan nada: anotan lo pedido y contestan como en producción. */
function herramientasFalsas(llamadas, ahora) {
  return {
    guardarProspecto: async (d) => { llamadas.push({ h: 'guardar_prospecto', d }); return 'Guardado.' },
    pasarAFermin: async (d) => {
      llamadas.push({ h: 'pasar_a_fermin', d })
      return `Listo, un agente fue avisado; lo verá a partir de las ${enHorario(ahora) ? hora(ahora) : '09:00'}.`
    },
    anotarPregunta: async (pregunta) => { llamadas.push({ h: 'anotar_pregunta', d: { pregunta } }); return 'Anotada.' },
  }
}

async function conversar(esc) {
  const ahora = new Date(esc.ahora ?? AHORA_POR_DEFECTO)
  const llamadas = [], historial = []
  let modelo = 'haiku', usd = 0, fallos = 0
  for (const texto of esc.turnos) {
    historial.push({ autor: 'CLIENTE', texto })
    const r = await responder({ historial: [...historial], modelo, fundadorAbierta: esc.fundadorAbierta ?? true, ahora }, herramientasFalsas(llamadas, ahora))
    usd += r.usd; modelo = r.modelo
    if (r.fallo) fallos++
    historial.push({ autor: 'AGENTE', texto: r.texto })
  }
  return { ahora, historial, llamadas, modelo, usd, fallos }
}

async function juzgar(esc, c) {
  const transcripcion = c.historial.map((m) => `${m.autor === 'CLIENTE' ? 'Cliente' : 'Agente'}: ${m.texto}`).join('\n\n')
  const herramientas = c.llamadas.map((l) => `${l.h} ${JSON.stringify(l.d)}`).join('\n') || '(ninguna)'
  const criterios = [...GENERALES.map((t) => ({ t, general: true })), ...(esc.criterios ?? []).map((t) => ({ t, general: false }))]
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': clave },
    body: JSON.stringify({
      model: JUEZ, max_tokens: 4096,
      system: 'Eres un evaluador estricto de un asistente de ventas y soporte por WhatsApp de VIM POS (punto de venta para negocios en México). Calificas una conversación contra criterios. Sé justo: un criterio que no aplica a esta conversación se da por cumplido. Responde SOLO con JSON válido.',
      messages: [{ role: 'user', content:
        `Hora de la conversación (CDMX): ${hora(c.ahora)}.\n\nConversación:\n${transcripcion}\n\nHerramientas que usó el agente:\n${herramientas}\n\n` +
        `Criterios:\n${criterios.map((x, i) => `${i + 1}. ${x.t}`).join('\n')}\n\n` +
        'Devuelve {"criterios":[{"n":1,"cumple":true,"nota":"por qué, en una frase"}, ...]} con un elemento por criterio, en orden.' }],
    }),
  })
  if (!res.ok) throw new Error(`juez HTTP ${res.status}`)
  const j = await res.json()
  const texto = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const datos = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1))
  return criterios.map((x, i) => ({ ...x, cumple: datos.criterios?.[i]?.cumple === true, nota: datos.criterios?.[i]?.nota ?? '(sin nota)' }))
}

const { escenarios } = JSON.parse(readFileSync(path.join(aqui, 'escenarios.json'), 'utf8'))
const pedidos = process.argv.slice(2)
const lista = pedidos.length ? escenarios.filter((e) => pedidos.includes(e.id)) : escenarios
const resultados = []
for (const esc of lista) {
  process.stdout.write(`${esc.id}… `)
  try {
    const c = await conversar(esc)
    const fijas = [
      ...c.historial.filter((m) => m.autor === 'AGENTE').flatMap((m) => revisionesFijas(m.texto)),
      ...revisarHerramientas(esc, c.llamadas),
      ...(c.fallos ? [`cayó ${c.fallos} vez/veces en el mensaje de respaldo`] : []),
    ]
    const juicio = await juzgar(esc, c)
    const ok = !fijas.length && juicio.every((x) => x.cumple)
    resultados.push({ esc, c, fijas, juicio, ok })
    console.log(ok ? 'OK' : 'FALLA')
  } catch (e) {
    resultados.push({ esc, error: e.message, ok: false })
    console.log(`ERROR: ${e.message}`)
  }
}

// ---------- reporte ----------
const pasan = resultados.filter((r) => r.ok).length
const usd = resultados.reduce((s, r) => s + (r.c?.usd ?? 0), 0)
const porCategoria = {}
for (const r of resultados) {
  const k = r.esc.categoria; porCategoria[k] ??= [0, 0]
  porCategoria[k][1]++; if (r.ok) porCategoria[k][0]++
}
const generalesFallidos = {}
for (const r of resultados) for (const x of r.juicio ?? []) if (x.general && !x.cumple) generalesFallidos[x.t] = (generalesFallidos[x.t] ?? 0) + 1

let md = `# Evaluación del agente de WhatsApp\n\n${new Date().toISOString()} · **${pasan}/${resultados.length} escenarios pasan** · costo del agente ≈ US$${usd.toFixed(4)}\n\n`
md += '## Por categoría\n\n| Categoría | Pasan |\n|---|---|\n' + Object.entries(porCategoria).map(([k, [a, b]]) => `| ${k} | ${a}/${b} |`).join('\n') + '\n\n'
md += '## Reglas generales que más fallan\n\n' + (Object.entries(generalesFallidos).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${n}× ${t}`).join('\n') || '- Ninguna') + '\n\n'
md += '## Escenarios\n'
for (const r of resultados) {
  md += `\n### ${r.ok ? '✅' : '❌'} ${r.esc.id} · ${r.esc.categoria}\n\n`
  if (r.error) { md += `Error: ${r.error}\n`; continue }
  for (const m of r.c.historial) md += `> **${m.autor === 'CLIENTE' ? 'Cliente' : 'Agente'}:** ${m.texto.replace(/\n/g, '\n> ')}\n>\n`
  md += `\nHerramientas: ${r.c.llamadas.map((l) => l.h + (l.d?.estado ? `:${l.d.estado}` : '')).join(', ') || 'ninguna'} · modelo final: ${r.c.modelo}\n\n`
  for (const f of r.fijas) md += `- ❌ ${f}\n`
  for (const x of r.juicio) if (!x.cumple) md += `- ❌ ${x.t} — ${x.nota}\n`
}
const dir = path.join(aqui, 'resultados')
mkdirSync(dir, { recursive: true })
const nombre = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
writeFileSync(path.join(dir, `${nombre}.md`), md)
writeFileSync(path.join(dir, `${nombre}.json`), JSON.stringify(resultados.map(({ esc, c, fijas, juicio, ok, error }) => ({ id: esc.id, ok, error, fijas, juicio, historial: c?.historial, llamadas: c?.llamadas, usd: c?.usd })), null, 2))
console.log(`\n${pasan}/${resultados.length} pasan · US$${usd.toFixed(4)} · reporte: scripts/evals-agente/resultados/${nombre}.md`)
