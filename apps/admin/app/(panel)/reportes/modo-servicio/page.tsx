"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerVentasPorModo, rangoUltimosDias, type FilaModo } from "../../../lib/reportes";

const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comer aquí",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Drive-thru",
};

export default function VentasPorModoServicioPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaModo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerVentasPorModo(d, h)); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  return (
    <>
      <PageHeader
        titulo="Ventas por tipo de servicio"
        subtitulo="Mix entre Comer aquí, Para llevar y Drive-thru."
        migas={[{ label: "Reportes" }, { label: "Tipo de servicio" }]}
      />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && filas.length === 0 && <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-3">Sin ventas en el rango.</p>}
        {filas && filas.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {filas.map((f) => (
              <div key={f.modo} className="rounded-lg border border-line bg-surface p-5">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{MODO_LABEL[f.modo] ?? f.modo}</div>
                <div className="font-display mt-2 text-[26px] font-bold tabular-nums">{fmtMxn(f.total_mxn)}</div>
                <div className="mt-1 text-[12.5px] text-ink-2 tabular-nums">{f.tickets} tickets · {f.porcentaje}%</div>
                <div className="mt-3 h-2 rounded-full bg-hover">
                  <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.min(100, f.porcentaje)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
