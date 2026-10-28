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
  lecciones(estados: string[]): Promise<Leccion[]> // ordenadas por creado_en
  actualizar(id: string, cambios: Partial<Leccion> & { decidido_en?: string }): Promise<void>
  enviar(texto: string): Promise<{ ok: boolean; wamid: string | null }>
  ahora(): Date
}

export type Accion =
  | { accion: 'VER' }
  | { accion: 'SI' | 'NO' | 'QUITAR'; numero: number | null }
  | { accion: 'CORRECCION'; numero: number | null; texto: string }
  | { accion: 'NO_ENTIENDO' } // 1–2 palabras que no son SÍ/NO/QUITAR: no se guardan como corrección

const MAX_POR_VER = 5
const TIPOS = { DUDA: 'Duda técnica', TONO: 'Tono', PREGUNTA: 'Pregunta sin respuesta' }
const SI = ['si', 'va', 'ok', 'okay', 'okey', 'dale', 'sale', 'claro', 'perfecto', 'listo', 'correcto', 'de acuerdo', '👍', '✅']
const NO = ['no', 'nel', 'nop', '❌', '👎']
// Más largas primero para que «okay» gane a «ok» y «de acuerdo» a cualquier prefijo.
const PALABRAS: [string, 'SI' | 'NO' | 'QUITAR'][] = [
  ...SI.map((w) => [w, 'SI'] as [string, 'SI']),
  ...NO.map((w) => [w, 'NO'] as [string, 'NO']),
  ['quitar', 'QUITAR'] as [string, 'QUITAR'],
].sort((a, b) => b[0].length - a[0].length)

export const TEXTO_DESLIZA = 'Desliza el mensaje de la lección y contesta ahí (o escribe el número: «SÍ 2»).'
export const TEXTO_DATOS_CLIENTE = 'Esa corrección trae datos de un cliente; escríbela sin teléfonos ni correos.'
export const TEXTO_NO_ENTIENDO = '¿SÍ, NO o escribe la corrección completa?'
export const textoAvisoComercial = (texto: string) =>
  `Listo. Ojo: desde ahora a todos los que pregunten les digo: «${texto}». Para quitarlo, responde QUITAR a este mensaje o entra a /platform.`
export const textoConfirmacion = (a: number, d: number) => `Listo: ${a} aprendidas, ${d} descartadas.`

export const textoLeccion = (l: Leccion, i: number, n: number) =>
  `*Lección ${i} de ${n} · ${TIPOS[l.tipo]}${l.comercial ? ' · Comercial' : ''}*\n${l.evidencia}\nEl agente aprendería: «${l.texto}»\nResponde *SÍ*, *NO* o escribe la corrección.`

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const norm = (s: string) => sinAcentos(s).trim().replace(/^[¡¿]+|[.!?,;\s]+$/g, '')

// Reglas, en orden:
// 1. «ver».  2. «N: texto» (N de 1 a 5, y sin dígito justo después de «:», para no partir «9:00 a 18:00…»).
// 3. Empieza con palabra SÍ/NO/QUITAR (exacta, o seguida de «,» «.» o espacio): con cola de 0–2 palabras es esa acción
//    (con el primer número de la cola si lo hay: «sí, 2», «2 sí»). «no, …» con cola más larga es una CORRECCION del
//    texto tras «no,», sin un «mejor di que»/«mejor» inicial.
// 4. Cualquier otra cosa de 1–2 palabras no se guarda (NO_ENTIENDO); más larga es CORRECCION sin número.
export function interpretar(texto: string): Accion {
  const t = texto.trim()
  const n = norm(texto)
  if (n === 'ver') return { accion: 'VER' }

  const c = t.match(/^([1-5])\s*:\s*(?!\d)([\s\S]+)$/)
  if (c) return { accion: 'CORRECCION', numero: Number(c[1]), texto: c[2].trim() }

  const pre = n.match(/^(\d+)\s+(.+)$/) // «2 sí»
  const [num0, resto] = pre ? [Number(pre[1]), pre[2]] : [null, n]
  for (const [w, accion] of PALABRAS) {
    if (!resto.startsWith(w)) continue
    const sep = resto[w.length]
    if (sep !== undefined && !/[,.\s]/.test(sep)) continue
    const cola = resto.slice(w.length).replace(/^[,.\s]+/, '')
    const palabras = cola ? cola.split(/\s+/) : []
    if (palabras.length <= 2) {
      const num = cola.match(/\d+/)
      return { accion, numero: num0 ?? (num ? Number(num[0]) : null) }
    }
    if (accion === 'NO' && sep === ',' && num0 === null) {
      const corr = t.slice(t.indexOf(',') + 1).trim().replace(/^mejor(\s+di(le)?\s+que)?\s+/i, '')
      return { accion: 'CORRECCION', numero: null, texto: corr }
    }
    break
  }
  if (t.split(/\s+/).length <= 2) return { accion: 'NO_ENTIENDO' }
  return { accion: 'CORRECCION', numero: null, texto: t }
}

