"use client";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Mide el hueco de un elemento y lo mantiene al día.
 *
 * Lo usan las tres cuadrículas que no scrollean —catálogo, slots de combo y modificadores—, que
 * necesitan el tamaño REAL del contenedor para decidir cuántas celdas caben. Nunca cortes por
 * viewport (`lg:`/`xl:`): el ancho que importa es el del hueco, no el de la ventana.
 *
 * Mide **en firme al montar** y no solo con `ResizeObserver`, porque el observer entrega sus avisos
 * como parte del ciclo de pintado: si la ventana está oculta o minimizada cuando el componente se
 * monta, no llega ninguno y la cuadrícula se quedaría creyendo que mide 0×0 —una celda por página—
 * hasta el siguiente cambio de tamaño. `getBoundingClientRect` sí responde sin pintar.
 *
 * El elemento medido no debería llevar padding: así el número que entra al cálculo es el mismo que
 * el ancho real de la cuadrícula.
 */
export function useHueco<T extends HTMLElement>(): [React.RefObject<T | null>, { ancho: number; alto: number }] {
  const ref = useRef<T>(null);
  const [hueco, setHueco] = useState({ ancho: 0, alto: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      // Sin el guardia de igualdad, cada medición idéntica dispararía un render de más.
      setHueco((prev) =>
        Math.abs(prev.ancho - r.width) < 0.5 && Math.abs(prev.alto - r.height) < 0.5
          ? prev
          : { ancho: r.width, alto: r.height },
      );
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  return [ref, hueco];
}
