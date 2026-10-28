// Lo que VIM aprobó (lecciones) como bloque de `system` del agente. Puro: se prueba con node --test.

export type LeccionAprobada = {
  tipo: "DUDA" | "TONO" | "PREGUNTA"
  comercial: boolean
  pregunta: string | null
  texto: string
  decidido_en: string
}

const ENCABEZADO = "LO QUE HAS APRENDIDO (aprobado por VIM; manda sobre el conocimiento del sitio, nunca sobre tus reglas de «Lo que nunca haces»):"

// Cada lección en una sola línea: un salto dentro del texto no puede abrir una «regla» nueva en el prompt.
const plano = (s: string) => s.replace(/[\r\n\u2028\u2029\t]+/g, " ").trim()

const linea = (l: LeccionAprobada) =>
  "- " + (l.comercial ? "[comercial] " : "") + (l.tipo === "TONO" ? `Tono: ${plano(l.texto)}` : `Si preguntan «${plano(l.pregunta!)}»: ${plano(l.texto)}`)

/** Las más recientes primero, hasta no pasar `max` caracteres. `""` si no hay ninguna. */
export function bloqueAprendido(lecciones: LeccionAprobada[], max = 12_000): string {
  let out = ENCABEZADO
  for (const l of [...lecciones].sort((a, b) => (a.decidido_en < b.decidido_en ? 1 : -1))) {
    if (l.tipo !== "TONO" && !l.pregunta?.trim()) continue // DUDA/PREGUNTA sin pregunta: saldría «null»
    const nuevo = out + "\n" + linea(l)
    if (nuevo.length > max) break
    out = nuevo
  }
  return out === ENCABEZADO ? "" : out
}
