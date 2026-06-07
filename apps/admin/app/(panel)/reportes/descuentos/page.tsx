"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { fmtMxn, leerDescuentosPorUsuario, rangoUltimosDias, type FilaDescuento } from "../../../lib/reportes";

export default function DescuentosPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaDescuento[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerDescuentosPorUsuario(d, h)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  const totalGeneral = (filas ?? []).reduce((s, f) => s + f.total, 0);

  return (
    <>
      <PageHeader titulo="Descuentos por usuario" subtitulo="Control de descuentos y cortesías otorgados (auditoría)." migas={[{ label: "Reportes" }, { label: "Descuentos" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <>
            {filas.length > 0 && <p className="mb-3 text-[13px] text-ink-2">Total descontado en el rango: <b>{fmtMxn(totalGeneral)}</b></p>}
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5">Usuario</th><th className="px-4 py-2.5 text-right">Descuentos</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Promedio</th>
                </tr></thead>
                <tbody>
                  {filas.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-3">Sin descuentos en el rango.</td></tr>}
                  {filas.map((f) => (
                    <tr key={f.clave} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{f.usuario}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{f.cantidad}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.total)}</td>
                      <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{fmtMxn(f.promedio)}</td>
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
