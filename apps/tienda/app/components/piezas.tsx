// Las piezas chicas que comparten el menú, la hoja de producto y el carrito.
import { cn } from "@vim/ui/styles";

/**
 * La acción principal de la pantalla, del color del negocio. No es el `Button` de @vim/ui porque ese
 * fija el texto en blanco: aquí el texto es `--sobre-accent` (blanco o negro, el que se lea sobre el
 * color que eligió el dueño). El borde interior tenue le da orilla a un color casi blanco.
 */
export const PRINCIPAL =
  "inline-flex items-center justify-center gap-2 rounded font-display font-semibold " +
  "bg-accent text-sobre-accent shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.12)] hover:bg-accent-hover " +
  "transition-[background-color,opacity,transform] duration-150 ease-vim active:scale-[.97] active:duration-[60ms] " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** El foco por teclado de todo lo demás que se toca. */
export const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const IconoCerrar = () => <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...trazo}><path d="M6 6l12 12M18 6L6 18" /></svg>;
const IconoMenos = () => <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...trazo}><path d="M5 12h14" /></svg>;
const IconoMas = () => <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...trazo}><path d="M12 5v14M5 12h14" /></svg>;
const IconoQuitar = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" {...trazo}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
  </svg>
);

/**
 * Menos · cantidad · más, con botones de 44 px. Con `alQuitar`, en 1 el «menos» se vuelve «quitar»
 * (el bote): así el carrito no necesita otro botón para sacar un renglón.
 */
export function Cantidad({ valor, max, de, alCambiar, alQuitar }: {
  valor: number; max: number; /** De qué es la cantidad, para quien no ve la pantalla. */ de: string;
  alCambiar: (n: number) => void; alQuitar?: () => void;
}) {
  const boton = cn("flex h-11 w-11 items-center justify-center rounded text-ink transition-transform duration-150 ease-vim active:scale-[.94] active:duration-[60ms] hover:bg-hover disabled:pointer-events-none disabled:opacity-30", FOCO);
  const quita = valor <= 1 && !!alQuitar;
  return (
    <div role="group" aria-label={`Cantidad de ${de}`} className="inline-flex items-center rounded border border-line-strong">
      <button type="button" className={boton} disabled={valor <= 1 && !alQuitar}
        aria-label={quita ? `Quitar ${de} del pedido` : "Uno menos"}
        onClick={() => (quita ? alQuitar() : alCambiar(valor - 1))}>
        {quita ? <IconoQuitar /> : <IconoMenos />}
      </button>
      <output aria-live="polite" className="w-8 text-center font-display text-16 font-semibold tabular-nums">{valor}</output>
      <button type="button" className={boton} disabled={valor >= max} aria-label="Uno más" onClick={() => alCambiar(valor + 1)}>
        <IconoMas />
      </button>
    </div>
  );
}
