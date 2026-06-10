"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, rangoUltimosDias } from "../../../lib/reportes";
import { leerConsolidadoPorSucursal, type Consolidado } from "../../../lib/consolidado";

/** B5 Enterprise — reporteo central: comparativo consolidado por sucursal. */
export default function ConsolidadoPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [datos, setDatos] = useState<Consolidado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setDatos(null); setError(null);
    try { setDatos(await leerConsolidadoPorSucursal(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  return (
    <>
      <PageHeader titulo="Consolidado por sucursal" subtitulo="Comparativo central de la cadena: venta, tickets y participación de cada sucursal." migas={[{ label: "Reportes" }, { label: "Consolidado" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {datos === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {datos && (
          <>
            {/* KPIs del consolidado */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "Venta consolidada", valor: fmtMxn(datos.total.venta) },
                { label: "Tickets", valor: String(datos.total.tickets) },
                { label: "Ticket promedio", valor: fmtMxn(datos.total.ticketPromedio) },
                { label: "Propinas", valor: fmtMxn(datos.total.propinas) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{k.label}</div>
                  <div className="mt-1 font-display text-[22px] font-bold tabular-nums">{k.valor}</div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Sucursal</th><th className="px-4 py-2.5 text-right">Tickets</th><th className="px-4 py-2.5 text-right">Venta</th><th className="px-4 py-2.5 text-right">Ticket prom.</th><th className="px-4 py-2.5 text-right">Propinas</th><th className="px-4 py-2.5 text-right">Descuentos</th><th className="px-4 py-2.5 text-right">Devoluciones</th><th className="px-4 py-2.5 text-right">Participación</th>
                </tr></thead>
                <tbody>
                  {datos.filas.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-3">Sin ventas en el rango.</td></tr>}
                  {datos.filas.map((f) => (
                    <tr key={f.sucursalId} className="border-b border-line">
                      <td className="px-4 py-2.5 font-medium">{f.sucursal}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.tickets}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.venta)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.ticketPromedio)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.propinas)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.descuentos)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.devoluciones)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sel">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, f.participacionPct)}%` }} />
                          </div>
                          <span className="w-12 text-right font-semibold tabular-nums">{f.participacionPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {datos.filas.length > 0 && (
                    <tr className="bg-sel font-bold">
                      <td className="px-4 py-2.5">Total cadena</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{datos.total.tickets}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMxn(datos.total.venta)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMxn(datos.total.ticketPromedio)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMxn(datos.total.propinas)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMxn(datos.total.descuentos)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMxn(datos.total.devoluciones)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">100%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
