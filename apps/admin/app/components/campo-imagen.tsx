"use client";
import { useId, useState, type ChangeEvent, type ReactNode } from "react";
import { botonClases, cn, useConfirmar } from "@vim/ui/styles";
import { label } from "./campos";

const ACEPTA = "image/jpeg,image/png,image/webp";
// «Quitar» va en rojo en reposo: en el celular el hover no existe (nucleo.md §4).
const botonQuitar = cn(
  "inline-flex h-11 items-center justify-center rounded border border-line-strong px-4 font-display text-sm font-semibold text-danger hover:border-danger",
  "transition-[border-color,transform] duration-150 ease-vim active:scale-[.97] active:duration-[60ms]",
  "disabled:pointer-events-none disabled:opacity-50",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
);

/**
 * Una imagen que se sube al momento, sin esperar al «Guardar» del formulario: la foto de un producto
 * y el logo de la tienda. Miniatura de 96 px, «Subir» o «Cambiar», y «Quitar» con confirmación.
 *
 * Solo pinta: quien lo usa sube, guarda y dice si algo falló (`mensaje`).
 */
export function CampoImagen({
  titulo,
  url,
  alt,
  ajuste,
  textoSubir,
  textoVacio,
  ayuda,
  claseAyuda,
  bloqueo,
  trabajando,
  apagado = false,
  quitar,
  mensaje,
  onSubir,
  onQuitar,
}: {
  titulo: string;
  url: string | null;
  alt: string;
  /** `cover` llena el cuadro (una foto); `contain` la enseña entera (un logo). */
  ajuste: "cover" | "contain";
  textoSubir: string;
  textoVacio: string;
  ayuda: string;
  claseAyuda: string;
  /** Por qué todavía no se puede subir. Con esto no hay botones. */
  bloqueo?: string;
  /** Se está subiendo o quitando ESTA imagen. */
  trabajando: boolean;
  /** No se puede tocar ahora (otra cosa se guarda, panel en solo lectura). */
  apagado?: boolean;
  /** La pregunta y la consecuencia de «Quitar». */
  quitar: { titulo: string; mensaje: string };
  mensaje?: ReactNode;
  onSubir: (archivo: File) => void;
  onQuitar: () => void;
}) {
  const id = useId();
  const [confirmar, dialogoConfirmar] = useConfirmar();
  // Cuál de los dos botones se tocó, para decir «Subiendo…» o «Quitando…» en el que corresponde.
  const [quitando, setQuitando] = useState(false);
  const sinUso = apagado || trabajando;

  function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el MISMO archivo tras un error
    if (!archivo || sinUso) return;
    setQuitando(false);
    onSubir(archivo);
  }

  async function alQuitar() {
    if (!(await confirmar({ titulo: quitar.titulo, mensaje: quitar.mensaje, boton: "Quitar" }))) return;
    setQuitando(true);
    onQuitar();
  }

  const cuadro = "h-24 w-24 flex-shrink-0 rounded border bg-hover";

  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className={label}>{titulo}</span>
      <div className="flex items-start gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen del almacén público
          <img src={url} alt={alt} width={96} height={96} className={cn(cuadro, "border-line", ajuste === "cover" ? "object-cover" : "object-contain")} />
        ) : (
          <div className={cn(cuadro, "flex items-center justify-center border-dashed border-line-strong text-12 text-ink-3")}>{textoVacio}</div>
        )}
        <div className="min-w-0 flex-1">
          {bloqueo ? (
            <p className="text-13 text-ink-2">{bloqueo}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" aria-busy={trabajando || undefined}>
                {/* Es un <label> con el campo de archivo adentro: el botón ES el campo. */}
                <label
                  aria-disabled={sinUso || undefined}
                  className={cn(
                    botonClases({ variant: "ghost" }),
                    "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
                    sinUso && "pointer-events-none opacity-50",
                  )}
                >
                  {trabajando && !quitando ? "Subiendo…" : url ? "Cambiar" : textoSubir}
                  <input type="file" accept={ACEPTA} className="sr-only" disabled={sinUso} onChange={alElegir} />
                </label>
                {url && (
                  <button type="button" className={botonQuitar} disabled={sinUso} onClick={() => void alQuitar()}>
                    {trabajando && quitando ? "Quitando…" : "Quitar"}
                  </button>
                )}
              </div>
              <p className={claseAyuda}>{ayuda}</p>
            </>
          )}
          {mensaje}
        </div>
      </div>
      {dialogoConfirmar}
    </div>
  );
}
