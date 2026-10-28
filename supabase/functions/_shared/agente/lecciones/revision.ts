// Revisión de lecciones por WhatsApp: Fermín contesta VER / SÍ / NO / corrección / QUITAR.
// Lógica pura; todo el I/O entra por DepsRevision.
import { MARCADOR } from './revisor.ts'

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
export const TEXTO_NO_ENTIENDO = 'No te entendí. Responde *SÍ*, *NO*, o escribe el texto nuevo así: «di que …».'
export const TEXTO_FALTA_RESPUESTA = 'Escribe la respuesta para esa pregunta.'
export const TEXTO_QUITADA = 'Listo, ya no lo digo.'
export const textoAvisoComercial = (texto: string) =>
  `Listo. Ojo: desde ahora a todos los que pregunten les digo: «${texto}». Para quitarlo, responde QUITAR a este mensaje o entra a /platform.`
export const textoEco = (texto: string) => `Listo. Desde ahora digo: «${texto}». Para quitarlo, responde QUITAR a este mensaje.`
export const textoConfirmacion = (a: number, d: number) => `Listo: ${a} aprendidas, ${d} descartadas.`

export const textoLeccion = (l: Leccion, i: number, n: number) =>
  `*Lección ${i} de ${n} · ${TIPOS[l.tipo]}${l.comercial ? ' · Comercial' : ''}*\n${l.evidencia}\n` +
  (l.pregunta ? `Si preguntan: «${l.pregunta}»\n` : '') +
  `El agente diría: «${l.texto}»\nResponde *SÍ*, *NO* o escribe la corrección.`

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const norm = (s: string) => sinAcentos(s).trim().replace(/^[¡¿]+|[.!?,;\s]+$/g, '')
const CORTESIA = new Set(['gracias', 'porfa', 'por', 'favor', 'ok', 'va'])
// Lo único que decide sin deslizar con una sola ENVIADA: «ok», «listo», 👍… podrían ser para otro aviso.
const EXPLICITAS = ['si', ...NO]

// Una corrección sin «mejor», «di que», «dile que» al inicio; vacía no se guarda.
function correccion(numero: number | null, texto: string): Accion {
  const limpio = texto.trim().replace(/^(mejor(?=[\s,:]|$)[\s,:]*)?(d[ií](le)?\s+que(?=[\s,:]|$))?[\s,:]*/i, '')
  return limpio ? { accion: 'CORRECCION', numero, texto: limpio } : { accion: 'NO_ENTIENDO' }
}

// Reglas, en orden:
// 1. «ver».  2. «N: texto» (N de 1 a 5, y sin dígito justo después de «:», para no partir «9:00 a 18:00…»).
// 3. Empieza con palabra SÍ/NO/QUITAR (exacta, o seguida de «,» «.» o espacio): si la cola es solo números y cortesía
//    («sí, gracias 2», «2 sí») es esa acción. «no, mejor …» / «no, di que …» es CORRECCION. Cualquier otra cola
//    («Sí, solo León») no se guarda: NO_ENTIENDO (ante la duda se pregunta).
// 4. Cualquier otra cosa de 1–2 palabras no se guarda (NO_ENTIENDO); más larga es CORRECCION sin número.
export function interpretar(texto: string): Accion {
  const t = texto.trim()
  const n = norm(texto)
  if (n === 'ver') return { accion: 'VER' }

  const c = t.match(/^([1-5])\s*:\s*(?!\d)([\s\S]+)$/)
  if (c) return correccion(Number(c[1]), c[2])

  const pre = n.match(/^(\d+)\s+(.+)$/) // «2 sí»
  const [num0, resto] = pre ? [Number(pre[1]), pre[2]] : [null, n]
  for (const [w, accion] of PALABRAS) {
    if (!resto.startsWith(w)) continue
    const sep = resto[w.length]
    if (sep !== undefined && !/[,.\s]/.test(sep)) continue
    const cola = resto.slice(w.length).split(/[,.\s]+/).filter(Boolean)
    if (cola.length <= 3 && cola.every((x) => /^\d+$/.test(x) || CORTESIA.has(x))) {
      const num = cola.find((x) => /^\d+$/.test(x))
      return { accion, numero: num0 ?? (num ? Number(num) : null) }
    }
    if (w === 'no' && num0 === null && /^(mejor|di(le)? que)( |$)/.test(cola.join(' ')))
      return correccion(null, t.replace(/^[¡¿]*no[,.\s]+/i, ''))
    return { accion: 'NO_ENTIENDO' }
  }
  if (t.split(/\s+/).length <= 2) return { accion: 'NO_ENTIENDO' }
  return correccion(null, t)
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
  if (!pendientes.length) return void (await deps.enviar('No hay lecciones pendientes.'))
  let mandadas = 0
  for (const l of pendientes) {
    const r = await deps.enviar(textoLeccion(l, mandadas + 1, pendientes.length))
    if (enviado(r)) await deps.actualizar(l.id, { wamid_envio: r.wamid, orden: ++mandadas, estado: 'ENVIADA' })
  }
}

