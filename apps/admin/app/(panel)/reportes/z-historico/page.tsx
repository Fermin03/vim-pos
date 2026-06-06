"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerZHistorico, rangoUltimosDias, type FilaZHistorico } from "../../../lib/reportes";

export default function ZHistoricoPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaZHistorico[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null);
    setError(null);
    try {
      setFilas(await leerZHistorico(d, h));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }, []);

  useEffect(() => {
    cargar(desde, hasta);
  }, [cargar, desde, hasta]);

  const totales = (filas ?? []).reduce(
    (s, f) => ({
      ventas: s.ventas + f.total_ventas,
      tickets: s.tickets + f.total_tickets,
      dif: s.dif + f.diferencia_efectivo,
    }),
    { ventas: 0, tickets: 0, dif: 0 },
  );

  function colorDif(n: number): string {
    if (Math.abs(n) < 0.01) return "text-success";
    if (n < 0) return "text-danger";
    return "text-warning";
  }

  return (
    <>
      <PageHeader
        titulo="Reporte Z histórico"
        subtitulo="Cierres de turno por día. Auditoría inmutable."
        migas={[{ label: "Reportes" }, { label: "Z histórico" }]}
      />
      <PageBody>
        <div className="mb-4">
          <RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} />
        </div>

        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Cierres</div>
                <div className="font-display mt-1 text-[22px] font-bold tabular-nums">{filas.length}</div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Total vendido</div>
                <div className="font-display mt-1 text-[22px] font-bold tabular-nums">{fmtMxn(totales.ventas)}</div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Diferencia neta</div>
                <div className={`font-display mt-1 text-[22px] font-bold tabular-nums ${colorDif(totales.dif)}`}>{fmtMxn(totales.dif)}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-4 py-2.5">Folio Z</th>
                    <th className="px-4 py-2.5">Día</th>
                    <th className="px-4 py-2.5 text-right">Tickets</th>
                    <th className="px-4 py-2.5 text-right">Vendido</th>
                    <th className="px-4 py-2.5 text-right">Propinas</th>
                    <th className="px-4 py-2.5 text-right">Esperado</th>
                    <th className="px-4 py-2.5 text-right">Declarado</th>
                    <th className="px-4 py-2.5 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-3">Sin cierres en el rango.</td></tr>
                  )}
                  {filas.map((f) => (
                    <tr key={f.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-[12px]">{f.folio_z}</td>
                      <td className="px-4 py-2.5 text-ink-2">{f.dia_contable}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.total_tickets}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtMxn(f.total_ventas)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmtMxn(f.total_propinas)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmtMxn(f.efectivo_esperado)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{fmtMxn(f.efectivo_declarado)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${colorDif(f.diferencia_efectivo)}`}>{fmtMxn(f.diferencia_efectivo)}</td>
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
