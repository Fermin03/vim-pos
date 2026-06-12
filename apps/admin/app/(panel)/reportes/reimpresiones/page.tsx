"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { leerReimpresionesPorCajero, rangoUltimosDias, type FilaReimpresion } from "../../../lib/reportes";

/** Antifraude: cajeros que reimprimen comandas con frecuencia (posible salida sin cobrar). */
export default function ReimpresionesPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaReimpresion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerReimpresionesPorCajero(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  return (
    <>
      <PageHeader titulo="Reimpresiones por cajero" subtitulo="Auditoría antifraude: reimpresión frecuente de comandas puede indicar salida de producto sin cobrar." migas={[{ label: "Reportes" }, { label: "Reimpresiones" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Cajero</th><th className="px-4 py-2.5 text-right">Reimpresiones</th><th className="px-4 py-2.5 text-right">Tickets distintos</th><th className="px-4 py-2.5 text-right">Reimp. por ticket</th>
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Sin reimpresiones en el rango — buena señal.</td></tr>}
                {filas.map((f) => {
                  const ratio = f.ticketsDistintos > 0 ? f.reimpresiones / f.ticketsDistintos : 0;
                  return (
                    <tr key={f.clave} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{f.cajero}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{f.reimpresiones}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.ticketsDistintos}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={["rounded px-2 py-0.5 text-[11.5px] font-bold tabular-nums", ratio >= 2 ? "bg-[#FBECEA] text-danger" : ratio > 1.2 ? "bg-[#FDF3E7] text-[#B26A00]" : "bg-sel text-ink-2"].join(" ")}>
                          {ratio.toFixed(1)}×
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 max-w-2xl text-[12px] text-ink-3">Un promedio mayor a 2 reimpresiones por ticket amerita revisar con el cajero. Las reimpresiones quedan registradas con fecha y ticket en la bitácora.</p>
      </PageBody>
    </>
  );
}
