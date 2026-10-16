"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "@vim/ui/styles";
import type { Categoria, Producto } from "../lib/catalogo";
import { menuVisible } from "../lib/catalogo-sucursal";
import { calcularBarraCategorias, calcularRejilla, clampPagina, tamanoEtiqueta, tamanoNombre } from "../lib/rejilla";
import { agruparTienda, decidirEscaneo, resumenVitrina, type Existencia, type PadreTienda } from "../lib/tienda";
import { fmtMxn } from "../lib/turno";
import { useEscaner } from "../lib/use-escaner";
import { useHueco } from "../lib/usar-hueco";
import { Paginador } from "./paginador";
import { SelectorVariantes } from "./selector-variantes";

/** La franja bajo la barra de escaneo. Su capa de Escape la declara `home-pos`. */
export type AvisoEscaneo = { tipo: "no-encontrado"; codigo: string } | { tipo: "cobro" };

/** Sin mayúsculas ni acentos: «camiseta» encuentra «Camíseta». */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const sonarError = () => {
  try { void new Audio("/sonidos/escaneo-error.wav").play().catch(() => {}); } catch { /* sin audio, la franja basta */ }
};

/**
 * Panel izquierdo de la venta de tienda (pos-retail.md, «La pantalla de venta» y «Escáner»):
 * barra de escaneo y búsqueda, categorías con «Todo» primero y la cuadrícula de padres y productos
 * sueltos, sin variantes sueltas. El ticket, el cobro y lo demás siguen en `home-pos`; el
 * selector y la franja viven allá como estado para que su Escape quede en la misma pila.
 */
