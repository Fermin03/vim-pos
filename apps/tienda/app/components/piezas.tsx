// Las piezas chicas que comparten el menú, la hoja de producto y el carrito.
import { cn, Icono } from "@vim/ui/styles";

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

/**
 * Para lo que escribió el negocio o el cliente (nombres, descripciones, notas, direcciones): una
 * palabra larguísima se parte en vez de ensanchar la pantalla.
 */
export const PARTE = "[overflow-wrap:anywhere]";

/** El foco por teclado de todo lo demás que se toca. */
export const FOCO = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Una página que no se pudo pintar: qué pasó, qué hacer y, si sirve, volver a pedirla. */
export function Fallo({ titulo, hacer, reintentar }: { titulo: string; hacer: string; reintentar?: string }) {
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-display text-20 font-semibold">{titulo}</h1>
      <p className="mt-2 text-16 text-ink-2">{hacer}</p>
      {reintentar && (
        // Un enlace normal, no <Link>: tiene que volver a pedir la página entera al servidor.
        <a href={reintentar} className="mt-6 inline-flex h-12 items-center rounded border border-line-strong px-5 font-display text-15 font-semibold text-ink hover:bg-hover">Volver a intentar</a>
      )}
    </main>
  );
}

export const IconoCerrar = () => <Icono nombre="cerrar" className="h-5 w-5" />;
const IconoMenos = () => <Icono nombre="menos" className="h-5 w-5" />;
export const IconoMas = () => <Icono nombre="mas" className="h-5 w-5" />;
/** La flecha de lo que se despliega; quien la usa la gira al abrir. */
export const IconoAbajo = ({ className }: { className?: string }) => <Icono nombre="chevron-abajo" className={cn("h-4 w-4", className)} />;
const IconoQuitar = () => <Icono nombre="eliminar" className="h-5 w-5" />;

/**
 * El hueco de un texto que todavía no llega: una barra del color de las líneas, sin movimiento (como
 * el esqueleto de la caja, `pos-skeleton-bg`). El tamaño lo pone quien la usa; guarda el lugar para
 * que la página no brinque cuando llega el dato.
 */
export const Esqueleto = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("block rounded-full bg-line", className)} />;

/**
 * Menos · cantidad · más, con botones de 44 px. `grande` lo iguala a la acción dominante (56 px)
 * cuando van lado a lado en el pie de una hoja. Con `alQuitar`, en 1 el «menos» se vuelve «quitar»
 * (el bote): así el carrito no necesita otro botón para sacar un renglón.
 */
export function Cantidad({ valor, max, de, alCambiar, alQuitar, grande = false }: {
  valor: number; max: number; /** De qué es la cantidad, para quien no ve la pantalla. */ de: string;
  alCambiar: (n: number) => void; alQuitar?: () => void; grande?: boolean;
}) {
  const boton = cn(grande ? "h-14 w-12" : "h-11 w-11", "flex items-center justify-center rounded text-ink transition-transform duration-150 ease-vim active:scale-[.94] active:duration-[60ms] hover:bg-hover disabled:pointer-events-none disabled:opacity-30", FOCO);
  const quita = valor <= 1 && !!alQuitar;
  return (
    <div role="group" aria-label={`Cantidad de ${de}`} className="inline-flex flex-shrink-0 items-center rounded border border-line-strong">
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
