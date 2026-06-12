"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { leerNoShows, rangoUltimosDias, type FilaNoShow } from "../../../lib/reportes";

/** Reservaciones: cuánta gente reserva y no llega (no-show) por día. */
export default function NoShowsPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaNoShow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerNoShows(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  const tot = (filas ?? []).reduce(
    (a, f) => ({ reservas: a.reservas + f.total, noShows: a.noShows + f.noShows, comensales: a.comensales + f.comensalesPerdidos }),
    { reservas: 0, noShows: 0, comensales: 0 },
  );

  return (
    <>
      <PageHeader titulo="No-shows de reservaciones" subtitulo="Reservas que no llegaron: tasa diaria y comensales perdidos." migas={[{ label: "Reportes" }, { label: "No-shows" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <>
            {filas.length > 0 && (
              <p className="mb-3 text-[13px] text-ink-2">
                {tot.reservas} reservas en el rango · <b>{tot.noShows} no-shows</b> · {tot.comensales} comensales perdidos
              </p>
            )}
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Día</th><th className="px-4 py-2.5 text-right">Reservas</th><th className="px-4 py-2.5 text-right">Llegaron</th><th className="px-4 py-2.5 text-right">Canceladas</th><th className="px-4 py-2.5 text-right">No-shows</th><th className="px-4 py-2.5 text-right">Tasa</th><th className="px-4 py-2.5 text-right">Comensales perdidos</th>
                </tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-3">Sin reservaciones en el rango.</td></tr>}
                  {filas.map((f) => (
                    <tr key={f.dia} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{f.dia}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.total}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.llegaron + f.terminadas}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.canceladas}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{f.noShows}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={["rounded px-2 py-0.5 text-[11.5px] font-bold tabular-nums", f.tasaPct >= 20 ? "bg-[#FBECEA] text-danger" : f.tasaPct >= 10 ? "bg-[#FDF3E7] text-[#B26A00]" : "bg-sel text-ink-2"].join(" ")}>
                          {f.tasaPct}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.comensalesPerdidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
