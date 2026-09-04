"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { listarRecetasResumen, margen, type RecetaResumen } from "../../../lib/recetas";
import { mensajeError } from "../../../lib/errores";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)} %`);
const input = "h-10 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";

type Estado = "CON" | "SIN" | "PAUSADA";
function estadoDe(r: RecetaResumen): Estado {
  if (r.activa === null) return "SIN";
  return r.activa ? "CON" : "PAUSADA";
}
const BADGE: Record<Estado, { texto: string; clase: string }> = {
  CON: { texto: "Con receta", clase: "bg-[#E8F1EC] text-success" },
  PAUSADA: { texto: "Receta pausada", clase: "bg-[#FDF3E2] text-warning" },
  SIN: { texto: "Sin receta", clase: "bg-hover text-ink-3" },
};

export default function RecetasPage() {
  const [filas, setFilas] = useState<RecetaResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloSin, setSoloSin] = useState(false);

  useEffect(() => {
    listarRecetasResumen().then(setFilas).catch((e) => { setError(mensajeError(e, "No se pudieron cargar las recetas")); setFilas([]); });
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (filas ?? []).filter((r) => (!soloSin || r.activa === null) && (!q || r.nombre.toLowerCase().includes(q) || r.categoriaNombre.toLowerCase().includes(q)));
  }, [filas, busqueda, soloSin]);

  const sinReceta = (filas ?? []).filter((r) => r.activa === null).length;

  return (
    <>
      <PageHeader
        titulo="Recetas y costos"
        subtitulo="Qué insumos lleva cada producto y cuánto te cuesta. El margen se calcula contra el precio sin IVA."
        migas={[{ label: "Catálogo" }, { label: "Recetas" }]}
      />
      <CatalogoTabs />
      <PageBody>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <input className={input} placeholder="Buscar producto o categoría" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} />
            Solo sin receta ({sinReceta})
          </label>
        </div>
        {filas === null && <p className="text-sm text-ink-3">Cargando…</p>}
        {filas !== null && (
          <TablaScroll min={760}>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.04em] text-ink-3">
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="py-2 pr-3 font-semibold">Categoría</th>
                  <th className="py-2 pr-3 text-right font-semibold">Precio sin IVA</th>
                  <th className="py-2 pr-3 text-right font-semibold">Costo</th>
                  <th className="py-2 pr-3 text-right font-semibold">Margen $</th>
                  <th className="py-2 pr-3 text-right font-semibold">Margen %</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => {
                  const m = r.costo == null ? null : margen(r.precioSinIva, r.costo);
                  const est = estadoDe(r);
                  return (
                    <tr key={r.productoId} className="h-10 border-b border-line-soft hover:bg-hover">
                      <td className="pr-3"><Link className="font-medium text-ink underline-offset-2 hover:underline" href={`/catalogo/recetas/${r.productoId}`}>{r.nombre}</Link></td>
                      <td className="pr-3 text-ink-2">{r.categoriaNombre}</td>
                      <td className="pr-3 text-right tabular-nums">{fmt(r.precioSinIva)}</td>
                      <td className="pr-3 text-right tabular-nums">{r.costo == null ? "—" : fmt(r.costo)}</td>
                      <td className={`pr-3 text-right tabular-nums ${m && m.pesos < 0 ? "text-danger" : ""}`}>{m ? fmt(m.pesos) : "—"}</td>
                      <td className={`pr-3 text-right tabular-nums ${m && m.porcentaje != null && m.porcentaje < 0 ? "text-danger" : ""}`}>{m ? pct(m.porcentaje) : "—"}</td>
                      <td><span className={`rounded px-2 py-0.5 text-[12px] font-medium ${BADGE[est].clase}`}>{BADGE[est].texto}</span></td>
                    </tr>
                  );
                })}
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-sm text-ink-3">No hay productos que coincidan.</td></tr>
                )}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </PageBody>
    </>
  );
}
