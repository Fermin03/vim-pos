"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerVentasAppsExternas, rangoUltimosDias, type FilaAppExterna } from "../../../lib/reportes";

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  CONCILIADO_OK: { label: "Conciliado", cls: "bg-[#EAF3EE] text-success" },
  CONCILIADO_CON_DIFERENCIA: { label: "Con diferencia", cls: "bg-[#FBECEA] text-danger" },
  EN_LIQUIDACION_SIN_MATCH: { label: "Sin match", cls: "bg-[#FDF3E7] text-[#B26A00]" },
  NO_LIQUIDADO_TODAVIA: { label: "Pendiente", cls: "bg-sel text-ink-2" },
};

/** Ventas por apps de delivery (Rappi/Uber/DiDi) con su estado de conciliación. */
export default function AppsExternasPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaAppExterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerVentasAppsExternas(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  const totVenta = (filas ?? []).reduce((s, f) => s + f.totalPos, 0);
  const totComision = (filas ?? []).reduce((s, f) => s + f.comision, 0);

  return (
    <>
      <PageHeader titulo="Ventas por apps externas" subtitulo="Pedidos de Rappi, Uber Eats y DiDi: venta registrada en el POS, comisión y estado de conciliación contra la liquidación de la app." migas={[{ label: "Reportes" }, { label: "Apps externas" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <>
            {filas.length > 0 && (
              <p className="mb-3 text-[13px] text-ink-2">
                Venta por apps en el rango: <b>{fmtMxn(totVenta)}</b> · Comisiones registradas: <b>{fmtMxn(totComision)}</b>
              </p>
            )}
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Día</th><th className="px-4 py-2.5">App</th><th className="px-4 py-2.5">Folio POS</th><th className="px-4 py-2.5">Folio app</th><th className="px-4 py-2.5 text-right">Total POS</th><th className="px-4 py-2.5 text-right">Comisión</th><th className="px-4 py-2.5 text-right">Neto app</th><th className="px-4 py-2.5">Conciliación</th>
                </tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-3">Sin ventas por apps en el rango.</td></tr>}
                  {filas.map((f) => {
                    const badge = ESTADO_BADGE[f.estado] ?? { label: f.estado, cls: "bg-sel text-ink-2" };
                    return (
                      <tr key={f.ticketId} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2.5 text-ink-2">{f.dia}</td>
                        <td className="px-4 py-2.5 font-medium">{f.app}</td>
                        <td className="px-4 py-2.5">{f.folioPos ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{f.folioApp ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.totalPos)}</td>
                        <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.comision ? fmtMxn(f.comision) : "—"}</td>
                        <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.netoApp ? fmtMxn(f.netoApp) : "—"}</td>
                        <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-[11.5px] font-bold ${badge.cls}`}>{badge.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-2xl text-[12px] text-ink-3">La conciliación contra las liquidaciones de cada app se captura en <b>Conciliación apps</b>; aquí se ve el resultado por pedido.</p>
          </>
        )}
      </PageBody>
    </>
  );
}
