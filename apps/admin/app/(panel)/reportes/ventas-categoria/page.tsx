"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerVentasPorCategoria, rangoUltimosDias, type FilaCategoria } from "../../../lib/reportes";

export default function VentasPorCategoriaPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaCategoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerVentasPorCategoria(d, h)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  const gran = (filas ?? []).reduce((s, f) => s + f.total_mxn, 0) || 1;

  return (
    <>
      <PageHeader
        titulo="Ventas por categoría"
        subtitulo="Mix de venta del menú agrupado por categoría."
        migas={[{ label: "Reportes" }, { label: "Ventas por categoría" }]}
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
                  <th className="px-4 py-2.5">Categoría</th>
                  <th className="px-4 py-2.5 text-right">Unidades</th>
                  <th className="px-4 py-2.5 text-right">Tickets</th>
                  <th className="px-4 py-2.5 text-right">Ingreso</th>
                  <th className="px-4 py-2.5">Participación</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">Sin ventas en el rango.</td></tr>}
                {filas.map((f) => {
                  const pct = (f.total_mxn / gran) * 100;
                  return (
                    <tr key={f.categoria} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{f.categoria}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.unidades}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.tickets}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.total_mxn)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-hover">
                            <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="w-12 text-right text-[11.5px] tabular-nums text-ink-2">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}