const traeDatosDeCliente = (t: string) => /\d{10,}/.test(t.replace(/[\s\-().]/g, '')) || /\S+@\S+\.\S+/.test(t)
const esComercial = (t: string) =>
  /\$|%|precio|descuento|promo|\bplan|cuesta|costo|cobr|pesos|mxn|gratis|oferta|mensual|meses sin/.test(sinAcentos(t))

const enviado = (r: { ok: boolean; wamid: string | null }) => r.ok && r.wamid !== null

async function ver(deps: DepsRevision) {
  const conOrden = (await deps.lecciones(['ENVIADA', 'APROBADA', 'DESCARTADA', 'CADUCADA', 'RETIRADA'])).filter((x) => x.orden !== null)
  const abiertas = conOrden.filter((x) => x.estado === 'ENVIADA').sort((x, y) => x.orden! - y.orden!)
  // Tanda abierta (hay ENVIADA): se reenvían esas mismas, con el mismo orden, y no se mandan PENDIENTE hasta cerrarla.
  if (abiertas.length) {
    for (const l of abiertas) {
      const r = await deps.enviar(textoLeccion(l, l.orden!, conOrden.length))
      if (enviado(r)) await deps.actualizar(l.id, { wamid_envio: r.wamid })
    }
    return
  }
  // Sin ENVIADA: lo que quedó con orden es de una tanda que no cerró (p. ej. la última caducó); se limpia antes de numerar.
  for (const x of conOrden) await deps.actualizar(x.id, { orden: null })
  const pendientes = (await deps.lecciones(['PENDIENTE'])).slice(0, MAX_POR_VER)
  let mandadas = 0
  for (const l of pendientes) {
    const r = await deps.enviar(textoLeccion(l, mandadas + 1, pendientes.length))
    if (enviado(r)) await deps.actualizar(l.id, { wamid_envio: r.wamid, orden: ++mandadas, estado: 'ENVIADA' })
  }
}

export async function atenderFermin(e: { wamid: string; texto: string; respondeA: string | null }, deps: DepsRevision): Promise<void> {
  const a = interpretar(e.texto)
  if (a.accion === 'VER') return ver(deps)

  const todas = await deps.lecciones(['ENVIADA', 'APROBADA'])
  const enviadas = todas.filter((l) => l.estado === 'ENVIADA')
  const decidido_en = deps.ahora().toISOString()

  // QUITAR solo vale contestando al aviso comercial de una lección aprobada.
  if (a.accion === 'QUITAR') {
    const q = e.respondeA ? todas.find((x) => x.estado === 'APROBADA' && x.wamid_confirmacion === e.respondeA) : undefined
    if (q) await deps.actualizar(q.id, { estado: 'RETIRADA', decidido_en })
    else if (e.respondeA && enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    return
  }

  let l: Leccion | undefined
  if (e.respondeA) l = enviadas.find((x) => x.wamid_envio === e.respondeA)
  else if (a.accion !== 'NO_ENTIENDO' && a.numero !== null) l = enviadas.find((x) => x.orden === a.numero)
  else if (enviadas.length === 1 && (a.accion === 'SI' || a.accion === 'NO')) l = enviadas[0] // una corrección libre sin deslizar ni número no se aplica
  if (!l) {
    if (enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    return
  }
  if (a.accion === 'NO_ENTIENDO') return void (await deps.enviar(TEXTO_NO_ENTIENDO))

  const cambios: Partial<Leccion> & { decidido_en: string } = { estado: a.accion === 'NO' ? 'DESCARTADA' : 'APROBADA', decidido_en }
  if (a.accion === 'CORRECCION') {
    if (traeDatosDeCliente(a.texto)) return void (await deps.enviar(TEXTO_DATOS_CLIENTE))
    cambios.texto = a.texto
    if (esComercial(a.texto)) cambios.comercial = true
  }
  await deps.actualizar(l.id, cambios)

  if (cambios.estado === 'APROBADA' && (l.comercial || cambios.comercial)) {
    const r = await deps.enviar(textoAvisoComercial(cambios.texto ?? l.texto))
    if (enviado(r)) await deps.actualizar(l.id, { wamid_confirmacion: r.wamid }) // si falla el aviso, la aprobación se queda
  }

  // Se relee tras actualizar para no cerrar la tanda con una foto vieja.
  if ((await deps.lecciones(['ENVIADA'])).length) return
  // Tanda = lecciones con orden asignado que ya no están ENVIADA; al cerrarla se les limpia el orden.
  const tanda = (await deps.lecciones(['APROBADA', 'DESCARTADA'])).filter((x) => x.orden !== null)
  const aprendidas = tanda.filter((x) => x.estado === 'APROBADA').length
  await deps.enviar(textoConfirmacion(aprendidas, tanda.length - aprendidas))
  for (const x of tanda) await deps.actualizar(x.id, { orden: null })
}
