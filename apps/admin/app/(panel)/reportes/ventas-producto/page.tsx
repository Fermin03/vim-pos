"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerVentasPorProducto, rangoUltimosDias, type FilaProducto } from "../../../lib/reportes";

export default function VentasPorProductoPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaProducto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerVentasPorProducto(d, h)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  const gran = (filas ?? []).reduce((s, f) => s + f.total_mxn, 0) || 1;

  return (
    <>
      <PageHeader
        titulo="Ventas por producto"
        subtitulo="Qué se vende más, ordenado por ingreso. Top 200."
        migas={[{ label: "Reportes" }, { label: "Ventas por producto" }]}
      />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Producto</th>
                  <th className="px-4 py-2.5 text-right">Unidades</th>
                  <th className="px-4 py-2.5 text-right">Tickets</th>
                  <th className="px-4 py-2.5 text-right">Ingreso</th>
                  <th className="px-4 py-2.5 text-right">% del total</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">Sin ventas en el rango.</td></tr>}
                {filas.slice(0, 200).map((f, i) => (
                  <tr key={f.producto_id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 text-ink-3 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{f.producto_nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.unidades}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.tickets_con_producto}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.total_mxn)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{((f.total_mxn / gran) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
