"use client";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "../../../components/page-header";
import { fmtMxn, leerVentasPorEvento, type FilaEvento } from "../../../lib/reportes";

const TIPO: Record<string, string> = {
  FERIA: "Feria", FESTIVAL: "Festival", CONCIERTO: "Concierto", PRIVADO: "Privado", CORPORATIVO: "Corporativo", OTRO: "Otro",
};

/** B3 Foodtruck — ¿valió la pena la feria? Ventas, comisión y neto por evento. */
export default function VentasPorEventoPage() {
  const [filas, setFilas] = useState<FilaEvento[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerVentasPorEvento().then(setFilas).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  return (
    <>
      <PageHeader titulo="Ventas por evento" subtitulo="Ferias, festivales y eventos privados: ventas, comisión del organizador y neto." migas={[{ label: "Reportes" }, { label: "Eventos" }]} />
      <PageBody>
        {filas === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        {filas && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Evento</th><th className="px-4 py-2.5">Fechas</th><th className="px-4 py-2.5 text-right">Turnos</th><th className="px-4 py-2.5 text-right">Tickets</th><th className="px-4 py-2.5 text-right">Venta</th><th className="px-4 py-2.5 text-right">Comisión</th><th className="px-4 py-2.5 text-right">Neto</th>
              </tr></thead>
              <tbody>
                {filas.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                    Sin eventos aún. Al abrir turno en el POS, marca «¿Es un evento o ubicación especial?» y aparecerá aquí.
                  </td></tr>
                )}
                {filas.map((f) => (
                  <tr key={f.evento} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{f.evento}</span>
                      {f.tipo && <span className="ml-2 rounded-full bg-sel px-2 py-0.5 text-[10.5px] font-semibold text-ink-3">{TIPO[f.tipo] ?? f.tipo}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-2 tabular-nums">{f.primerDia}{f.ultimoDia !== f.primerDia ? ` – ${f.ultimoDia}` : ""}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.turnos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.tickets}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMxn(f.total)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-2 tabular-nums">{f.comision > 0 ? `− ${fmtMxn(f.comision)}` : "—"}</td>
                    <td className={["px-4 py-2.5 text-right font-bold tabular-nums", f.neto >= 0 ? "text-success" : "text-danger"].join(" ")}>{fmtMxn(f.neto)}</td>
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
