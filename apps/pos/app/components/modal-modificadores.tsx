"use client";
import { useEffect, useMemo, useState } from "react";
import type { Producto } from "../lib/catalogo";
import type { GrupoModificadores } from "../lib/modificadores";
import type { AlcanceEdicion, ModificadorSel } from "../lib/carrito";
import { seleccionInicialGrupo } from "../lib/carrito";
import { clampPagina, repartirGrupos, tamanoOpcion } from "../lib/rejilla";
import { fmtMxn } from "../lib/turno";
import { useHueco } from "../lib/usar-hueco";
import { Paginador } from "./paginador";

/**
 * Modal de modificadores: los grupos de un producto (término, extras, sin qué) y la nota.
 *
 * CENTRADO, AL 80% DE LA PANTALLA
 *
 * Fue un drawer de 576px pegado a la derecha. Ahora es un modal centrado que ocupa el 80% del
 * ancho y del alto: las mismas opciones, con botones más grandes (ver `ANCHO_OPCION_MAX` y
 * `ALTO_OPCION_MAX` en `rejilla.ts`). Como el modal es más ancho que alto, la nota de cocina bajó
 * al pie, en una sola línea junto a los botones, para dejarle el alto a la cuadrícula.
 *
 * TAMBIÉN EDITA
 *
 * Con `inicial` se abre sobre un renglón ya capturado (el cajero tocó el renglón en el ticket):
 * arranca con lo que el renglón tenía marcado y confirma con "Guardar cambios". Si el renglón
 * trae más de una unidad (`cantidadLinea`), el pie deja elegir si el cambio es para una sola
 * —se separa en su propio renglón— o para todas.
 *
 * NO SCROLLEA
 *
 * Antes los grupos se apilaban en un cuerpo con scroll vertical y cada opción era un renglón de
 * ancho completo: un producto con tres grupos de cinco opciones ya obligaba a deslizar para ver el
 * último, y a deslizar de vuelta para corregir el primero.
 *
 * Ahora rige la misma regla que el catálogo: **manda la cuadrícula, no el contenido.** Las opciones
 * son celdas iguales en cuadrícula, `repartirGrupos` decide de una sola vez las columnas y el alto
 * de celda que hacen que TODOS los grupos quepan en el hueco medido, y el texto se achica para
 * caber. Cuando ni apretando alcanza, se **pagina** — y un grupo más alto que la página se parte en
 * trozos, porque entero y recortado no se vería nunca.
 *
 * Dos cosas que se fueron para que esto quepa:
 *
 * - **El hero de 150px** (un degradado con un icono genérico de hamburguesa, el mismo para todos
 *   los productos). Se llevaba una quinta parte del drawer sin decir nada del producto.
 * - **El banner rojo por grupo** ("Debes elegir una opción"). Lo que informa ya está en el nombre
 *   del grupo en rojo, en la insignia "Obligatorio" y en el aviso del pie, que además dice cuál.
 */

type SelPorGrupo = Record<string, Set<string>>; // grupoId -> set de opcionId

/** Alto reservado al encabezado de cada grupo dentro de la cuadrícula. */
const ALTO_CABECERA = 26;

/**
 * Selección de arranque. Sin `inicial`, los defaults de cada grupo. Con `inicial` (edición), lo que
 * el renglón ya tenía: se respeta aunque hoy una opción esté agotada, porque ya está en el pedido.
 */
function initSel(grupos: GrupoModificadores[], inicial?: ModificadorSel[] | null): SelPorGrupo {
  const s: SelPorGrupo = {};
  const elegidas = inicial ? new Set(inicial.map((m) => m.opcionId)) : null;
  for (const g of grupos) {
    s[g.id] = elegidas
      ? new Set(g.opciones.filter((o) => elegidas.has(o.id)).map((o) => o.id))
      : new Set(seleccionInicialGrupo(g).map((o) => o.id));
  }
  return s;
}

function grupoValido(g: GrupoModificadores, sel: Set<string>): boolean {
  const n = sel.size;
  switch (g.tipoSeleccion) {
    case "UNICA_OBLIGATORIA":
      return n === 1;
    case "UNICA_OPCIONAL":
      return n <= 1;
    case "MULTIPLE_OPCIONAL":
      return true;
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return n >= (g.min ?? 0) && n <= (g.max ?? Infinity);
  }
}

