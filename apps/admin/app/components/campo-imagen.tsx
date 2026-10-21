"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { botonClases, cn, useConfirmar } from "@vim/ui/styles";
import { label } from "./campos";

const ACEPTA = "image/jpeg,image/png,image/webp";
// «Quitar» va en rojo en reposo: en el celular el hover no existe (nucleo.md §4).
const botonQuitar = cn(
  "inline-flex h-11 items-center justify-center rounded border border-line-strong px-4 font-display text-sm font-semibold text-danger hover:border-danger",
  "transition-[border-color,transform] duration-150 ease-vim active:scale-[.97] active:duration-[60ms]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
);
// Apagado SIN `disabled`: un botón deshabilitado suelta el foco del teclado y lo manda al inicio de
// la página. Se queda enfocable, se anuncia como no disponible y el clic se ignora más abajo.
const sinUsoClases = "pointer-events-none opacity-50";

/**
 * Una imagen que se sube al momento, sin esperar al «Guardar» del formulario: la foto de un producto
 * y el logo de la tienda. Miniatura de 96 px, «Subir» o «Cambiar», y «Quitar» con confirmación.
 *
 * Solo pinta: quien lo usa sube, guarda y dice si algo falló (`mensaje`). Que terminó bien lo sabe
 * porque la imagen cambió mientras estaba `trabajando`.
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
  avisos = { guardada: "Foto guardada.", quitada: "Foto quitada." },
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
  /** Lo que se anuncia al terminar bien. */
  avisos?: { guardada: string; quitada: string };
  mensaje?: ReactNode;
  onSubir: (archivo: File) => void;
  onQuitar: () => void;
}) {
  const id = useId();
  const [confirmar, dialogoConfirmar] = useConfirmar();
  // Cuál de los dos botones se tocó, para decir «Subiendo…» o «Quitando…» en el que corresponde.
  const [quitando, setQuitando] = useState(false);
  const [aviso, setAviso] = useState("");
  const archivoRef = useRef<HTMLInputElement>(null);
  const subirRef = useRef<HTMLButtonElement>(null);
  /** La imagen que había al empezar; `undefined` = no hay nada en curso. */
  const alEmpezar = useRef<string | null | undefined>(undefined);
  const sinUso = apagado || trabajando;

  useEffect(() => {
    if (trabajando) {
      alEmpezar.current = url;
      return;
    }
    if (alEmpezar.current === undefined) return;
    // Si la imagen es la misma, la operación falló: el error lo pinta `mensaje`.
    const cambio = url !== alEmpezar.current;
    alEmpezar.current = undefined;
    setAviso(cambio ? (url ? avisos.guardada : avisos.quitada) : "");
    setQuitando(false);
    // «Quitar» desaparece con la imagen: el foco pasa al botón que queda, no al inicio de la página.
    if (cambio && !url && (!document.activeElement || document.activeElement === document.body)) subirRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al empezar y al terminar
  }, [trabajando]);

  function alElegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el MISMO archivo tras un error
    if (!archivo || sinUso) return;
    setQuitando(false);
    setAviso("");
    onSubir(archivo);
  }

  async function alQuitar() {
    if (sinUso) return;
    if (!(await confirmar({ titulo: quitar.titulo, mensaje: quitar.mensaje, boton: "Quitar" }))) return;
    setQuitando(true);
    setAviso("");
    onQuitar();
  }

  const cuadro = "h-24 w-24 flex-shrink-0 rounded border bg-hover";
  const estado = trabajando ? (quitando ? "Quitando…" : "Subiendo…") : aviso;

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
              <div className="flex flex-wrap gap-2">
                {/* Un botón de verdad que abre el selector de archivos: el contorno de foco sale solo con el teclado. */}
                <button
                  ref={subirRef}
                  type="button"
                  aria-disabled={sinUso || undefined}
                  className={cn(botonClases({ variant: "ghost" }), sinUso && sinUsoClases)}
                  onClick={() => { if (!sinUso) archivoRef.current?.click(); }}
                >
                  {trabajando && !quitando ? "Subiendo…" : url ? "Cambiar" : textoSubir}
                </button>
                <input ref={archivoRef} type="file" accept={ACEPTA} className="hidden" tabIndex={-1} aria-hidden="true" onChange={alElegir} />
                {url && (
                  <button type="button" aria-disabled={sinUso || undefined} className={cn(botonQuitar, sinUso && sinUsoClases)} onClick={() => void alQuitar()}>
                    {trabajando && quitando ? "Quitando…" : "Quitar"}
                  </button>
                )}
              </div>
              <p className={claseAyuda}>{ayuda}</p>
            </>
          )}
          {/* Para quien no ve la miniatura cambiar: en curso y, al terminar bien, qué pasó. */}
          <p role="status" className="sr-only">{estado}</p>
          {mensaje}
        </div>
      </div>
      {dialogoConfirmar}
    </div>
  );
}
