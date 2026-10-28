// Revisión de lecciones por WhatsApp: Fermín contesta VER / SÍ / NO / corrección / QUITAR.
// Lógica pura; todo el I/O entra por DepsRevision.

export type Leccion = {
  id: string
  tipo: 'DUDA' | 'TONO' | 'PREGUNTA'
  comercial: boolean
  pregunta: string | null
  texto: string
  evidencia: string
  estado: string
  orden: number | null
  wamid_envio: string | null
  wamid_confirmacion: string | null
}

export type DepsRevision = {
  lecciones(estados: string[]): Promise<Leccion[]>
  actualizar(id: string, cambios: Partial<Leccion> & { decidido_en?: string }): Promise<void>
  enviar(texto: string): Promise<{ ok: boolean; wamid: string | null }>
  ahora(): Date
}

export type Accion =
  | { accion: 'VER' }
  | { accion: 'SI' | 'NO' | 'QUITAR'; numero: number | null }
  | { accion: 'CORRECCION'; numero: number | null; texto: string }

const MAX_POR_VER = 5
const TIPOS = { DUDA: 'Duda técnica', TONO: 'Tono', PREGUNTA: 'Pregunta sin respuesta' }
const PALABRAS: Record<string, 'SI' | 'NO' | 'QUITAR'> = { si: 'SI', va: 'SI', ok: 'SI', no: 'NO', quitar: 'QUITAR' }

export const TEXTO_DESLIZA = 'Desliza el mensaje de la lección y contesta ahí (o escribe el número: «SÍ 2»).'
export const TEXTO_DATOS_CLIENTE = 'Esa corrección trae datos de un cliente; escríbela sin teléfonos ni correos.'
export const textoAvisoComercial = (texto: string) =>
  `Listo. Ojo: desde ahora a todos los que pregunten les digo: «${texto}». Para quitarlo, responde QUITAR a este mensaje o entra a /platform.`
export const textoConfirmacion = (a: number, d: number) => `Listo: ${a} aprendidas, ${d} descartadas.`

export const textoLeccion = (l: Leccion, i: number, n: number) =>
  `*Lección ${i} de ${n} · ${TIPOS[l.tipo]}${l.comercial ? ' · Comercial' : ''}*\n${l.evidencia}\nEl agente aprendería: «${l.texto}»\nResponde *SÍ*, *NO* o escribe la corrección.`

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/^[¡¿]+|[.!?,;\s]+$/g, '')

export function interpretar(texto: string): Accion {
  const n = norm(texto)
  if (n === 'ver') return { accion: 'VER' }
  if (PALABRAS[n]) return { accion: PALABRAS[n], numero: null }
  const m = n.match(/^([a-z]+)\s+(\d+)$/) ?? n.match(/^(\d+)\s+([a-z]+)$/)
  if (m) {
    const [palabra, num] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
    if (PALABRAS[palabra]) return { accion: PALABRAS[palabra], numero: Number(num) }
  }
  const c = texto.trim().match(/^(\d+)\s*:\s*([\s\S]+)$/)
  if (c) return { accion: 'CORRECCION', numero: Number(c[1]), texto: c[2].trim() }
  return { accion: 'CORRECCION', numero: null, texto: texto.trim() }
}

const traeDatosDeCliente = (t: string) => /\d{10,}/.test(t.replace(/[\s\-().]/g, '')) || /\S+@\S+\.\S+/.test(t)
const esComercial = (t: string) => /\$|precio|descuento|promo|\bplan/i.test(t)

async function verPendientes(deps: DepsRevision) {
  const pendientes = (await deps.lecciones(['PENDIENTE'])).slice(0, MAX_POR_VER)
  for (const [k, l] of pendientes.entries()) {
    const r = await deps.enviar(textoLeccion(l, k + 1, pendientes.length))
    if (r.ok) await deps.actualizar(l.id, { wamid_envio: r.wamid, orden: k + 1, estado: 'ENVIADA' })
  }
}

export async function atenderFermin(e: { wamid: string; texto: string; respondeA: string | null }, deps: DepsRevision): Promise<void> {
  const a = interpretar(e.texto)
  if (a.accion === 'VER') return verPendientes(deps)

  const todas = await deps.lecciones(['ENVIADA', 'APROBADA'])
  const enviadas = todas.filter((l) => l.estado === 'ENVIADA')
  const decidido_en = deps.ahora().toISOString()

  // QUITAR solo vale contestando al aviso comercial de una lección aprobada.
  if (a.accion === 'QUITAR') {
    const l = e.respondeA && todas.find((x) => x.estado === 'APROBADA' && x.wamid_confirmacion === e.respondeA)
    if (l) await deps.actualizar(l.id, { estado: 'RETIRADA', decidido_en })
    return
  }

  let l: Leccion | undefined
  if (e.respondeA) l = enviadas.find((x) => x.wamid_envio === e.respondeA) // respondeA ajeno: mensaje normal, se ignora
  else if (a.numero !== null) l = enviadas.find((x) => x.orden === a.numero)
  else if (enviadas.length === 1) l = enviadas[0]
  if (!l) {
    if (!e.respondeA && enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    return
  }

  const cambios: Partial<Leccion> & { decidido_en: string } = { estado: a.accion === 'NO' ? 'DESCARTADA' : 'APROBADA', decidido_en }
  if (a.accion === 'CORRECCION') {
    if (traeDatosDeCliente(a.texto)) return void (await deps.enviar(TEXTO_DATOS_CLIENTE))
    cambios.texto = a.texto
    if (esComercial(a.texto)) cambios.comercial = true
  }
  await deps.actualizar(l.id, cambios)

  if (cambios.estado === 'APROBADA' && (l.comercial || cambios.comercial)) {
    const r = await deps.enviar(textoAvisoComercial(cambios.texto ?? l.texto))
    if (r.ok) await deps.actualizar(l.id, { wamid_confirmacion: r.wamid })
  }

  if (enviadas.length > 1) return
  // Tanda = lecciones con orden asignado que ya no están ENVIADA; al cerrar la tanda se les limpia el orden.
  const tanda = (await deps.lecciones(['APROBADA', 'DESCARTADA'])).filter((x) => x.orden !== null)
  const aprendidas = tanda.filter((x) => x.estado === 'APROBADA').length
  await deps.enviar(textoConfirmacion(aprendidas, tanda.length - aprendidas))
  for (const x of tanda) await deps.actualizar(x.id, { orden: null })
}