function reglaTipoLabel(g: GrupoModificadores): string {
  switch (g.tipoSeleccion) {
    case "UNICA_OBLIGATORIA":
      return "Elige 1";
    case "UNICA_OPCIONAL":
      return "Opcional";
    case "MULTIPLE_OPCIONAL":
      return "Opcional";
    case "MULTIPLE_OBLIGATORIA_RANGO":
      return `Elige ${g.min ?? 0}–${g.max ?? "∞"}`;
  }
}

function esUnica(g: GrupoModificadores): boolean {
  return g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "UNICA_OPCIONAL";
}

function esObligatorio(g: GrupoModificadores): boolean {
  return g.tipoSeleccion === "UNICA_OBLIGATORIA" || g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO";
}

// Icono check SVG
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Icono X para cerrar
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Icono alerta triángulo
function IconAlert({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function ModalModificadores({
  producto,
  grupos,
  inicial,
  cantidadLinea = 1,
  sinNota = false,
  onConfirmar,
  onCancelar,
}: {
  producto: Producto;
  grupos: GrupoModificadores[];
  /** Edición de un renglón ya capturado: su selección y su nota. Ausente = producto nuevo. */
  inicial?: { modificadores: ModificadorSel[]; nota: string | null } | null;
  /** Unidades del renglón que se edita. Con más de una, el pie pregunta a cuántas aplicar. */
  cantidadLinea?: number;
  /** Oculta la nota: el componente de un combo no la usa (la nota va en el combo entero). */
  sinNota?: boolean;
  onConfirmar: (mods: ModificadorSel[], nota: string | null, alcance: AlcanceEdicion) => void;
  onCancelar: () => void;
}) {
  const editando = inicial != null;
  const [sel, setSel] = useState<SelPorGrupo>(() => initSel(grupos, inicial?.modificadores));
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [pagina, setPagina] = useState(1);
  // Por omisión se separa UNA unidad: es lo que pidió Fermín y lo que menos sorprende —tocar un
  // "3× Hamburguesa" para quitarle la cebolla a una no debe cambiar las tres—.
  const [alcance, setAlcance] = useState<AlcanceEdicion>("una");
  const preguntaAlcance = editando && cantidadLinea > 1;

  function toggle(g: GrupoModificadores, opcionId: string) {
    setSel((prev) => {
      const actual = new Set(prev[g.id]);
      const unica = esUnica(g);
      if (actual.has(opcionId)) {
        if (g.tipoSeleccion === "UNICA_OBLIGATORIA") return prev; // no permitir vaciar
        actual.delete(opcionId);
      } else {
        if (unica) actual.clear();
        if (g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.max && actual.size >= g.max) return prev;
        actual.add(opcionId);
      }
      return { ...prev, [g.id]: actual };
    });
  }

  const todoValido = useMemo(() => grupos.every((g) => grupoValido(g, sel[g.id] ?? new Set())), [grupos, sel]);

  // Precio total calculado con extras seleccionados (cantidad siempre 1 por opción)
  const precioTotal = useMemo(() => {
    let extras = 0;
    for (const g of grupos) {
      for (const opcionId of sel[g.id] ?? []) {
        const o = g.opciones.find((x) => x.id === opcionId);
        if (o) extras += o.precioExtra;
      }
    }
    return producto.precio_base_mxn + extras;
  }, [grupos, sel, producto.precio_base_mxn]);

  function confirmar() {
    const mods: ModificadorSel[] = [];
    for (const g of grupos) {
      for (const opcionId of sel[g.id] ?? []) {
        const o = g.opciones.find((x) => x.id === opcionId);
        if (o) mods.push({ opcionId: o.id, grupoNombre: g.nombre, opcionNombre: o.nombre, precioExtra: o.precioExtra, cantidad: 1 });
      }
    }
    onConfirmar(mods, nota.trim() || null, preguntaAlcance ? alcance : "todas");
  }

  // Primer grupo inválido para el hint del footer
  const primerGrupoInvalido = grupos.find((g) => !grupoValido(g, sel[g.id] ?? new Set()));

  // ── Reparto: columnas y alto de celda iguales para todos los grupos ─────────────────────────
  // `altoExtra` es 0 porque la nota y el paginador son hermanos del elemento medido: el alto que
  // devuelve `useHueco` ya viene con ellos descontados.
  const [zonaRef, hueco] = useHueco<HTMLDivElement>();
  const reparto = useMemo(
    () =>
      repartirGrupos({
        ancho: hueco.ancho,
        alto: hueco.alto,
        opcionesPorGrupo: grupos.map((g) => g.opciones.length),
        altoCabecera: ALTO_CABECERA,
        altoExtra: 0,
      }),
    [hueco.ancho, hueco.alto, grupos],
  );
  const paginaActual = clampPagina(pagina, reparto.paginas.length);
  const trozos = reparto.paginas[paginaActual - 1] ?? [];
  const pxOpcion = tamanoOpcion(reparto.anchoCelda, reparto.altoCelda);

  // Si el producto cambia (el drawer se reutiliza), volver a la primera página.
  useEffect(() => setPagina(1), [producto.id]);

  return (
    /* Scrim */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/[0.34]"
      role="dialog"
      aria-modal="true"
      aria-label={producto.nombre}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      {/* Panel centrado al 80% de la pantalla en los dos ejes */}
      <aside
        className="flex h-[80vh] w-[80vw] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_24px_60px_rgba(22,22,26,.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera: nombre + precio base. (Aquí vivía un hero de 150px con un icono genérico de
            hamburguesa, igual para todos los productos: se llevaba una quinta parte del drawer.) */}
        <div className="flex flex-shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <span className="min-w-0 flex-1 font-display text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {producto.nombre}
          </span>
          <span className="flex-shrink-0 text-right">
            <small className="mb-[-2px] block font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
              Precio base
            </small>
            <span className="font-display text-[21px] font-bold tabular-nums text-ink">
              {fmtMxn(producto.precio_base_mxn)}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cerrar"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface transition hover:bg-hover"
          >
            <IconX className="h-[18px] w-[18px] text-ink" />
          </button>
        </div>

        {/* Cuerpo: cuadrícula medida, sin scroll */}
        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {/* El hueco se mide en un elemento sin padding: así el número que entra al cálculo es el
              ancho real de la cuadrícula. */}
          <div ref={zonaRef} className="flex h-full w-full flex-col gap-2">
            {trozos.map((t) => {
              const g = grupos[t.grupo]!;
              const selGrupo = sel[g.id] ?? new Set<string>();
              const valido = grupoValido(g, selGrupo);
              const obligatorio = esObligatorio(g);
              const isUnica = esUnica(g);
              const opciones = g.opciones.slice(t.desde, t.desde + t.cantidad);
              const continuacion = t.desde > 0;

              return (
                <div key={`${g.id}-${t.desde}`} className="flex flex-col">
                  {/* Cabecera del grupo */}
                  <div className="flex flex-shrink-0 items-center gap-2" style={{ height: ALTO_CABECERA }}>
                    <span className={["truncate text-[14px] font-bold", !valido && obligatorio ? "text-danger" : "text-ink"].join(" ")}>
                      {g.nombre}
                      {/* Un grupo partido entre páginas lo dice, para que nadie crea que ya las vio todas. */}
                      {continuacion && <span className="font-medium text-ink-3"> (sigue)</span>}
                    </span>
                    {obligatorio ? (
                      valido ? (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#E7F2EC] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-success">
                          <IconCheck className="h-[11px] w-[11px]" />
                          Listo
                        </span>
                      ) : (
                        <span className="flex-shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-accent">
                          Obligatorio
                        </span>
                      )
                    ) : (
                      <span className="flex-shrink-0 text-[12px] font-medium text-ink-3">Opcional</span>
                    )}
                    <span className="ml-auto flex-shrink-0 text-[11.5px] font-medium text-ink-3">{reglaTipoLabel(g)}</span>
                  </div>

                  {/* Opciones: celdas iguales, todas las del trozo caben */}
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${reparto.columnas}, minmax(0, 1fr))`,
                      gridAutoRows: `${reparto.altoCelda}px`,
                    }}
                  >
                    {opciones.map((o) => {
                      const checked = selGrupo.has(o.id);
                      const atMax =
                        g.tipoSeleccion === "MULTIPLE_OBLIGATORIA_RANGO" &&
                        g.max != null &&
                        selGrupo.size >= g.max &&
                        !checked;
                      const disabled = o.agotada || atMax;

                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={checked}
                          disabled={disabled}
                          onClick={() => toggle(g, o.id)}
                          style={{ fontSize: pxOpcion }}
                          className={[
                            "relative flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded border px-2 py-1 text-center transition-colors",
                            disabled
                              ? "cursor-not-allowed border-line opacity-45"
                              : checked
                                ? "border-ink bg-sel shadow-[inset_0_0_0_1px_rgb(var(--ink))]"
                                : "border-line hover:border-line-strong",
                          ].join(" ")}
                        >
                          {/* Indicador radio/checkbox, en la esquina para no robarle ancho al nombre */}
                          <span
                            className={[
                              "absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center border-[1.5px] transition-colors",
                              isUnica ? "rounded-full" : "rounded-[4px]",
                              checked ? "border-ink bg-ink" : "border-line-strong bg-transparent",
                            ].join(" ")}
                            aria-hidden="true"
                          >
                            <IconCheck className={["h-2.5 w-2.5 text-white", checked ? "opacity-100" : "opacity-0"].join(" ")} />
                          </span>

                          <span className="line-clamp-2 break-words font-medium leading-tight text-ink">
                            {o.nombre}
                            {o.agotada ? <span className="text-ink-3"> (agotado)</span> : null}
                          </span>
                          {o.precioExtra > 0 && (
                            <span className="font-display font-semibold tabular-nums text-ink-2" style={{ fontSize: pxOpcion - 2 }}>
                              +{fmtMxn(o.precioExtra)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Paginador compacto pagina={paginaActual} paginas={reparto.paginas.length} onIr={setPagina} />

        {/* Pie fijo: aviso y alcance arriba; nota y botones en una sola fila */}
        <div className="flex-shrink-0 border-t border-line px-5 py-4">
          {(preguntaAlcance || (!todoValido && primerGrupoInvalido)) && (
            <div className="mb-3 flex items-center gap-4">
              {preguntaAlcance && (
                <div className="inline-flex flex-shrink-0 items-center gap-2">
                  <span className="text-[13px] font-bold text-ink">Cambiar</span>
                  <span role="radiogroup" aria-label="A cuántas unidades aplicar el cambio" className="inline-flex overflow-hidden rounded border border-line-strong">
                    {([
                      ["una", "Solo 1"],
                      ["todas", `Las ${cantidadLinea}`],
                    ] as const).map(([valor, etiqueta]) => (
                      <button
                        key={valor}
                        type="button"
                        role="radio"
                        aria-checked={alcance === valor}
                        onClick={() => setAlcance(valor)}
                        className={[
                          "h-11 px-4 text-[14px] font-semibold transition-colors",
                          alcance === valor ? "bg-ink text-white" : "bg-surface text-ink-2 hover:bg-hover",
                        ].join(" ")}
                      >
                        {etiqueta}
                      </button>
                    ))}
                  </span>
                  <span className="text-[12.5px] font-medium text-ink-3">
                    {alcance === "una" ? "se separa en su propio renglón" : "cambia el renglón entero"}
                  </span>
                </div>
              )}
              {!todoValido && primerGrupoInvalido && (
                <div className="ml-auto flex items-center gap-[7px] text-[12.5px] font-semibold text-warning">
                  <IconAlert className="h-[15px] w-[15px] flex-shrink-0" />
                  <span>
                    {primerGrupoInvalido.tipoSeleccion === "UNICA_OBLIGATORIA"
                      ? `Elige el término en "${primerGrupoInvalido.nombre}" para continuar`
                      : `Completa "${primerGrupoInvalido.nombre}" para continuar`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Nota de cocina: una línea, al lado de los botones. En el modal ancho sobra ancho y
                falta alto, así que la nota le cede el alto a la cuadrícula. */}
            {!sinNota && (
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={200}
                aria-label="Nota para cocina (opcional)"
                placeholder="Nota para cocina (opcional): bien dorada, poca sal…"
                className="h-[52px] min-w-0 flex-1 rounded border border-line-strong px-[13px] font-sans text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-ink focus:shadow-[inset_0_0_0_1px_rgb(var(--ink))]"
              />
            )}

            <button
              type="button"
              onClick={onCancelar}
              className={[
                "flex h-[52px] flex-shrink-0 items-center justify-center rounded border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink-2 transition hover:bg-hover active:bg-sel",
                sinNota ? "mr-auto" : "",
              ].join(" ")}
            >
              Cancelar
            </button>

            {/* Confirmar — accent, con el precio de lo que cambia */}
            <button
              type="button"
              disabled={!todoValido}
              onClick={confirmar}
              className="flex h-[52px] w-[min(340px,40%)] flex-shrink-0 items-center justify-between gap-2 rounded-lg border-none bg-accent px-4 text-[16px] font-bold text-white shadow-[0_1px_3px_rgb(var(--accent)/0.3)] transition hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none"
            >
              <span className="truncate">{editando ? "Guardar cambios" : "Agregar al ticket"}</span>
              <span className="font-display tabular-nums">
                {fmtMxn(preguntaAlcance && alcance === "todas" ? precioTotal * cantidadLinea : precioTotal)}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
