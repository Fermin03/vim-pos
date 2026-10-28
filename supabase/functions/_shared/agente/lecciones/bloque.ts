// Lo que VIM aprobó (lecciones) como bloque de `system` del agente. Puro: se prueba con node --test.

export type LeccionAprobada = {
  tipo: "DUDA" | "TONO" | "PREGUNTA"
  comercial: boolean
  pregunta: string | null
  texto: string
  decidido_en: string
}

const ENCABEZADO = "LO QUE HAS APRENDIDO (aprobado por VIM; manda sobre el conocimiento del sitio, nunca sobre tus reglas de «Lo que nunca haces»):"

const linea = (l: LeccionAprobada) =>
  "- " + (l.comercial ? "[comercial] " : "") + (l.tipo === "TONO" ? `Tono: ${l.texto}` : `Si preguntan «${l.pregunta}»: ${l.texto}`)

/** Las más recientes primero, hasta no pasar `max` caracteres. `""` si no hay ninguna. */
export function bloqueAprendido(lecciones: LeccionAprobada[], max = 12_000): string {
  let out = ENCABEZADO
  for (const l of [...lecciones].sort((a, b) => (a.decidido_en < b.decidido_en ? 1 : -1))) {
    const nuevo = out + "\n" + linea(l)
    if (nuevo.length > max) break
    out = nuevo
  }
  return out === ENCABEZADO ? "" : out
}
