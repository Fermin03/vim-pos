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
export const textoFaltaRespuesta = (n: number | null) =>
  `Escribe la respuesta: desliza la lección y escríbela, o mándala como «${n ?? 'N'}: texto».`
export const TEXTO_QUITADA = 'Listo, ya no lo digo.'
export const TEXTO_COMO_QUITAR = 'Para quitar algo, desliza el mensaje de la lección o el «Listo…» y responde QUITAR, o entra a /platform.'
export const TEXTO_NO_APROBADA = 'Esa lección aún no está aprobada; responde NO para descartarla.'
export const TEXTO_SIN_ESPERA = 'No hay lecciones esperando respuesta. Responde VER para ver las nuevas.'
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

// Una corrección sin «mejor», «di que», «dile que» al inicio; vacía no se guarda. Si lo que queda es solo
// SÍ/NO solo («1: no», «2: sí») decide en vez de guardar «no» como texto. Tras quitar «di que»/«mejor»,
// un «sí»/«no» suelto pide lo contrario del texto («No, di que sí»): no se decide ni se guarda, se pregunta.
function correccion(numero: number | null, texto: string): Accion {
  const limpio = texto.trim().replace(/^(mejor(?=[\s,:]|$)[\s,:]*)?(d[ií](le)?\s+que(?=[\s,:]|$))?[\s,:]*/i, '')
  const p = porPalabra(limpio)
  if (p?.accion === 'SI' || p?.accion === 'NO') return limpio === texto.trim() ? { accion: p.accion, numero: numero ?? p.numero } : { accion: 'NO_ENTIENDO' }
  return limpio ? { accion: 'CORRECCION', numero, texto: limpio } : { accion: 'NO_ENTIENDO' }
}

// Empieza con palabra SÍ/NO/QUITAR (exacta, o seguida de «,» «.» o espacio; «2 sí» = «sí 2»)? null si no.
// Cola de solo números y cortesía («sí, gracias 2») → esa acción. «no, mejor …» / «no, di que …» → CORRECCION.
// Cualquier otra cola («Sí, solo León») no se guarda: NO_ENTIENDO (ante la duda se pregunta).
function porPalabra(t: string): Accion | null {
  const n = norm(t)
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
      return correccion(null, t.trim().replace(/^[¡¿]*no[,.\s]+/i, ''))
    return { accion: 'NO_ENTIENDO' }
  }
  return null
}

// Reglas, en orden: 1. «ver».  2. «N: texto» (N de 1 a 5, y sin dígito justo después de «:», para no partir
// «9:00 a 18:00…»).  3. porPalabra.  4. Cualquier otra cosa de 1–2 palabras no se guarda; más larga es CORRECCION.
export function interpretar(texto: string): Accion {
  const t = texto.trim()
  if (norm(t) === 'ver') return { accion: 'VER' }
  const c = t.match(/^([1-5])\s*:\s*(?!\d)([\s\S]+)$/)
  if (c) return correccion(Number(c[1]), c[2])
  return porPalabra(t) ?? (t.split(/\s+/).length <= 2 ? { accion: 'NO_ENTIENDO' } : correccion(null, t))
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

  // La lección a la que contestó deslizando (su mensaje o su «Listo…»), en cualquier estado.
  const deslizada = e.respondeA ? todas.find((x) => x.wamid_envio === e.respondeA || x.wamid_confirmacion === e.respondeA) : undefined

  // QUITAR: deslizando el mensaje de una lección aprobada o su «Listo…».
  if (a.accion === 'QUITAR') {
    if (deslizada?.estado === 'APROBADA') {
      await deps.actualizar(deslizada.id, { estado: 'RETIRADA', decidido_en })
      await deps.enviar(TEXTO_QUITADA)
    } else if (deslizada?.estado === 'ENVIADA') await deps.enviar(TEXTO_NO_APROBADA)
    else if (deslizada) await yaEsta(deslizada)
    else await deps.enviar(TEXTO_COMO_QUITAR)
    return
  }

  // Deslizó una lección ya decidida (aunque traiga número): se le dice, no se toca la de ese número en la tanda nueva.
  if (deslizada && deslizada.estado !== 'ENVIADA') return void (await yaEsta(deslizada))
  let l = deslizada
  // El número solo cuenta si no deslizó ninguna lección.
  if (!l && a.accion !== 'NO_ENTIENDO' && a.numero !== null) l = enviadas.find((x) => x.orden === a.numero)
  // Sin deslizar ni número, con una sola esperando, solo «sí»/«no» explícitos; una corrección libre no se aplica.
  if (!l && !e.respondeA && enviadas.length === 1 && (a.accion === 'SI' || a.accion === 'NO') && a.numero === null &&
    EXPLICITAS.includes(norm(e.texto).split(/[,.\s]+/)[0]))
    l = enviadas[0]
  if (!l) {
    if (enviadas.length) await deps.enviar(TEXTO_DESLIZA)
    else if (a.accion === 'CORRECCION' || (a.accion !== 'NO_ENTIENDO' && a.numero !== null)) await deps.enviar(TEXTO_SIN_ESPERA)
    return
  }
  if (a.accion === 'NO_ENTIENDO') return void (await deps.enviar(TEXTO_NO_ENTIENDO))
  if (a.accion === 'SI' && l.texto === MARCADOR) return void (await deps.enviar(textoFaltaRespuesta(l.orden)))

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
