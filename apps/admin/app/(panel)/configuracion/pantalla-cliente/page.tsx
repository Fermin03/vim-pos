"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, DialogoPeligro, botonClases, cn } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import {
  MAX_ANUNCIOS,
  eliminarAnuncio,
  guardarSegundos,
  leerSegundos,
  listarAnuncios,
  moverAnuncio,
  opcionesSegundos,
  ordenTrasMover,
  segundosSchema,
  setActivoAnuncio,
  setSegundosAnuncio,
  subirAnuncio,
  type Anuncio,
} from "../../../lib/anuncios-pantalla";
import { mensajeError } from "../../../lib/errores";

// 16 px en celular: con menos, iOS hace zoom al enfocar el campo (nucleo.md §2).
// `cn` solo une clases, no resuelve conflictos: el ancho y el color del borde los pone quien la usa.
const input =
  "h-11 rounded border bg-surface px-3 text-16 outline-none focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)] lg:text-14";
const bordeCampo = "border-line-strong focus:border-ink";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const foco = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
// Botón de renglón. 44 px: esta página se usa también desde el celular, con el dedo.
const botonFila = cn(
  "inline-flex h-11 flex-1 items-center justify-center rounded border border-line-strong px-3 text-13 font-semibold sm:flex-none",
  "transition-[border-color,color,transform] duration-150 ease-vim",
  "active:scale-[.97] active:duration-[60ms] disabled:pointer-events-none",
  foco,
);
const botonNeutro = "text-ink-2 hover:border-ink hover:text-ink";
// Rojo en reposo, no solo al pasar el mouse: en el celular el hover no existe (nucleo.md §4).
const botonRojo = "text-danger hover:border-danger";
// Apagado de verdad (el primero no sube, el último no baja). Mientras se guarda, los controles se
// bloquean SIN atenuarse: son 200 ms, y diez renglones parpadeando se leen como una falla.
const sinUso = "opacity-40";

const ACEPTA = "image/jpeg,image/png,image/webp";

/**
 * Pantalla del cliente: las imágenes que el segundo monitor de la caja enseña cuando nadie está
 * cobrando, y cuánto dura cada una.
 *
 * El tiempo se elige aquí mismo, junto a las imágenes: uno general para todas y, si hace falta,
 * uno propio por imagen.
 *
 * Una sola escritura a la vez sobre la lista (`enCurso`): dos clics seguidos en «Subir» no pueden
 * reescribir el orden uno encima del otro, y lo que se ve al terminar es lo que quedó guardado,
 * porque después de cada acción —salga bien o mal— se vuelve a leer la lista.
 */
