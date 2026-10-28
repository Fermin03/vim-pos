// Genera supabase/functions/_shared/agente/conocimiento.gen.ts con el conocimiento
// del agente de WhatsApp. Las Edge Functions no leen archivos del repo en ejecución,
// por eso se compila a un .ts. Uso: npm run agente:conocimiento
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../', import.meta.url)
const leer = (ruta) => readFileSync(fileURLToPath(new URL(ruta, raiz)), 'utf8')

const FUENTES = ['llms.txt', 'precios.md', 'funciones.md', 'sin-internet.md', 'facturacion-cfdi.md', 'demo.md', 'novedades.md']
const VERSIONES_NOVEDADES = 3

// Palabras que el agente nunca debe ver (sin mayúsculas ni acentos).
const PROHIBIDAS = ['knock', 'clabe', 'service_role', 'supabase', 'vercel', '@gmail', 'testimonio', 'referido', 'cinco negocios', '5 negocios']
const plano = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Líneas repetidas en cada página (navegación, pie, sello) o que dicen cuántos clientes hay.
const RUIDO = [
  /^\*\*VIM POS\*\* · punto de venta/,
  /^\*\*Otras páginas en Markdown:/,
  /^\*\*Contacto:\*\* hola@/,
  /^_Generado desde /,
  /^---$/,
  /^\[[^\]]+\]\(https:\/\/(vimpos\.com\.mx|admin\.vimpos\.com\.mx)[^)]*\)$/, // botones sueltos
  /^\[Escríbenos por correo\]/,
  /Más de \d+ restaurantes|More than \d+ restaurants/, // cuántos negocios hay no es público
]

function limpiar(texto) {
  return texto
    .split('\n')
    .filter((l) => !RUIDO.some((r) => r.test(l.trim())))
    .filter((l) => !PROHIBIDAS.some((p) => plano(l).includes(p)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// llms.txt: la parte en inglés y las listas de enlaces repiten lo que dicen las demás fuentes.
function recortarLlms(t) {
  const ini = t.indexOf('**In English.**')
  const fin = t.indexOf('## Cuándo usar VIM POS')
  const sinIngles = ini >= 0 && fin > ini ? t.slice(0, ini) + t.slice(fin) : t
  const pag = sinIngles.indexOf('\n## Páginas')
  return pag >= 0 ? sinIngles.slice(0, pag) : sinIngles
}

// novedades.md: cada versión abre con «13 de octubre Caja · 0.10.2». Se quedan las últimas N.
function ultimasVersiones(t, n) {
  const lineas = t.split('\n')
  const esVersion = (l) => /^\d{1,2} de [a-záéíóú]+ (Caja|Panel|Tienda|Kiosco)\b.* · /i.test(l)
  const inicios = lineas.flatMap((l, i) => (esVersion(l) ? [i] : []))
  if (inicios.length < n) throw new Error(`novedades.md: encontré ${inicios.length} versiones, esperaba al menos ${n}`)
  if (inicios.length === n) return t
  const cabecera = lineas.slice(0, inicios[0]).filter((l) => !l.startsWith('## '))
  return [...cabecera, ...lineas.slice(inicios[0], inicios[n])].join('\n')
}

// precios.md: el bloque de la oferta piloto dice cuántos lugares hay; la oferta la explica solo fundador.md.
function sinOfertaPiloto(t) {
  const ini = t.indexOf('_Piloto')
  const fin = t.indexOf('_Lado a lado_')
  if (ini < 0 || fin < ini) throw new Error('precios.md: no encontré el bloque de la oferta piloto')
  return t.slice(0, ini) + t.slice(fin)
}

const prepara = (nombre) => {
  let t = leer(`sitio-web/${nombre}`)
  if (nombre === 'llms.txt') t = recortarLlms(t)
  if (nombre === 'precios.md') t = sinOfertaPiloto(t)
  if (nombre === 'novedades.md') t = ultimasVersiones(t, VERSIONES_NOVEDADES)
  return `## ${nombre}\n\n${limpiar(t)}`
}

const CONOCIMIENTO = FUENTES.map(prepara).join('\n\n')
const REGLAS = limpiar(leer('supabase/functions/_shared/agente/reglas.md'))
const FUNDADOR = limpiar(leer('supabase/functions/_shared/agente/fundador.md'))

const literal = (s) => JSON.stringify(s) // literal de cadena válido en TS; sin trampas de escape
const salida = `// GENERADO por scripts/generar-conocimiento-agente.mjs. No se edita a mano.
export const CONOCIMIENTO: string = ${literal(CONOCIMIENTO)}
export const REGLAS: string = ${literal(REGLAS)}
export const FUNDADOR: string = ${literal(FUNDADOR)}
`
writeFileSync(fileURLToPath(new URL('supabase/functions/_shared/agente/conocimiento.gen.ts', raiz)), salida)
console.log(`CONOCIMIENTO ${CONOCIMIENTO.length} · REGLAS ${REGLAS.length} · FUNDADOR ${FUNDADOR.length} · total ${CONOCIMIENTO.length + REGLAS.length + FUNDADOR.length}`)