export async function atenderFermin(e: { wamid: string; texto: string; respondeA: string | null }, deps: DepsRevision): Promise<void> {
  const a = interpretar(e.texto)
  if (a.accion === 'VER') return ver(deps)

  // ponytail: lee todo el historial en cada mensaje (~5 lecciones/día); filtrar por wamid en la base si crece.
  const todas = await deps.lecciones(['ENVIADA', 'APROBADA', 'DESCARTADA', 'CADUCADA', 'RETIRADA'])
  const enviadas = todas.filter((l) => l.estado === 'ENVIADA')
  const decidido_en = deps.ahora().toISOString()
  const yaEsta = (x: Leccion) => deps.enviar(`Esa lección ya está ${x.estado.toLowerCase()}.`)

  // QUITAR solo vale contestando al eco o aviso comercial de una lección aprobada.
  if (a.accion === 'QUITAR') {
    const q = e.respondeA ? todas.find((x) => x.wamid_confirmacion === e.respondeA) : undefined
    if (q?.estado === 'APROBADA') {
      await deps.actualizar(q.id, { estado: 'RETIRADA', decidido_en })
      await deps.enviar(TEXTO_QUITADA)
    } else if (q) await yaEsta(q)
    else if (e.respondeA && enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    return
  }

  let l: Leccion | undefined
  if (e.respondeA) l = enviadas.find((x) => x.wamid_envio === e.respondeA)
  if (!l && a.accion !== 'NO_ENTIENDO' && a.numero !== null) l = enviadas.find((x) => x.orden === a.numero)
  // Sin deslizar ni número, con una sola esperando, solo «sí»/«no» explícitos; una corrección libre no se aplica.
  if (!l && !e.respondeA && enviadas.length === 1 && (a.accion === 'SI' || a.accion === 'NO') && EXPLICITAS.includes(norm(e.texto).split(/[,.\s]+/)[0]))
    l = enviadas[0]
  if (!l) {
    const decidida = e.respondeA ? todas.find((x) => x.wamid_envio === e.respondeA) : undefined
    if (decidida) await yaEsta(decidida)
    else if (enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    return
  }
  if (a.accion === 'NO_ENTIENDO') return void (await deps.enviar(TEXTO_NO_ENTIENDO))
  if (a.accion === 'SI' && l.texto === MARCADOR) return void (await deps.enviar(TEXTO_FALTA_RESPUESTA))

  const cambios: Partial<Leccion> & { decidido_en: string } = { estado: a.accion === 'NO' ? 'DESCARTADA' : 'APROBADA', decidido_en }
  if (a.accion === 'CORRECCION') {
    if (traeDatosDeCliente(a.texto)) return void (await deps.enviar(TEXTO_DATOS_CLIENTE))
    cambios.texto = a.texto
    if (esComercial(a.texto)) cambios.comercial = true
  }
  const comercial = l.comercial || cambios.comercial
  await deps.actualizar(l.id, cambios)

  // Lo comercial y toda corrección llevan eco con el texto guardado, para poder quitarlo con QUITAR.
  if (cambios.estado === 'APROBADA' && (comercial || cambios.texto !== undefined)) {
    const t = cambios.texto ?? l.texto
    const r = await deps.enviar(comercial ? textoAvisoComercial(t) : textoEco(t))
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