export default function PantallaClientePage() {
  const [anuncios, setAnuncios] = useState<Anuncio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Tiempo general: el guardado (lo que usan las cajas) y lo que hay escrito en el campo.
  const [segGeneral, setSegGeneral] = useState<number | null>(null);
  const [segTexto, setSegTexto] = useState("");
  const [errSeg, setErrSeg] = useState<string | null>(null);
  const [segListo, setSegListo] = useState(false);
  const [guardandoSeg, setGuardandoSeg] = useState(false);

  const [subiendo, setSubiendo] = useState(false);
  /** El renglón que se está guardando; "*" mientras se reordena (toca a más de uno). */
  const [filaOcupada, setFilaOcupada] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<{ anuncio: Anuncio; lugar: number } | null>(null);
  const [borrando, setBorrando] = useState(false);

  const enCurso = useRef(false);
  const ultimaCarga = useRef(0);
  const relojAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relojAviso.current) clearTimeout(relojAviso.current); }, []);

  function avisar(texto: string) {
    setAviso(texto);
    if (relojAviso.current) clearTimeout(relojAviso.current);
    relojAviso.current = setTimeout(() => setAviso(null), 3500);
  }

  /** Vuelve a leer la lista. Si falla, deja lo que había: una lista vacía se leería como "no tienes anuncios". */
  const recargar = useCallback(async (): Promise<boolean> => {
    const turno = ++ultimaCarga.current;
    try {
      const lista = await listarAnuncios();
      if (turno === ultimaCarga.current) setAnuncios(lista);
      return true;
    } catch (e) {
      if (turno === ultimaCarga.current) setError((previo) => previo ?? mensajeError(e, "No se pudieron cargar los anuncios"));
      return false;
    }
  }, []);

  useEffect(() => {
    recargar();
    leerSegundos()
      .then((n) => { setSegGeneral(n); setSegTexto(String(n)); })
      .catch((e) => setError((previo) => previo ?? mensajeError(e, "No se pudo leer el tiempo en pantalla")))
      .finally(() => setSegListo(true));
  }, [recargar]);

  /**
   * Una acción sobre la lista. `optimista` es cómo se ve la lista si sale bien: se pinta de una
   * vez para que el control responda al instante, y si falla se regresa a como estaba.
   */
  async function ejecutar(fila: string, accion: () => Promise<void>, fallo: string, optimista?: Anuncio[]) {
    if (enCurso.current) return;
    enCurso.current = true;
    const previo = anuncios;
    setError(null);
    setFilaOcupada(fila);
    if (optimista) setAnuncios(optimista);
    try {
      await accion();
    } catch (e) {
      setError(mensajeError(e, fallo));
      if (optimista) setAnuncios(previo);
    }
    await recargar();
    setFilaOcupada(null);
    enCurso.current = false;
  }

  async function alElegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el MISMO archivo tras un error
    if (!archivo || enCurso.current) return;
    enCurso.current = true;
    setError(null);
    setSubiendo(true);
    try {
      await subirAnuncio(archivo);
      avisar("Imagen agregada al final de la lista.");
    } catch (err) {
      setError(mensajeError(err, "No se pudo subir la imagen"));
    }
    await recargar();
    setSubiendo(false);
    enCurso.current = false;
  }

  function mover(a: Anuncio, hacia: "arriba" | "abajo") {
    if (!anuncios) return;
    const porId = new Map(anuncios.map((x) => [x.id, x]));
    const orden = ordenTrasMover(anuncios.map((x) => x.id), a.id, hacia);
    ejecutar("*", () => moverAnuncio(anuncios, a.id, hacia), "No se pudo cambiar el orden", orden.map((id) => porId.get(id)!));
  }

  function cambiarSegundos(a: Anuncio, valor: string) {
    if (!anuncios) return;
    const segundos = valor === "" ? null : Number(valor);
    ejecutar(a.id, () => setSegundosAnuncio(a.id, segundos), "No se pudo guardar el tiempo de esta imagen",
      anuncios.map((x) => (x.id === a.id ? { ...x, segundos } : x)));
  }

  function alternarActivo(a: Anuncio) {
    if (!anuncios) return;
    ejecutar(a.id, () => setActivoAnuncio(a.id, !a.activo), a.activo ? "No se pudo pausar la imagen" : "No se pudo activar la imagen",
      anuncios.map((x) => (x.id === a.id ? { ...x, activo: !a.activo } : x)));
  }

  async function confirmarBorrado() {
    if (!borrar || enCurso.current) return;
    enCurso.current = true;
    setError(null);
    setBorrando(true);
    try {
      await eliminarAnuncio(borrar.anuncio);
      setBorrar(null);
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar el anuncio"));
    }
    await recargar();
    setBorrando(false);
    enCurso.current = false;
  }

  async function guardarGeneral(e: FormEvent) {
    e.preventDefault();
    if (guardandoSeg) return;
    const parsed = segundosSchema.safeParse(segTexto.trim());
    if (!parsed.success) {
      setErrSeg(segTexto.trim() === "" || Number.isNaN(Number(segTexto))
        ? "Escribe un número de 3 a 60."
        : `${parsed.error.issues[0]?.message ?? "Usa un número de 3 a 60"}.`);
      return;
    }
    setErrSeg(null);
    setError(null);
    setGuardandoSeg(true);
    try {
      await guardarSegundos(parsed.data);
      setSegGeneral(parsed.data);
      setSegTexto(String(parsed.data));
      avisar("Tiempo guardado.");
    } catch (err) {
      setError(mensajeError(err, "No se pudo guardar el tiempo en pantalla"));
    } finally {
      setGuardandoSeg(false);
    }
  }

  const total = anuncios?.length ?? 0;
  const enPausa = anuncios?.filter((a) => !a.activo).length ?? 0;
  const lleno = total >= MAX_ANUNCIOS;
  const sinCambiosSeg = segGeneral !== null && segTexto.trim() === String(segGeneral);
  const listaOcupada = filaOcupada !== null || subiendo || borrando;

  /** «Subir imagen». Es un <label> con el campo de archivo adentro: el botón ES el campo. */
  function botonSubir(extra?: string) {
    const apagado = anuncios === null || lleno || listaOcupada;
    return (
      <label
        aria-disabled={apagado || undefined}
        className={cn(
          botonClases(),
          "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink",
          apagado && "pointer-events-none opacity-50",
          extra,
        )}
      >
        {subiendo ? "Subiendo…" : lleno ? "Ya hay 10 anuncios" : "Subir imagen"}
        <input type="file" accept={ACEPTA} className="sr-only" disabled={apagado} onChange={alElegirArchivo} />
      </label>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Pantalla del cliente"
        subtitulo="Las imágenes que muestra el segundo monitor de la caja cuando no se está cobrando."
        migas={[{ label: "Configuración" }, { label: "Pantalla del cliente" }]}
        // Con la lista vacía el botón vive en el recuadro de «Aún no hay imágenes»: dos «Subir imagen»
        // seguidos, el lector de pantalla los anunciaba dos veces. Se quita el del encabezado porque
        // el del recuadro es el que va junto a la explicación; con imágenes, el del encabezado es el único.
        right={anuncios !== null && total === 0 ? undefined : botonSubir()}
      />
      <PageBody>
        {error && !borrar && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {/* ── Tiempo general ─────────────────────────────────────────────── */}
        <form onSubmit={guardarGeneral} noValidate className="mb-8 max-w-[520px]">
          <label className={label} htmlFor="pc-seg">Tiempo en pantalla (segundos)</label>
          <div className="flex items-start gap-2">
            <input
              id="pc-seg"
              className={cn(input, "w-28 tabular-nums disabled:opacity-50", errSeg ? "border-danger" : bordeCampo)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={segTexto}
              disabled={!segListo}
              aria-invalid={errSeg ? true : undefined}
              aria-describedby="pc-seg-ayuda"
              onChange={(e) => { setSegTexto(e.target.value); if (errSeg) setErrSeg(null); }}
            />
            <Button type="submit" variant="ghost" disabled={!segListo || guardandoSeg || sinCambiosSeg}>
              {guardandoSeg ? "Guardando…" : "Guardar"}
            </Button>
          </div>
          <p id="pc-seg-ayuda" className={cn("mt-1.5 text-13", errSeg ? "font-medium text-danger" : "text-ink-3")} role={errSeg ? "alert" : undefined}>
            {errSeg ?? "Lo usan todas las imágenes que no tengan un tiempo propio. De 3 a 60 segundos."}
          </p>
        </form>

        {/* ── Lista ──────────────────────────────────────────────────────── */}
        <div className="mb-3 flex min-h-[24px] flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-16 font-semibold">
            Imágenes
            {anuncios !== null && (
              <span className="ml-2 font-sans text-13 font-medium tabular-nums text-ink-3">
                {total} de {MAX_ANUNCIOS}
                {enPausa > 0 && ` · ${enPausa} en pausa`}
              </span>
            )}
          </h2>
          <p className="text-13 font-medium text-success" role="status" aria-live="polite">{aviso}</p>
        </div>

        {anuncios === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {anuncios === null && error && (
          <Button variant="ghost" onClick={() => { setError(null); recargar(); }}>Volver a intentar</Button>
        )}

        {anuncios !== null && total === 0 && (
          <div className="rounded-lg border border-dashed border-line-strong px-5 py-12 text-center">
            <p className="font-display text-lg font-semibold">Aún no hay imágenes</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-sm leading-relaxed text-ink-2">
              Sube tus promociones, tu menú o tu logotipo: la pantalla que ve el cliente las va
              pasando mientras nadie está cobrando. Conviene una imagen horizontal de 1920 × 1080;
              se ve entera aunque el monitor esté en vertical.
            </p>
            <div className="mt-4">{botonSubir()}</div>
          </div>
        )}

        {anuncios !== null && total > 0 && (
          <ol className="overflow-hidden rounded-lg border border-line bg-surface">
            {anuncios.map((a, i) => {
              const guardando = filaOcupada === a.id;
              return (
                <li
                  key={a.id}
                  aria-busy={guardando || undefined}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line p-3 last:border-b-0 sm:p-4",
                    "transition-opacity duration-150",
                    guardando && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right text-13 font-semibold tabular-nums text-ink-3" aria-hidden="true">{i + 1}</span>
                    <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-hover">
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagen del almacén público, ya reducida al subirla */}
                      <img
                        src={a.url}
                        alt={`Anuncio ${i + 1}`}
                        loading="lazy"
                        className={cn("h-full w-full object-contain transition-opacity duration-150", !a.activo && "opacity-40")}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.activo}
                    aria-label={`Mostrar el anuncio ${i + 1} en las cajas`}
                    disabled={listaOcupada}
                    onClick={() => alternarActivo(a)}
                    className={cn("inline-flex h-11 min-w-[112px] items-center gap-2.5 rounded text-13 font-semibold", a.activo ? "text-ink" : "text-ink-3", foco)}
                  >
                    <span className={cn("relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-150", a.activo ? "bg-accent" : "bg-line-strong")}>
                      <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-150 ease-vim", a.activo && "translate-x-5")} />
                    </span>
                    {a.activo ? "Activo" : "En pausa"}
                  </button>

                  <div className="w-full sm:w-48">
                    <label className="sr-only" htmlFor={`pc-seg-${a.id}`}>Tiempo en pantalla del anuncio {i + 1}</label>
                    <select
                      id={`pc-seg-${a.id}`}
                      className={cn(input, bordeCampo, "w-full")}
                      value={a.segundos === null ? "" : String(a.segundos)}
                      disabled={listaOcupada}
                      onChange={(e) => cambiarSegundos(a, e.target.value)}
                    >
                      <option value="">Tiempo general{segGeneral !== null ? ` (${segGeneral} s)` : ""}</option>
                      {opcionesSegundos(a.segundos).map((s) => (
                        <option key={s} value={s}>{s} segundos</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                    <button
                      type="button"
                      className={cn(botonFila, botonNeutro, i === 0 && sinUso)}
                      disabled={i === 0 || listaOcupada}
                      aria-label={`Subir un lugar el anuncio ${i + 1}`}
                      onClick={() => mover(a, "arriba")}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      className={cn(botonFila, botonNeutro, i === total - 1 && sinUso)}
                      disabled={i === total - 1 || listaOcupada}
                      aria-label={`Bajar un lugar el anuncio ${i + 1}`}
                      onClick={() => mover(a, "abajo")}
                    >
                      Bajar
                    </button>
                    <button
                      type="button"
                      className={cn(botonFila, botonRojo)}
                      disabled={listaOcupada}
                      aria-label={`Eliminar el anuncio ${i + 1}`}
                      onClick={() => { setError(null); setBorrar({ anuncio: a, lugar: i + 1 }); }}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-5 rounded-lg border border-line bg-surface px-4 py-3 text-13 leading-relaxed text-ink-2">
          Los cambios llegan a las cajas en uno o dos minutos. La pantalla los muestra sin reiniciar.
        </p>
      </PageBody>

      {borrar && (
        <DialogoPeligro
          titulo="¿Eliminar este anuncio?"
          contexto={`Anuncio ${borrar.lugar} de ${total}`}
          consecuencia="Dejará de mostrarse en las cajas."
          error={error}
          boton="Eliminar"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => { setBorrar(null); setError(null); }}
        />
      )}
    </>
  );
}
