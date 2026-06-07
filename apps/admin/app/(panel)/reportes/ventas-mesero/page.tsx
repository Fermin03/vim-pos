"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerVentasPorMesero, rangoUltimosDias, type FilaMesero } from "../../../lib/reportes";

export default function VentasPorMeseroPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaMesero[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerVentasPorMesero(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  return (
    <>
      <PageHeader titulo="Ventas por mesero" subtitulo="Desempeño por mesero: tickets, venta, propinas." migas={[{ label: "Reportes" }, { label: "Ventas por mesero" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Mesero</th><th className="px-4 py-2.5 text-right">Tickets</th><th className="px-4 py-2.5 text-right">Venta</th><th className="px-4 py-2.5 text-right">Ticket prom.</th><th className="px-4 py-2.5 text-right">Propinas</th>
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">Sin datos en el rango.</td></tr>}
                {filas.map((f) => (
                  <tr key={f.clave} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{f.nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.tickets}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.total)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.promedio)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.propinas)}</td>
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
