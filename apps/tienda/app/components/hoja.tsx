"use client";
// La hoja: sube desde abajo en el teléfono y es un diálogo centrado en escritorio (globals.css,
// `.hoja`). Es un <dialog> nativo abierto con showModal(): el navegador atrapa el foco, cierra con
// Escape, devuelve el foco a quien la abrió y deja inerte lo de atrás. Aquí solo se añade lo que el
// navegador no trae: cerrar tocando el velo y cerrar arrastrando hacia abajo.
//
// No es el `Modal` de @vim/ui porque ese manda el foco al primer CAMPO: en un teléfono eso abre el
// teclado encima del producto que se acaba de tocar. Aquí el foco cae en «Cerrar».
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "@vim/ui/styles";
import { FOCO, IconoCerrar, PARTE } from "./piezas";

/**
 * El contenido de una hoja: una COLUMNA (la envoltura, o el <form> que la sustituye) con el CUERPO
 * que se desplaza y el PIE fijo.
 *
 * LA REGLA DE ALTURA: la hoja mide lo que mide su contenido, hasta su tope (`max-height` en
 * globals.css); al llegar al tope el cuerpo se encoge y se desplaza, y el pie no se mueve. Por eso
 * todo es `flex-initial` (`flex: 0 1 auto`) con `min-h-0`, y NUNCA `flex-1`.
 *
 * `flex-1` es `flex: 1 1 0%`, y ese `0%` solo significa «lo que mida el contenido» mientras la
 * altura del contenedor sea indefinida. Chrome lo lee así. Safari no: un <dialog> trae de fábrica
 * `height: fit-content`, y WebKit trata a un elemento posicionado con una altura que no es `auto`
 * como de altura conocida, así que resuelve el `0%` como 0 de verdad. La envoltura aportaba 0 a la
 * altura de la hoja y en el iPhone solo se veía la cabecera (oct 2026). Sin porcentajes en la cadena
 * no hay nada que un navegador pueda resolver distinto.
 */
export const COLUMNA = "flex min-h-0 flex-initial flex-col";
export const CUERPO = "min-h-0 flex-initial overflow-y-auto overscroll-contain";
export const PIE = "flex-none border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";

/**
 * ¿Lo último que hizo el cliente fue con el teclado? Al abrir, el foco cae en «Cerrar», y Safari
 * pinta el anillo de foco en todo foco puesto por código aunque la hoja se abriera con el dedo. El
 * anillo es para quien navega con teclado: solo entonces se deja ver (globals.css, `data-sin-anillo`).
 */
let conTeclado = false;
if (typeof document !== "undefined") {
  document.addEventListener("keydown", () => { conTeclado = true; }, true);
  document.addEventListener("pointerdown", () => { conTeclado = false; }, true);
}
/** Menos que esto no es un teclado: es la barra del navegador entrando o saliendo. */
const MINIMO_DE_TECLADO = 60;

