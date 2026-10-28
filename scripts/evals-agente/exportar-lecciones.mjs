// Baja las lecciones APROBADAS de producción y las deja en scripts/evals-agente/lecciones.json
// ({ lecciones, escenarios }) para que `npm run agente:evaluar` las use. El archivo no se versiona.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run agente:lecciones
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: clave } = process.env
if (!url || !clave) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.'); process.exit(1) }

// Mismo orden y tope que lee el webhook.
const consulta = 'select=id,tipo,comercial,pregunta,texto,escenario,decidido_en&estado=eq.APROBADA&order=decidido_en.desc&limit=200'
const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/wa_lecciones?${consulta}`, { headers: { apikey: clave, authorization: `Bearer ${clave}` } })
if (!res.ok) { console.error(`Supabase respondió ${res.status}: ${await res.text()}`); process.exit(1) }
const filas = await res.json()

const lleno = (a) => Array.isArray(a) && a.length > 0 && a.every((t) => typeof t === 'string' && t.trim())
const validas = filas.filter((l) => lleno(l.escenario?.turnos) && lleno(l.escenario?.criterios))
const escenarios = validas.map((l) => ({ id: `leccion-${l.id.slice(0, 8)}`, categoria: 'Aprendido', turnos: l.escenario.turnos, criterios: l.escenario.criterios }))
const lecciones = filas.map(({ escenario, id, ...l }) => l) // el bloque del agente no necesita el escenario ni el id

writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'lecciones.json'), JSON.stringify({ lecciones, escenarios }, null, 2))
console.log(`${filas.length} lecciones aprobadas · ${escenarios.length} escenarios`)
if (filas.length > escenarios.length) console.warn(`${filas.length - escenarios.length} sin escenario válido: entran al agente, pero no se prueban.`)
