"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { colorCategoria, ICONOS_POS, type Categoria, type Producto } from "../lib/catalogo";
import { usePreciosVisibles } from "../lib/precios-visibles";
import {
  calcularBarraCategorias,
  calcularRejilla,
  clampPagina,
  tamanoEtiqueta,
  tamanoNombre,
} from "../lib/rejilla";
import { fmtMxn } from "../lib/turno";

/**
 * Catálogo: cuadrícula de categorías + cuadrícula de productos.
 *
 * Estaba escrito dentro de la pantalla de venta, así que agregar productos a una cuenta ya
 * abierta obligaba a entrar a ESA pantalla — con su botón Cobrar dominando, que es justo lo que
 * no se quiere en ese momento. Extraído aquí, el mismo catálogo se monta también dentro del
 * modal de "Agregar productos".
 *
 * No sabe de carritos ni de cuentas: avisa qué producto se tocó y ya.
 *
 * DOS CUADRÍCULAS RÍGIDAS, Y NADA SCROLLEA
 *
 * Antes las categorías iban en una barra `overflow-x-auto` de una sola fila y los productos en una
 * columna con scroll vertical. En una caja de 1366×768 eso dejaba ~5 categorías y 15 productos a
 * la vista; el resto había que arrastrarlo con el dedo en hora pico, que es cuando menos se puede.
 *
 * La regla de ahora: **manda la cuadrícula, no el contenido.**
 *
 * - Columnas y filas salen del hueco real (`lib/rejilla.ts`). Las celdas son todas iguales y
 *   **llenan el hueco completo**: ni canal muerto a la derecha ni franja abajo.
 * - La cuadrícula mide lo mismo tenga la categoría 3 productos o 20. Solo cambia cuántas celdas
 *   van llenas, así que cada producto conserva su posición y su tamaño al cambiar de pestaña.
 * - **El texto se achica para caber**, nunca al revés.
 * - Cuando la categoría no cabe ni así, se **pagina**. Scroll no hay en ningún caso.
 *
 * Todo sale de medir el elemento, nunca de cortes por viewport (`lg:`/`xl:`): el ancho que importa
 * es el del catálogo, no el de la ventana — el sidebar del ticket se lleva un cuarto.
 */

/** Alto de la pastilla de categoría (44px = objetivo táctil mínimo del doc de diseño). */
const ALTO_PASTILLA = 44;
/** Por debajo de este ancho de pastilla, el icono le quita al nombre más de lo que aporta. */
const ANCHO_CON_ICONO = 130;

/**
 * Vigila el tamaño de un elemento y devuelve la limpieza.
 *
 * Mide **en firme al montar** y no solo con `ResizeObserver`, porque el observer entrega sus avisos
 * como parte del ciclo de pintado: si la ventana está oculta o minimizada cuando el catálogo se
 * monta, no llega ninguno y la cuadrícula se quedaría creyendo que mide 0×0 —una celda por página—
 * hasta el siguiente cambio de tamaño. `getBoundingClientRect` sí responde sin pintar.
 */
function observarTamano(el: HTMLElement, medir: () => void): () => void {
  medir();
  const ro = new ResizeObserver(medir);
  ro.observe(el);
  window.addEventListener("resize", medir);
  return () => {
    ro.disconnect();
    window.removeEventListener("resize", medir);
  };
}

