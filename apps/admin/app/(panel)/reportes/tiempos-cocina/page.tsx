"use client";
import { useCallback, useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { RangoFechas } from "../../../components/rango-fechas";
import { leerTiemposCocina, rangoUltimosDias, type FilaTiempos } from "../../../lib/reportes";
import { mensajeError } from "../../../lib/errores";

const MODO: Record<string, string> = { COMER_AQUI: "Comer aquí", PARA_LLEVAR: "Para llevar", DRIVE_THRU: "Drive-thru", MESA: "Mesa", DELIVERY_PROPIO: "Domicilio" };

/**
 * Objetivo de preparación en minutos. La vista SQL corta en 15 (tickets_cocina_bajo_15min),
 * así que ese es el umbral con el que se puede medir cumplimiento sin recalcular por ticket.
 * Cuando el objetivo sea configurable por negocio, esto sale de la config, no de una constante.
 */
const OBJETIVO_MIN = 15;

function KpiTiempo({ titulo, valor, pie, tono }: { titulo: string; valor: string; pie: string; tono: "ok" | "malo" | "neutro" }) {
  const color = tono === "ok" ? "text-success" : tono === "malo" ? "text-danger" : "";
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className={`mt-1 font-display text-[26px] font-bold tabular-nums ${color}`}>{valor}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-3">{pie}</div>
    </div>
  );
}

export default function TiemposCocinaPage() {
  const r0 = rangoUltimosDias(30);
  const [desde, setDesde] = useState(r0.desde);
  const [hasta, setHasta] = useState(r0.hasta);
  const [filas, setFilas] = useState<FilaTiempos[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setFilas(null); setError(null);
    try { setFilas(await leerTiemposCocina(d, h)); } catch (e) { setError(mensajeError(e, "Error")); }
  }, []);
  useEffect(() => { cargar(desde, hasta); }, [cargar, desde, hasta]);

  // Totales del rango, ponderados por comandas (no promedio de promedios).
  const todas = filas ?? [];
  const totalComandas = todas.reduce((s, f) => s + f.tickets, 0);
  const promedioGlobal = totalComandas > 0 ? todas.reduce((s, f) => s + f.promedio * f.tickets, 0) / totalComandas : 0;
  const p95Global = todas.reduce((m, f) => Math.max(m, f.p95), 0);
  const dentroObjetivo = todas.reduce((s, f) => s + f.bajo15, 0);
  const fueraObjetivo = totalComandas - dentroObjetivo;
  const pctBajoObjetivo = totalComandas > 0 ? (dentroObjetivo / totalComandas) * 100 : 0;

  return (
    <>
      <PageHeader titulo="Cumplimiento de tiempos de cocina" subtitulo="Qué tan rápido sale la comida vs tu objetivo. Detecta cuellos de botella en la preparación." migas={[{ label: "Reportes" }, { label: "Tiempos de cocina" }]} />
      <PageBody>
        <div className="mb-4"><RangoFechas desde={desde} hasta={hasta} onCambio={(d, h) => { setDesde(d); setHasta(h); }} /></div>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && filas.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTiempo titulo="Tiempo promedio" valor={`${promedioGlobal.toFixed(0)} min`} pie={`objetivo: ${OBJETIVO_MIN} min`} tono={promedioGlobal <= OBJETIVO_MIN ? "ok" : "malo"} />
            <KpiTiempo titulo="Percentil 95 (p95)" valor={`${p95Global.toFixed(0)} min`} pie="5% tardó más de esto" tono="neutro" />
            <KpiTiempo titulo="% bajo objetivo" valor={`${pctBajoObjetivo.toFixed(0)}%`} pie={`salió en ≤ ${OBJETIVO_MIN} min`} tono={pctBajoObjetivo >= 80 ? "ok" : "malo"} />
            <KpiTiempo titulo="Fuera de objetivo" valor={String(fueraObjetivo)} pie={`de ${totalComandas} comandas`} tono={fueraObjetivo > 0 ? "malo" : "ok"} />
          </div>
        )}
        {filas && (
          <div className="tabla-caja tabla-caja-xl overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Modo</th><th className="px-4 py-2.5 text-right">Comandas</th><th className="px-4 py-2.5 text-right">Prom. (min)</th><th className="px-4 py-2.5 text-right">p95 (min)</th><th className="px-4 py-2.5 text-right text-success">&le;15 min</th><th className="px-4 py-2.5 text-right text-warning">16-30</th><th className="px-4 py-2.5 text-right text-danger">&gt;30</th>
              </tr></thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-3">Sin datos de cocina en el rango.</td></tr>}
                {filas.map((f) => (
                  <tr key={f.modo} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{MODO[f.modo] ?? f.modo}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.tickets}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{f.promedio.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{f.p95.toFixed(0)}</td>
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
