/**
 * Quién se queda con la tecla Escape.
 *
 * En el POS hay varias pantallas escuchando Escape al mismo tiempo: el armazón de `home-pos` con
 * su torre de modales, la lista de cuentas de un modo (Comedor, Para llevar, Domicilio) y las
 * pantallas que se pintan ENCIMA de esa lista (el mapa de mesas, las reservaciones). Antes cada
 * una colgaba su propio `keydown` de `window` y ganaba la que se hubiera registrado primero —que
 * es la de más ABAJO, porque React monta de adentro hacia afuera—. Resultado: Escape dentro del
 * diálogo de «Nueva reservación» lo atendía la lista de Comedor, escondida detrás, y su última
 * capa es «volver al inicio».
 *
 * Aquí la regla es la única que se sostiene sola: **manda la de más arriba**. Arriba es la última
 * en registrarse, y volver a registrarse sube. Eso hace que el sistema se corrija solo: quien
 * acaba de abrir algo recalcula su acción de Escape y, al hacerlo, sube a lo alto de la pila.
 *
 * Dos piezas, las dos puras para poder probarlas sin navegador:
 *  - `capaVisible`: la precedencia DENTRO de una pantalla (del modal más interno hacia afuera).
 *  - `PilaEscape`: la precedencia ENTRE pantallas.
 */

/** Una capa de Escape: si está a la vista, y qué hacer si Escape le toca a ella. */
export type CapaEscape = [visible: boolean, accion: () => void];

/**
 * La acción de la primera capa visible, o `null` si no hay ninguna.
 *
 * El orden de la lista es la precedencia: del modal más interno al más externo. `null` no
 * significa «no hacer nada», significa «esta pantalla no tiene nada que cerrar» — y entonces la
 * tecla le toca a la pantalla de abajo.
 */
export function capaVisible(capas: CapaEscape[]): (() => void) | null {
  return capas.find(([visible]) => visible)?.[1] ?? null;
}

/** Pila de pantallas que escuchan Escape. Gana la de más arriba. */
export class PilaEscape {
  /* Cada registro es un hueco propio, no la función: dos pantallas distintas pueden pasar la
     misma acción (`onSalir` viaja como prop) y colapsarlas en una sola haría que al desmontarse
     una se llevara la tecla de la otra. */
  #pila: { accion: () => void }[] = [];

  /** Sube esta acción a lo alto de la pila. Devuelve cómo quitarla (idempotente). */
  registrar(accion: () => void): () => void {
    const hueco = { accion };
    this.#pila.push(hueco);
    return () => {
      const i = this.#pila.indexOf(hueco);
      if (i >= 0) this.#pila.splice(i, 1);
    };
  }

  /** Ejecuta la acción de más arriba. `false` si no había nadie escuchando. */
  disparar(): boolean {
    const arriba = this.#pila.at(-1);
    if (!arriba) return false;
    arriba.accion();
    return true;
  }

  get vacia(): boolean {
    return this.#pila.length === 0;
  }
}
