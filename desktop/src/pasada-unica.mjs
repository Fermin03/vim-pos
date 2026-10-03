// Coordina una tarea que no debe correr dos veces a la vez, sin perder los avisos que llegan
// mientras corre.
//
// Caso de uso: bajar las imágenes de los anuncios después de cada pull. Si un pull llegaba con una
// pasada en curso, antes se descartaba el aviso y los anuncios nuevos esperaban un ciclo entero
// (minutos) aunque ya estuvieran en la base. Ahora el aviso se recuerda y, al terminar la pasada
// actual, corre exactamente una más (da igual cuántos avisos llegaron en el ínterin: una pasada
// ve todo lo que hay en la base).
//
// La función que devuelve nunca lanza ni rechaza: es un adorno que no puede tocar a quien la llama.

/** @param {() => Promise<unknown> | unknown} tarea una pasada completa */
export function crearCoordinadorDePasadas(tarea) {
  let enCurso = null;
  let pendiente = false;
  // `correr` ejecuta la tarea de forma síncrona hasta su primer await: si esta termina sin esperar
  // nada (lanza al instante), el `finally` corre ANTES de que se asigne `enCurso` y lo dejaría atorado.
  let terminada = false;

  const correr = async () => {
    try {
      // Mientras haya avisos acumulados se repite; cada vuelta limpia la marca ANTES de empezar,
      // para que un aviso que llegue durante la pasada pida otra.
      do {
        pendiente = false;
        try { await tarea(); } catch { /* una pasada fallida no impide la siguiente ni atora esto */ }
      } while (pendiente);
    } finally {
      enCurso = null;
      terminada = true;
    }
  };

  return function pedirPasada() {
    if (enCurso) { pendiente = true; return enCurso; }
    terminada = false;
    const p = correr();
    if (!terminada) enCurso = p;
    return p;
  };
}
