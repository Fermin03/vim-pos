"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Oculta el título visible (sigue en aria-label para a11y). */
  hideTitle?: boolean;
  /** Clases de la tarjeta (override de ancho/padding por defecto). */
  className?: string;
  /** Clases del velo de fondo (override del color/blur por defecto). */
  backdropClassName?: string;
}

/** Modal accesible: role=dialog, aria-modal, Esc cierra, foco atrapado.
 *
 * EL FOCO SOLO SE COLOCA AL ABRIR — Y ESO COSTÓ UN BUG FEO
 *
 * Este efecto dependía de `[open, onClose]`. Parece inofensivo y no lo era:
 * casi todas las pantallas pasan `onClose={() => setAlgo(false)}` en línea, o
 * sea una función NUEVA en cada render del padre. Y el POS re-renderiza solo:
 * `useConexion` comprueba la red cada 20 segundos y mueve estado al hacerlo.
 *
 * Resultado, cada 20 segundos y sin que nadie toque nada:
 *   · se ejecuta la limpieza del efecto → devuelve el foco a lo que estaba
 *     enfocado antes,
 *   · se vuelve a ejecutar el efecto → manda el foco al PRIMER enfocable del
 *     modal, que casi siempre es un botón.
 *
 * Para el cajero eso es: está capturando al cliente de un domicilio, de pronto
 * el cursor desaparece del campo y lo que teclea no entra a ningún lado. Y como
 * el foco quedó en un botón, la siguiente barra espaciadora lo PULSA. En el
 * modal de cliente el primer botón es «Buscar», así que el formulario entero
 * desaparece con todo lo capturado — y parece que el modal se cerró solo.
 *
 * La dependencia era el bug. `onClose` vive ahora en una ref: el efecto solo
 * depende de `open`, así que el foco se coloca al abrir y no se vuelve a tocar.
 * El teclado sigue leyendo siempre la última versión del callback.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  hideTitle,
  className,
  backdropClassName,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  // La ref se actualiza en cada render, pero cambiarla NO reinicia el efecto.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusables = () =>
      node?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [];

    /* Al abrir, el foco va al primer CAMPO si el modal tiene alguno; si no, al
       primer enfocable. Antes iba siempre al primer enfocable, que suele ser un
       botón de la cabecera: en un modal de captura eso obliga a tabular o a
       tocar la pantalla antes de escribir la primera letra, y en uno de
       confirmación deja el dedo sobre un botón que quizá borra algo. */
    const els = Array.from(focusables());
    const campo = els.find((e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName));
    (campo ?? els[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar.current();
      if (e.key === "Tab") {
        const actuales = Array.from(focusables());
        if (actuales.length === 0) return;
        const first = actuales[0]!;
        const last = actuales[actuales.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Solo al cerrar de verdad: devuelve el foco a lo que lo tenía antes.
      prevFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-vim-fade",
        backdropClassName,
      )}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-vim-pop",
          className ?? "w-full max-w-md rounded-lg bg-surface p-6 shadow-xl",
        )}
      >
        {hideTitle ? (
          <h2 className="sr-only">{title}</h2>
        ) : (
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
