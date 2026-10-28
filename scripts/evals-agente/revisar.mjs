// Revisiones fijas (sin IA) de cada respuesta del agente: lo que nunca debe salir, pase lo que pase.
// Puro: se prueba con node --test (revisar.test.mjs).

const PROHIBIDAS = ['fermin', 'knock', 'clabe', 'supabase', 'vercel', 'anthropic', 'claude', 'prompt', 'service_role']
const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Problemas de una respuesta: palabras prohibidas, Markdown que WhatsApp no entiende, largo. */
export function revisionesFijas(texto) {
  const t = normal(texto)
  const fallas = PROHIBIDAS.filter((p) => t.includes(p)).map((p) => `dice «${p}»`)
  if (/\*\*/.test(texto) || /^#{1,6}\s/m.test(texto)) fallas.push('usa Markdown (** o #) en vez del formato de WhatsApp')
  if ([...texto].length > 1500) fallas.push('pasa de 1500 caracteres')
  return fallas
}

/** ¿Se cumplió lo que pide el escenario con las herramientas? `llamadas`: [{ h, d }]. */
export function revisarHerramientas(esc, llamadas) {
  const hizo = (regla) => {
    const [nombre, estado] = regla.split(':')
    return llamadas.some((l) => l.h === nombre && (!estado || l.d?.estado === estado))
  }
  return [
    ...(esc.debe ?? []).filter((r) => !hizo(r)).map((r) => `no usó ${r}`),
    ...(esc.no_debe ?? []).filter((r) => hizo(r)).map((r) => `usó ${r} y no debía`),
  ]
}