export function CatalogoProductos({
  categorias,
  productos,
  bloqueado = false,
  onTapProducto,
}: {
  categorias: Categoria[] | null;
  productos: Producto[] | null;
  bloqueado?: boolean;
  onTapProducto: (p: Producto) => void;
}) {
  const [elegida, setElegida] = useState<string | null>(null);
  // La primera categoría queda activa sin necesidad de un efecto: las categorías llegan async
  // (red o cache) y un `useState` inicial se quedaría en null para siempre.
  const catSel = elegida ?? categorias?.[0]?.id ?? null;
  const visibles = useMemo(
    () => (productos ?? []).filter((p) => !catSel || p.categoria_id === catSel),
    [productos, catSel],
  );
  const mostrarPrecios = usePreciosVisibles();

  // ── Categorías: cuadrícula pareja, sin scroll ───────────────────────────────────────────────
  const barraRef = useRef<HTMLDivElement>(null);
  const [anchoBarra, setAnchoBarra] = useState(0);

  useLayoutEffect(() => {
    const el = barraRef.current;
    if (!el) return;
    return observarTamano(el, () => setAnchoBarra(el.getBoundingClientRect().width));
  }, []);

  const barra = useMemo(
    () => calcularBarraCategorias({ ancho: anchoBarra, total: categorias?.length ?? 0 }),
    [anchoBarra, categorias?.length],
  );

  // ── Rejilla: columnas, filas y páginas del hueco real ───────────────────────────────────────
  const zonaRef = useRef<HTMLDivElement>(null);
  const [hueco, setHueco] = useState({ ancho: 0, alto: 0 });
  const [pagina, setPagina] = useState(1);

  useLayoutEffect(() => {
    const el = zonaRef.current;
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
    return observarTamano(el, medir);
  }, []);

  const rejilla = useMemo(
    () => calcularRejilla({ ancho: hueco.ancho, alto: hueco.alto, total: visibles.length }),
    [hueco.ancho, hueco.alto, visibles.length],
  );

  // La página se acota al pintar, no en un efecto: al achicar la ventana estando en la última
  // página, un efecto pintaría un frame vacío antes de corregirse.
  const paginaActual = clampPagina(pagina, rejilla.paginas);
  const enPantalla = useMemo(
    () => visibles.slice((paginaActual - 1) * rejilla.porPagina, paginaActual * rejilla.porPagina),
    [visibles, paginaActual, rejilla.porPagina],
  );

  useEffect(() => setPagina(1), [catSel]);

  const irA = useCallback((n: number) => setPagina(clampPagina(n, rejilla.paginas)), [rejilla.paginas]);

  // ── Swipe horizontal para cambiar de página ─────────────────────────────────────────────────
  // El riesgo es real: un arrastre que empieza sobre una celda también dispararía su click y
  // metería un producto al ticket sin querer. Por eso el click se corta en fase de captura.
  const arrastre = useRef<{ x: number; t: number } | null>(null);
  const huboArrastre = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    arrastre.current = { x: e.clientX, t: Date.now() };
    huboArrastre.current = false;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const ini = arrastre.current;
    arrastre.current = null;
    if (!ini) return;
    const dx = Math.abs(e.clientX - ini.x);
    // Por debajo de esto fue un toque con temblor de dedo, se mueva como se mueva. Sin este piso,
    // un toque de 2px en 0ms da una "velocidad" enorme y pasaba por flick: la página saltaba y el
    // producto NO entraba al ticket. Justo el gesto que más se repite en hora pico.
    if (dx < 24) return;
    const velocidad = dx / Math.max(1, Date.now() - ini.t);
    if (dx < 48 && velocidad <= 0.11) return;
    huboArrastre.current = true;
    irA(paginaActual + (e.clientX < ini.x ? 1 : -1));
  };

  const pxNombre = tamanoNombre(rejilla.anchoFicha, rejilla.altoFicha);
  const pxEtiqueta = tamanoEtiqueta(barra.anchoPastilla);
  const conIcono = barra.anchoPastilla >= ANCHO_CON_ICONO;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Categorías: cuadrícula pareja que llena el ancho. Todas las pastillas miden lo mismo y el
          reparto es parejo (11 categorías salen 6 y 5, no 10 y 1). Nunca scrollea. */}
      <div
        ref={barraRef}
        className="grid flex-shrink-0 gap-2 border-b border-line bg-surface px-5 py-3"
        style={{ gridTemplateColumns: `repeat(${barra.columnas}, minmax(0, 1fr))` }}
      >
        {categorias === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {categorias?.map((c, i) => {
          const col = colorCategoria(c, i);
          const active = catSel === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setElegida(c.id)}
              aria-current={active ? "true" : undefined}
              style={{ height: ALTO_PASTILLA, fontSize: pxEtiqueta }}
              className={[
                "inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg border px-2 text-center font-semibold leading-tight transition-colors",
                active
                  ? "border-ink bg-ink font-bold text-white"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              ].join(" ")}
            >
              {conIcono && (
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
                  style={active ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: col.bg, color: col.ink }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path d={ICONOS_POS[c.icono ?? "tag"] ?? ICONOS_POS.tag} />
                  </svg>
                </span>
              )}
              <span className="line-clamp-2 break-words">{c.nombre}</span>
            </button>
          );
        })}
        {categorias?.length === 0 && <p className="text-xs text-ink-3">Sin categorías. Créalas en el admin.</p>}
      </div>

      <div
        className="min-h-0 flex-1 overflow-hidden bg-bg p-5 outline-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClickCapture={(e) => {
          if (!huboArrastre.current) return;
          huboArrastre.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        // tabIndex para que el contenedor pueda quedarse el foco: la celda que lo tenía desaparece
        // al cambiar de página, y sin esto la segunda flecha ya no llegaba a ningún lado.
        tabIndex={-1}
        onKeyDown={(e) => {
          if (rejilla.paginas < 2) return;
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          e.currentTarget.focus();
          irA(paginaActual + (e.key === "ArrowRight" ? 1 : -1));
        }}
      >
        {/* El hueco se mide AQUÍ, en un elemento sin padding: así el número que entra al cálculo
            es el mismo que el ancho real de la cuadrícula. */}
        <div ref={zonaRef} className="h-full w-full">
          {productos === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
          {productos !== null && visibles.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-display text-lg font-semibold">Sin productos en esta categoría</p>
              <p className="max-w-md text-sm text-ink-3">Crea productos en el admin para empezar a vender.</p>
            </div>
          )}
          {enPantalla.length > 0 && (
            <div
              className="grid h-full w-full gap-3"
              style={{
                gridTemplateColumns: `repeat(${rejilla.columnas}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rejilla.filas}, minmax(0, 1fr))`,
              }}
            >
              {enPantalla.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.agotado || bloqueado}
                  onClick={() => onTapProducto(p)}
                  style={{ fontSize: pxNombre }}
                  className={[
                    "flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-surface px-2 py-1.5 text-center transition",
                    p.agotado || bloqueado
                      ? "cursor-not-allowed border-line opacity-50"
                      : "border-line hover:border-ink hover:shadow-sm active:scale-[.97]",
                  ].join(" ")}
                >
                  {/* Solo el nombre. El precio ocupa un renglón que el cajero no necesita, y sin él
                      cabe más grande en la misma celda; se enciende con "Mostrar precios" cuando un
                      cliente pregunta. break-words: un nombre largo sin espacios se saldría. */}
                  <span className={[mostrarPrecios ? "line-clamp-2" : "line-clamp-3", "break-words font-semibold leading-snug"].join(" ")}>
                    {p.nombre}
                  </span>
                  {p.agotado ? (
                    <span className="font-bold uppercase tracking-wide text-danger" style={{ fontSize: pxNombre - 2 }}>
                      Agotado
                    </span>
                  ) : (
                    mostrarPrecios && (
                      <span className="font-display font-bold tabular-nums" style={{ fontSize: pxNombre }}>
                        {fmtMxn(p.precio_base_mxn)}
                      </span>
                    )
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* La barra de páginas vive FUERA de la zona medida: al aparecer le quita alto a la rejilla,
          el observer recalcula y —como quitar alto nunca reduce el número de páginas— converge en
          una pasada, sin parpadeo. */}
      {rejilla.paginas > 1 && (
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-5 py-2">
          <span className="mr-1 text-[13px] font-semibold tabular-nums text-ink-3">
            {paginaActual} / {rejilla.paginas}
          </span>
          <BotonPagina etiqueta="Página anterior" onClick={() => irA(paginaActual - 1)} disabled={paginaActual === 1}>
            <path d="M15 18l-6-6 6-6" />
          </BotonPagina>
          <BotonPagina etiqueta="Página siguiente" onClick={() => irA(paginaActual + 1)} disabled={paginaActual === rejilla.paginas}>
            <path d="M9 18l6-6-6-6" />
          </BotonPagina>
        </div>
      )}
    </div>
  );
}

function BotonPagina({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className="flex h-[46px] w-[58px] items-center justify-center rounded-lg border border-line-strong text-ink transition hover:border-ink hover:bg-hover active:scale-[.97] disabled:cursor-not-allowed disabled:border-line disabled:text-ink-3"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