export function Hoja({ abierta, alCerrar, fija = false, titulo, children }: {
  abierta: boolean; alCerrar: () => void;
  /**
   * No se puede cerrar ahora (hay un pedido enviándose): ni Escape, ni el velo, ni «Cerrar», ni
   * arrastrando. Salir a medio envío dejaba mandar el mismo pedido dos veces.
   */
  fija?: boolean;
  titulo: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  /** El arrastre en curso: dónde se tomó la hoja, y la última posición con su velocidad (px/ms). */
  const arrastre = useRef<{ y0: number; y: number; t: number; v: number } | null>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) {
      botonCerrar.current?.toggleAttribute("data-sin-anillo", !conTeclado);
      // Lo que dejó el arrastre o el desplazamiento de la vez anterior.
      d.style.transitionDuration = "";
      d.removeAttribute("data-corrida");
      d.showModal();
    } else if (!abierta && d.open) d.close();
  }, [abierta]);

  // El teclado de iOS no encoge la página: se pone ENCIMA de lo que está pegado abajo, y con él el
  // pie de la hoja (el botón) y a veces el campo. Mientras la hoja está abierta se sube lo que el
  // teclado tapa y se limita a lo que queda a la vista, y el campo con foco se trae a la vista.
  // En Android la página ya se encoge sola (`interactiveWidget`, layout.tsx) y aquí no pasa nada.
  useEffect(() => {
    const d = ref.current, vv = window.visualViewport;
    if (!abierta || !d || !vv) return;
    let cuadro = 0;
    const acomodar = () => {
      cuadro = 0;
      // Con zoom de pellizco lo visible también se achica y no es el teclado: no se toca.
      const tapado = vv.scale > 1.01 ? 0 : innerHeight - vv.height - vv.offsetTop;
      // Solo como hoja pegada abajo: el diálogo centrado (640 px o más) no depende de `bottom`.
      const conElTeclado = tapado > MINIMO_DE_TECLADO && !matchMedia("(min-width: 640px)").matches;
      d.style.bottom = conElTeclado ? `${Math.round(tapado)}px` : "";
      d.style.maxHeight = conElTeclado ? `${Math.round(vv.height - 8)}px` : "";
      const campo = document.activeElement;
      if (conElTeclado && campo instanceof HTMLElement && d.contains(campo)) campo.scrollIntoView({ block: "nearest" });
    };
    const alCambiar = () => { cuadro ||= requestAnimationFrame(acomodar); };
    vv.addEventListener("resize", alCambiar);
    vv.addEventListener("scroll", alCambiar);
    return () => {
      vv.removeEventListener("resize", alCambiar);
      vv.removeEventListener("scroll", alCambiar);
      cancelAnimationFrame(cuadro);
      d.style.bottom = "";
      d.style.maxHeight = "";
    };
  }, [abierta]);

  const cerrar = () => { if (!fija) alCerrar(); };

  // Arrastrar la cabecera hacia abajo cierra (solo como hoja, en teléfono). La hoja sigue al dedo
  // desde donde se tomó; hacia arriba cede cada vez menos en vez de topar en seco. Se mueve el
  // `transform` del propio elemento, sin variables: nada más se recalcula.
  const mover = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current, d = ref.current;
    if (!a || !d) return;
    const dt = e.timeStamp - a.t;
    // La velocidad se suaviza: un solo evento ruidoso no decide si la hoja se va o se queda.
    if (dt > 0) { a.v = 0.7 * ((e.clientY - a.y) / dt) + 0.3 * a.v; a.y = e.clientY; a.t = e.timeStamp; }
    const dy = a.y - a.y0, alto = d.offsetHeight;
    d.style.transition = "none";
    d.style.transform = `translateY(${dy >= 0 ? dy : -(-dy * alto * 0.15) / (alto + 0.15 * -dy)}px)`;
  };
  const soltar = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current, d = ref.current;
    arrastre.current = null;
    if (!a || !d) return;
    const dy = a.y - a.y0, alto = d.offsetHeight;
    // Si el dedo se detuvo antes de soltar, ya no lleva impulso.
    const v = e.timeStamp - a.t > 80 ? 0 : a.v;
    // A dónde llegaría con el impulso que lleva (el mismo decaimiento del desplazamiento de iOS):
    // un tirón corto y rápido cierra; arrastrarla despacio y soltarla arriba de la mitad, no.
    const seVa = e.type === "pointerup" && v >= 0 && dy + v * 499 > alto / 2;
    d.style.transition = "";
    d.style.transform = "";
    if (!seVa) return;   // vuelve a su sitio con la transición de entrada, desde donde iba
    // Sale desde donde iba y a la velocidad del dedo: 4.35 es la pendiente con que arranca --ease-out.
    if (v > 0) d.style.transitionDuration = `${Math.round(Math.min(180, Math.max(100, (4.35 * (alto - dy)) / v)))}ms`;
    // Se cierra aquí mismo, no al siguiente render: quitar el arrastre y cerrar en el mismo cuadro
    // es lo que hace que la salida continúe el gesto en vez de regresar primero.
    d.close();
  };

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="hoja"
      // Escape pide cancelar; fija, se le dice que no.
      onCancel={(e) => { if (fija) e.preventDefault(); }}
      // Chrome no deja impedir un segundo Escape seguido: si aun así se cerró estando fija, se reabre.
      onClose={() => { if (fija && abierta) ref.current?.showModal(); else alCerrar(); }}
      // El velo es el propio <dialog>: un toque que cae en él y no en su contenido es «afuera».
      onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
      // En cuanto se usa el teclado, el anillo de «Cerrar» vuelve a ser el de siempre.
      onKeyDown={() => botonCerrar.current?.removeAttribute("data-sin-anillo")}
      // La línea bajo la cabecera solo aparece cuando hay contenido pasando por debajo.
      onScrollCapture={(e) => {
        const t = e.target as HTMLElement;
        if (t.classList.contains("overflow-y-auto")) e.currentTarget.toggleAttribute("data-corrida", t.scrollTop > 0);
      }}
    >
      <header
        className="relative flex flex-none touch-none items-center gap-2 border-b border-transparent pb-1 pl-4 pr-1 pt-4 transition-colors duration-150 sm:touch-auto sm:pt-1"
        onPointerDown={(e) => {
          // Un solo dedo: un segundo toque a medio arrastre no se lleva la hoja a otro lado.
          if (arrastre.current || fija || (e.target as HTMLElement).closest("button") || matchMedia("(min-width: 640px)").matches) return;
          arrastre.current = { y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0 };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        {/* El asa: dice que la hoja se puede bajar. Solo en teléfono. */}
        <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" />
        <h2 id={idTitulo} className={cn("line-clamp-2 min-w-0 flex-1 font-display text-18 font-semibold leading-snug tracking-tight", PARTE)}>{titulo}</h2>
        <button ref={botonCerrar} type="button" onClick={cerrar} disabled={fija} aria-label="Cerrar"
          className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[background-color,transform] duration-150 ease-vim hover:bg-hover hover:text-ink active:scale-[.97] active:bg-hover active:duration-[60ms] disabled:pointer-events-none disabled:opacity-30", FOCO)}>
          <IconoCerrar />
        </button>
      </header>
      <div className={COLUMNA}>{children}</div>
    </dialog>
  );
}
