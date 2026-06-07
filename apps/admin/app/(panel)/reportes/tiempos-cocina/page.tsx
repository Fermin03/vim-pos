"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { leerTiemposCocina, rangoUltimosDias, type FilaTiempos } from "../../../lib/reportes";

const MODO: Record<string, string> = { COMER_AQUI: "Comer aquí", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Drive-thru", MESA: "Mesa", DELIVERY_PROPIO: "Domicilio" };

export default function TiemposCocinaPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaTiempos[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerTiemposCocina(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  return (
    <>
      <PageHeader titulo="Tiempos de cocina" subtitulo="Cumplimiento de preparación por modo de servicio." migas={[{ label: "Reportes" }, { label: "Tiempos de cocina" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Modo</th><th className="px-4 py-2.5 text-right">Tickets</th><th className="px-4 py-2.5 text-right">Prom. (min)</th><th className="px-4 py-2.5 text-right text-success">&lt;15 min</th><th className="px-4 py-2.5 text-right text-warning">16-30</th><th className="px-4 py-2.5 text-right text-danger">&gt;30</th>
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">Sin datos de cocina en el rango.</td></tr>}
                {filas.map((f) => (
                  <tr key={f.modo} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{MODO[f.modo] ?? f.modo}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.tickets}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{f.promedio.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right text-success tabular-nums">{f.bajo15}</td>
                    <td className="px-4 py-2.5 text-right text-warning tabular-nums">{f.entre16y30}</td>
                    <td className="px-4 py-2.5 text-right text-danger tabular-nums">{f.mayor30}</td>
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
