// Evalúa al agente de WhatsApp con las conversaciones de supabase/functions/_shared/agente/evals/
// escenarios.json: el agente real contesta, revisiones fijas y un juez (Claude Sonnet) califican
// (núcleo en evals/nucleo.ts).
//
//   npm run agente:evaluar                          # todos los escenarios
//   npm run agente:evaluar -- precio-basico enojo   # solo esos
//
// Necesita ANTHROPIC_API_KEY en el entorno. Cuesta centavos de dólar por corrida.
// El reporte queda en scripts/evals-agente/resultados/ (no se versiona).
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESCENARIOS, evaluarEscenario } from '../../supabase/functions/_shared/agente/evals/nucleo.ts'

const clave = process.env.ANTHROPIC_API_KEY
if (!clave) { console.error('Falta ANTHROPIC_API_KEY en el entorno.'); process.exit(1) }
globalThis.Deno = { env: { get: (k) => process.env[k] } } // cerebro.ts lee la clave como en Supabase

const pedidos = process.argv.slice(2)
const lista = pedidos.length ? ESCENARIOS.filter((e) => pedidos.includes(e.id)) : ESCENARIOS
const resultados = []
for (const esc of lista) {
  process.stdout.write(`${esc.id}… `)
  const r = await evaluarEscenario(esc, clave)
  resultados.push(r)
  console.log(r.error ? `ERROR: ${r.error}` : r.ok ? 'OK' : 'FALLA')
}

// ---------- reporte ----------
const pasan = resultados.filter((r) => r.ok).length
const usd = resultados.reduce((s, r) => s + (r.usd ?? 0), 0)
const porCategoria = {}
for (const r of resultados) {
  porCategoria[r.categoria] ??= [0, 0]
  porCategoria[r.categoria][1]++
  if (r.ok) porCategoria[r.categoria][0]++
}
const generalesFallidos = {}
for (const r of resultados) for (const x of r.juicio ?? []) if (x.general && !x.cumple) generalesFallidos[x.t] = (generalesFallidos[x.t] ?? 0) + 1

let md = `# Evaluación del agente de WhatsApp\n\n${new Date().toISOString()} · **${pasan}/${resultados.length} escenarios pasan** · costo del agente ≈ US$${usd.toFixed(4)}\n\n`
md += '## Por categoría\n\n| Categoría | Pasan |\n|---|---|\n' + Object.entries(porCategoria).map(([k, [a, b]]) => `| ${k} | ${a}/${b} |`).join('\n') + '\n\n'
md += '## Reglas generales que más fallan\n\n' + (Object.entries(generalesFallidos).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${n}× ${t}`).join('\n') || '- Ninguna') + '\n\n'
md += '## Escenarios\n'
for (const r of resultados) {
  md += `\n### ${r.ok ? '✅' : '❌'} ${r.id} · ${r.categoria}\n\n`
  if (r.error) { md += `Error: ${r.error}\n`; continue }
  for (const m of r.historial) md += `> **${m.autor === 'CLIENTE' ? 'Cliente' : 'Agente'}:** ${m.texto.replace(/\n/g, '\n> ')}\n>\n`
  md += `\nHerramientas: ${r.llamadas.map((l) => l.h + (l.d?.estado ? `:${l.d.estado}` : '')).join(', ') || 'ninguna'} · modelo final: ${r.modelo}\n\n`
  for (const f of r.fijas) md += `- ❌ ${f}\n`
  for (const x of r.juicio) if (!x.cumple) md += `- ❌ ${x.t} — ${x.nota}\n`
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'resultados')
mkdirSync(dir, { recursive: true })
const nombre = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
writeFileSync(path.join(dir, `${nombre}.md`), md)
writeFileSync(path.join(dir, `${nombre}.json`), JSON.stringify(resultados, null, 2))
console.log(`\n${pasan}/${resultados.length} pasan · US$${usd.toFixed(4)} · reporte: scripts/evals-agente/resultados/${nombre}.md`)
