"use client";
import { useMemo, useState } from "react";
import { colorCategoria, ICONOS_POS, type Categoria, type Producto } from "../lib/catalogo";
import { fmtMxn } from "../lib/turno";

/**
 * Catálogo: pestañas de categoría + rejilla de productos.
 *
 * Estaba escrito dentro de la pantalla de venta, así que agregar productos a una cuenta ya
 * abierta obligaba a entrar a ESA pantalla — con su botón Cobrar dominando, que es justo lo que
 * no se quiere en ese momento. Extraído aquí, el mismo catálogo se monta también dentro del
 * modal de "Agregar productos".
 *
 * No sabe de carritos ni de cuentas: avisa qué producto se tocó y ya.
 */
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

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Categorías en pestañas horizontales (.cat-tabs del mockup P-059). Antes eran una barra
          lateral de 200px que el mockup no tiene: en una pantalla de 1024 dejaba el catálogo en
          380px, y las fichas se achicaban hasta desbordar el nombre del producto. */}
      <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface px-5 py-3">
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
              className={[
                "inline-flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg border px-4 py-2.5 text-[14px] transition",
                active
                  ? "border-ink bg-ink font-bold text-white"
                  : "border-line font-semibold text-ink-2 hover:border-line-strong hover:text-ink",
              ].join(" ")}
            >
              <span
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
                style={active ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: col.bg, color: col.ink }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d={ICONOS_POS[c.icono ?? "tag"] ?? ICONOS_POS.tag} />
                </svg>
              </span>
              {c.nombre}
            </button>
          );
        })}
        {categorias?.length === 0 && <p className="text-xs text-ink-3">Sin categorías. Créalas en el admin.</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-bg p-5">
        {productos === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
        {productos !== null && visibles.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-lg font-semibold">Sin productos en esta categoría</p>
            <p className="max-w-md text-sm text-ink-3">Crea productos en el admin para empezar a vender.</p>
          </div>
        )}
        {visibles.length > 0 && (
          // Rejilla del mockup P-059: las columnas las decide el ANCHO DEL CATÁLOGO, no el de la
          // ventana. Con cortes por viewport (lg:/xl:) una pantalla de 1024 pedía 4 columnas
          // dentro de una columna de ~380px → fichas de 87px y el nombre desbordado.
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {visibles.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.agotado || bloqueado}
                onClick={() => onTapProducto(p)}
                className={[
                  "group relative flex min-h-[150px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-lg border bg-surface px-3 py-4 text-center transition",
                  p.agotado || bloqueado
                    ? "cursor-not-allowed border-line opacity-50"
                    : "border-line hover:border-ink hover:shadow-sm active:scale-[.98]",
                ].join(" ")}
              >
                {p.agotado && (
                  <span className="absolute right-2 top-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                    Agotado
                  </span>
                )}
                <span className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-xl bg-hover">
                  <span className="font-display text-[22px] font-bold text-ink-3">{p.nombre.charAt(0)}</span>
                </span>
                {/* break-words: sin esto un nombre largo sin espacios se sale de la ficha. */}
                <span className="break-words text-[14px] font-semibold leading-tight">{p.nombre}</span>
                <span className="font-display text-[15px] font-bold tabular-nums">{fmtMxn(p.precio_base_mxn)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
