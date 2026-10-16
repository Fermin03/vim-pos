"use client";
import { useState } from "react";
import { Icono, Modal } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import { matrizVariantes, type EstadoExistencia, type Existencia, type PadreTienda } from "../lib/tienda";
import { fmtMxn } from "../lib/turno";

/** «Actualizado a las 10:42», o «al momento» en el POS web (`null`), donde se lee la nube. */
export function textoActualizado(actualizadoA: string | null): string {
  if (actualizadoA === null) return "Actualizado al momento";
  const d = new Date(actualizadoA);
  if (Number.isNaN(d.getTime())) return "Aún sin actualizar";
  return `Actualizado a las ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** Un negativo se ve como tal: «−2». */
const piezas = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));

const ESTILO: Record<EstadoExistencia, string> = {
  normal: "border-line-strong bg-surface text-ink",
  pocas: "border-warning-line bg-warning-soft text-warning",
  agotada: "border-danger-line bg-danger-soft text-danger",
};

/**
 * Selector de talla y color (pos-retail.md, «Selector de talla y color»). Columnas = primer eje,
 * renglones = segundo. Tocar una celda agrega UNA pieza: no hay botón «Agregar». Las otras
 * sucursales se ven en gris y no se tocan. Escape lo atiende el `Modal`.
 */
export function SelectorVariantes({
  padre,
  existencias,
  sucursalId,
  sucursales,
  actualizadoA,
  onElegir,
  onCerrar,
  marcada,
}: {
  padre: PadreTienda;
  existencias: Existencia[];
  sucursalId: string;
  sucursales: { id: string; nombre: string }[];
  actualizadoA: string | null;
  onElegir: (hija: Producto) => void;
  onCerrar: () => void;
  /** Id de la hija «La que regresa» (cambio de talla). */
  marcada?: string;
}) {
  const [viendo, setViendo] = useState(sucursalId);
  const propia = viendo === sucursalId;
  const m = matrizVariantes(padre, existencias, viendo);
  const precios = padre.hijas.map((h) => h.precio_base_mxn);
  const desde = Math.min(...precios);
  const mismoPrecio = desde === Math.max(...precios);
  const [ejeCol, ejeRen] = padre.ejes;
  const nombreViendo = sucursales.find((s) => s.id === viendo)?.nombre;

  return (
    <Modal open onClose={onCerrar} title={padre.padre.nombre} hideTitle className="flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col rounded-lg bg-surface shadow-xl">
      <div className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-20 font-bold leading-tight text-ink">{padre.padre.nombre}</p>
          <p className="mt-1 font-display text-18 font-bold tabular-nums text-ink">
            {mismoPrecio ? fmtMxn(desde) : `desde ${fmtMxn(desde)}`}
          </p>
          <p className="mt-1 text-13 text-ink-2">{nombreViendo ? `Existencia en ${nombreViendo}` : "Existencia en esta sucursal"}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]"
        >
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {sucursales.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Sucursal">
            {sucursales.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === viendo}
                onClick={() => setViendo(s.id)}
                className={[
                  "h-11 rounded border px-3 text-14 font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.97]",
                  s.id === viendo ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
                ].join(" ")}
              >
                {s.nombre}
              </button>
            ))}
            {!propia && <p className="text-13 text-ink-2">Solo para consultar · {textoActualizado(actualizadoA)}</p>}
          </div>
        )}

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `${ejeRen ? "auto " : ""}repeat(${m.columnas.length}, minmax(56px, 1fr))` }}
        >
          {ejeRen && <span aria-hidden="true" />}
          {m.columnas.map((c) => (
            <span key={c} className="self-end text-center text-13 font-semibold text-ink-2">{c || ejeCol}</span>
          ))}
          {m.renglones.map((r) => [
            ejeRen ? <span key={`r-${r}`} className="flex items-center pr-2 text-13 font-semibold text-ink-2">{r}</span> : null,
            ...m.columnas.map((c) => {
              const celda = m.celda(c, r);
              if (!celda) {
                return (
                  <button key={`${c}-${r}`} type="button" disabled aria-label={`${c} ${r}: no existe`}
                    className="flex min-h-14 items-center justify-center rounded border border-dashed border-line text-16 text-ink-3">
                    —
                  </button>
                );
              }
              const precio = celda.hija.precio_base_mxn !== desde ? fmtMxn(celda.hija.precio_base_mxn) : null;
              const esMarcada = celda.hija.id === marcada;
              return (
                <button
                  key={`${c}-${r}`}
                  type="button"
                  disabled={!propia}
                  onClick={() => onElegir(celda.hija)}
                  aria-label={`${[c, r].filter(Boolean).join(" ")}: ${piezas(celda.cantidad)} piezas`}
                  className={[
                    "flex min-h-14 flex-col items-center justify-center rounded border px-1 py-1.5",
                    propia
                      ? `${ESTILO[celda.estado]} transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.97]`
                      : "cursor-default border-line bg-bg text-ink-3",
                    esMarcada ? "ring-2 ring-ink ring-offset-1" : "",
                  ].join(" ")}
                >
                  <span className="font-display text-20 font-bold leading-none tabular-nums">{piezas(celda.cantidad)}</span>
                  {precio && <span className="mt-1 text-12 tabular-nums text-ink-2">{precio}</span>}
                  {esMarcada && <span className="mt-1 text-11 font-semibold text-ink">La que regresa</span>}
                </button>
              );
            }),
          ])}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-line px-6 py-3 text-12 text-ink-2">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm border border-warning-line bg-warning-soft" />Pocas</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm border border-danger-line bg-danger-soft" />Agotada, se vende con aviso</span>
      </div>
    </Modal>
  );
}