export function PanelVentaRetail({
  productos: todosProductos,
  categorias: todasCategorias,
  existencias,
  sucursalId,
  sucursales,
  actualizadoA,
  cobroAbierto,
  escaneoIgnorado,
  bloqueado,
  selector,
  onSelector,
  aviso,
  onAviso,
  onAgregar,
}: {
  productos: Producto[] | null;
  categorias: Categoria[] | null;
  existencias: Existencia[];
  sucursalId: string;
  sucursales: { id: string; nombre: string }[];
  /** Hora ISO del último pull de la caja; `null` en el POS web («al momento»). */
  actualizadoA: string | null;
  cobroAbierto: boolean;
  /** Un PIN, el aviso de un pedido de la tienda u otro diálogo encima: el escaneo no hace nada. */
  escaneoIgnorado: boolean;
  /** El menú está trabado (ticket incompleto, cuenta impresa…): igual que en `CatalogoProductos`. */
  bloqueado: boolean;
  selector: PadreTienda | null;
  onSelector: (p: PadreTienda | null) => void;
  aviso: AvisoEscaneo | null;
  onAviso: (a: AvisoEscaneo | null) => void;
  /** Nunca recibe un padre. */
  onAgregar: (p: Producto) => void;
}) {
  // Lo que esta sucursal no vende no se pinta ni se escanea (ADR 0027), igual que en el catálogo.
  const { categorias, productos } = useMemo(
    () => (todasCategorias && todosProductos ? menuVisible(todasCategorias, todosProductos) : { categorias: todasCategorias, productos: todosProductos }),
    [todasCategorias, todosProductos],
  );
  const { vitrina, padres } = useMemo(() => {
    const g = agruparTienda(productos ?? []);
    // Un padre sin ninguna hija que se venda aquí no tiene nada que elegir: no sale.
    return { vitrina: g.vitrina.filter((p) => !p.variante_ejes?.length || (g.padres.get(p.id)?.hijas.length ?? 0) > 0), padres: g.padres };
  }, [productos]);

  const [texto, setTexto] = useState("");
  const [catSel, setCatSel] = useState<string | null>(null); // null = «Todo»
  const campo = useRef<HTMLInputElement>(null);

  const visibles = useMemo(() => {
    const q = plano(texto.trim());
    if (q) {
      // Buscar es sobre todo el catálogo, no sobre la categoría elegida: así se busca en una tienda.
      const coincide = (p: Producto) =>
        plano(p.nombre).includes(q) || [p.codigo_barras, p.codigo_interno].some((k) => k && plano(k).includes(q));
      return vitrina.filter((p) => coincide(p) || (padres.get(p.id)?.hijas.some(coincide) ?? false));
    }
    if (catSel) return vitrina.filter((p) => p.categoria_id === catSel);
    return [...vitrina].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [vitrina, padres, texto, catSel]);

  const tocar = (p: Producto) => {
    const padre = padres.get(p.id);
    if (padre) onSelector(padre);
    else onAgregar(p);
  };

  // ── Escáner: funciona sin foco. Encontrado agrega (sin sonido: el lector ya pita). ─────────
  const alCodigo = (codigo: string) => {
    const d = decidirEscaneo(productos ?? [], codigo, { cobroAbierto, ignorar: escaneoIgnorado || bloqueado });
    if (d.tipo === "ignorar") return;
    if (d.tipo === "cobro") { onAviso({ tipo: "cobro" }); return; }
    if (d.tipo === "no-encontrado") { onAviso({ tipo: "no-encontrado", codigo }); sonarError(); return; }
    if (d.tipo === "selector") {
      onAviso(null);
      const padre = padres.get(d.padre.id);
      if (padre?.hijas.length) onSelector(padre);
      else { onAviso({ tipo: "no-encontrado", codigo }); sonarError(); }
      return;
    }
    onAgregar(d.producto);
  };
  useEscaner(alCodigo, true);

  // «Termina el cobro…» solo tiene sentido mientras el cobro sigue abierto.
  useEffect(() => {
    if (!cobroAbierto && aviso?.tipo === "cobro") onAviso(null);
  }, [cobroAbierto, aviso, onAviso]);

  /** Enter a mano: un código exacto agrega (o abre su selector); si no, un solo resultado. */
  const alEnter = () => {
    const d = decidirEscaneo(productos ?? [], texto, { cobroAbierto: false, ignorar: bloqueado });
    if (d.tipo === "agregar") onAgregar(d.producto);
    else if (d.tipo === "selector" && padres.get(d.padre.id)?.hijas.length) onSelector(padres.get(d.padre.id)!);
    else if (visibles.length === 1 && !bloqueado) tocar(visibles[0]!);
    else return;
    setTexto("");
  };

  // ── Categorías y rejilla: las mismas medidas que el catálogo de siempre ─────────────────────
  const [barraRef, huecoBarra] = useHueco<HTMLDivElement>();
  const nPastillas = (categorias?.length ?? 0) + 1;
  const barra = useMemo(() => calcularBarraCategorias({ ancho: huecoBarra.ancho, total: nPastillas }), [huecoBarra.ancho, nPastillas]);
  const [zonaRef, hueco] = useHueco<HTMLDivElement>();
  const rejilla = useMemo(
    () => calcularRejilla({ ancho: hueco.ancho, alto: hueco.alto, total: visibles.length }),
    [hueco.ancho, hueco.alto, visibles.length],
  );
  const [pagina, setPagina] = useState(1);
  const paginaActual = clampPagina(pagina, rejilla.paginas);
  useEffect(() => setPagina(1), [catSel, texto]);
  const enPantalla = visibles.slice((paginaActual - 1) * rejilla.porPagina, paginaActual * rejilla.porPagina);
  const pxNombre = tamanoNombre(rejilla.anchoFicha, rejilla.altoFicha);
  const pxEtiqueta = tamanoEtiqueta(barra.anchoPastilla);

  const pastilla = (activa: boolean) =>
    [
      "inline-flex items-center justify-center overflow-hidden rounded-lg border px-2.5 text-center font-semibold leading-tight transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.97]",
      activa ? "border-ink bg-ink font-bold text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
    ].join(" ");

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Barra de escaneo: lo más usado después de Cobrar. Sin autofoco: en la pantalla táctil
          abriría el teclado, y el lector no necesita foco. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <label className="relative flex h-14 min-w-0 flex-1 items-center rounded-lg border border-line-strong bg-surface focus-within:border-ink">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="ml-4 h-6 w-6 flex-shrink-0 text-ink-2">
            <path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14" />
          </svg>
          <input
            ref={campo}
            data-escaner="busqueda"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); alEnter(); } }}
            placeholder="Escanea o busca por nombre o SKU…"
            aria-label="Escanea o busca por nombre o SKU"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-16 text-ink outline-none placeholder:text-ink-3"
          />
          {texto && (
            <button
              type="button"
              onClick={() => setTexto("")}
              aria-label="Limpiar búsqueda"
              className="mr-1.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]"
            >
              <Icono nombre="cerrar" className="h-5 w-5" />
            </button>
          )}
        </label>
        <span className="flex-shrink-0 text-13 text-ink-3">Lector listo</span>
      </div>

      {aviso?.tipo === "no-encontrado" && (
        <div className="flex flex-shrink-0 items-center gap-3 bg-danger-soft px-4 py-1.5" role="alert">
          <p className="min-w-0 flex-1 text-13 font-medium text-danger">No encontramos el código {aviso.codigo}.</p>
          <button
            type="button"
            onClick={() => campo.current?.focus()}
            className="h-11 flex-shrink-0 rounded border border-danger-line bg-surface px-3 text-14 font-semibold text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger/10 active:scale-[.97]"
          >
            Buscar a mano
          </button>
          <button
            type="button"
            onClick={() => onAviso(null)}
            aria-label="Cerrar aviso"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger/10 active:scale-[.97]"
          >
            <Icono nombre="cerrar" className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Con el cobro abierto la franja de arriba quedaría tapada: este aviso va sobre el modal. */}
      {aviso?.tipo === "cobro" && (
        <div className="fixed left-1/2 top-4 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-danger-line bg-danger-soft py-1 pl-4 pr-1 shadow-xl" role="alert">
          <p className="text-14 font-semibold text-danger">Termina el cobro para agregar productos.</p>
          <button
            type="button"
            onClick={() => onAviso(null)}
            aria-label="Cerrar aviso"
            className="flex h-11 w-11 items-center justify-center rounded text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger/10 active:scale-[.97]"
          >
            <Icono nombre="cerrar" className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        ref={barraRef}
        className="grid flex-shrink-0 gap-2 border-b border-line bg-surface px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${barra.columnas}, minmax(0, 1fr))` }}
      >
        <button type="button" onClick={() => setCatSel(null)} aria-current={catSel === null ? "true" : undefined} style={{ height: 56, fontSize: pxEtiqueta }} className={pastilla(catSel === null)}>
          Todo
        </button>
        {categorias?.map((c) => (
          <button key={c.id} type="button" onClick={() => setCatSel(c.id)} aria-current={catSel === c.id ? "true" : undefined} style={{ height: 56, fontSize: pxEtiqueta }} className={pastilla(catSel === c.id)}>
            <span className="line-clamp-2 break-words">{c.nombre}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-bg p-4">
        <div ref={zonaRef} className="h-full w-full">
          {productos === null && <p className="text-14 text-ink-3">Cargando productos…</p>}
          {productos !== null && visibles.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-display text-18 font-semibold">{texto.trim() ? "Nada coincide con la búsqueda" : "Sin productos en esta categoría"}</p>
              <p className="max-w-md text-14 text-ink-3">{texto.trim() ? "Revisa el nombre o el SKU, o escanea la etiqueta." : "Crea productos en el admin para empezar a vender."}</p>
            </div>
          )}
          {enPantalla.length > 0 && (
            <div
              className="grid h-full w-full gap-3"
              style={{ gridTemplateColumns: `repeat(${rejilla.columnas}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rejilla.filas}, minmax(0, 1fr))` }}
            >
              {enPantalla.map((p) => {
                const r = resumenVitrina(p, padres, existencias, sucursalId);
                // Solo hay existencia que enseñar si el producto la lleva (las hijas siempre la llevan).
                const conExistencia = padres.has(p.id) || p.controla_existencias === true;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={bloqueado}
                    onClick={() => tocar(p)}
                    style={{ fontSize: pxNombre }}
                    className={[
                      "flex h-full w-full flex-col justify-center gap-1.5 overflow-hidden rounded-lg border px-3.5 py-2 text-left transition-[transform,border-color] duration-150 ease-vim",
                      bloqueado ? "cursor-not-allowed border-line-strong bg-surface opacity-50" : "border-line-strong bg-surface hover:border-ink active:scale-[.97]",
                    ].join(" ")}
                  >
                    <span className="line-clamp-2 break-words font-semibold leading-tight text-ink">{p.nombre}</span>
                    <span className="font-display font-bold tabular-nums text-ink" style={{ fontSize: pxNombre - 1 }}>
                      {r.precioDesde !== null ? `desde ${fmtMxn(r.precioDesde)}` : fmtMxn(p.precio_base_mxn)}
                    </span>
                    {conExistencia && (
                      <span className={["text-13", r.estado === "agotada" ? "font-semibold text-danger" : r.estado === "pocas" ? "font-semibold text-warning" : "text-ink-2"].join(" ")}>
                        {r.estado === "agotada" ? "Agotada" : r.estado === "pocas" ? `Pocas: ${r.piezas}` : `${r.piezas} en tienda`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Paginador pagina={paginaActual} paginas={rejilla.paginas} onIr={(n) => setPagina(clampPagina(n, rejilla.paginas))} />

      {selector && (
        <SelectorVariantes
          padre={selector}
          existencias={existencias}
          sucursalId={sucursalId}
          sucursales={sucursales}
          actualizadoA={actualizadoA}
          onElegir={onAgregar}
          onCerrar={() => onSelector(null)}
        />
      )}
    </div>
  );
}
