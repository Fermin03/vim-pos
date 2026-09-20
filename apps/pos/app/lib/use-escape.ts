"use client";
import { useEffect } from "react";
import { PilaEscape } from "./escape";

/**
 * Escape como atajo de "volver" o "cerrar".
 *
 * En una caja el teclado gana a la pantalla: el cajero ya tiene las manos ahí capturando, y
 * llevar la mano al mouse o al táctil para cerrar un modal cuesta más de lo que parece cuando se
 * repite doscientas veces al día.
 *
 * Todas las pantallas comparten UNA pila y UN listener: manda la de más arriba, que es la última
 * en registrarse. Antes cada una colgaba su propio `keydown` y ganaba la primera en registrarse
 * —la de más abajo, porque React monta de adentro hacia afuera—, así que una pantalla tapada le
 * robaba la tecla a la que el cajero estaba mirando. La precedencia DENTRO de cada pantalla la
 * sigue decidiendo quien llama: pasar `null` es decir "no tengo nada que cerrar", y entonces la
 * tecla baja a la pantalla de abajo.
 *
 * `activo` es el mismo "no tengo nada que cerrar" en forma de bandera, para cuando la acción
 * existe pero la pantalla no debe atender.
 */

const pila = new PilaEscape();
let oyentes = 0;

function alTeclear(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  // Se marca como consumido solo si alguien la atendió, para no tragarse la tecla de un
  // `<dialog>` o un `<select>` nativo cuando el POS no tiene nada abierto.
  if (pila.disparar()) e.preventDefault();
}

export function useEscape(onEscape: (() => void) | null | undefined, activo = true): void {
  useEffect(() => {
    if (!activo || !onEscape) return;
    const quitar = pila.registrar(onEscape);
    if (oyentes++ === 0) window.addEventListener("keydown", alTeclear);
    return () => {
      quitar();
      if (--oyentes === 0) window.removeEventListener("keydown", alTeclear);
    };
  }, [onEscape, activo]);
}
