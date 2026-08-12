"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerZHistorico, rangoUltimosDias, type FilaZHistorico } from "../../../lib/reportes";
import { mensajeError } from "../../../lib/errores";

export default function ZHistoricoPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaZHistorico[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloDiferencia, setSoloDiferencia] = useState(false);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null);
    setError(null);
    try {
      setFilas(await leerZHistorico(d, h));
    } catch (e) {
      setError(mensajeError(e, "Error al cargar"));
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
  // "Con faltante" = diferencia negativa: falta efectivo en caja, que es lo que se audita.
  const conFaltante = (filas ?? []).filter((f) => f.diferencia_efectivo < -0.01).length;
  const dias = new Set((filas ?? []).map((f) => f.dia_contable)).size;

  function colorDif(n: number): string {
    if (Math.abs(n) < 0.01) return "text-success";
    if (n < 0) return "text-danger";
    return "text-warning";
  }

  const visibles = (filas ?? []).filter((f) => (soloDiferencia ? Math.abs(f.diferencia_efectivo) >= 0.01 : true));

  return (
    <>
      <PageHeader
        titulo="Cortes Z históricos"
        subtitulo="Cada cierre de turno genera un corte Z. Revisa los totales y diferencias de efectivo de tu operación."
        migas={[{ label: "Reportes" }, { label: "Cortes Z" }]}
      />
      <PageBody>
        <div className="mb-4">
          <RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} />
        </div>

        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Cortes en el período</div>
                <div className="font-display mt-1 text-[22px] font-bold tabular-nums">{filas.length}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {dias > 0 ? `${(filas.length / dias).toFixed(1).replace(/\.0$/, "")} turno${filas.length / dias === 1 ? "" : "s"} por día` : "sin cierres"}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Total acumulado</div>
                <div className="font-display mt-1 text-[22px] font-bold tabular-nums">{fmtMxn(totales.ventas)}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">ventas brutas</div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Diferencia acumulada</div>
                <div className={`font-display mt-1 text-[22px] font-bold tabular-nums ${colorDif(totales.dif)}`}>{fmtMxn(totales.dif)}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">
                  {Math.abs(totales.dif) < 0.01 ? "sin diferencia" : totales.dif < 0 ? "faltante neto" : "sobrante neto"}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Cortes con faltante</div>
                <div className={`font-display mt-1 text-[22px] font-bold tabular-nums ${conFaltante > 0 ? "text-danger" : ""}`}>
                  {conFaltante} de {filas.length}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{conFaltante > 0 ? "requieren revisión" : "todo cuadrado"}</div>
              </div>
            </div>

            <div className="mb-3 inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
              {[
                { v: false, l: "Todos" },
                { v: true, l: "Con diferencia" },
              ].map((t) => (
                <button
                  key={String(t.v)}
                  type="button"
                  onClick={() => setSoloDiferencia(t.v)}
                  className={["rounded-[4px] px-3 py-1.5 text-[12.5px] font-semibold transition", soloDiferencia === t.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"].join(" ")}
                >
                  {t.l}
                </button>
              ))}
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
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center">
                        <p className="text-[14px] font-semibold text-ink-2">Sin resultados</p>
                        <p className="mt-1 text-[12.5px] text-ink-3">
                          {soloDiferencia && filas.length > 0 ? "Ningún corte del período tiene diferencia de efectivo." : "No hay cortes Z en el rango elegido."}
                        </p>
                      </td>
                    </tr>
                  )}
                  {visibles.map((f) => (
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
              <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
                Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{filas.length}</b> cortes
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
