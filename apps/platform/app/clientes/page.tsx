"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSesion } from "../lib/sesion";
import { textoActualizado, useRefresco } from "../lib/refresco";
import { fechaCorta, fmtMxn, input } from "../lib/formato";
import type { Metricas, Tenant } from "../lib/tipos";
import { TarjetaCifra } from "../components/tarjeta-cifra";
import { PastillaEstado } from "../components/pastilla-estado";

const FILTROS = [
  ["", "Todos"],
  ["ACTIVO", "Activos"],
  ["TRIAL", "En prueba"],
  ["SUSPENDIDO", "Suspendidos"],
  ["CANCELADO", "Cancelados"],
] as const;

/**
 * Lista de clientes con las cifras globales arriba. Métricas era una pestaña entera para
 * cuatro números; aquí acompañan a la lista, que es donde se toman las decisiones.
 */
export default function ClientesPage() {
  const { api } = useSesion();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [m, setM] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("");

  const cargar = useCallback(async () => {
    try {
      const [t, met] = await Promise.all([api("/api/tenants"), api("/api/metricas")]);
      setTenants((t.tenants ?? []) as Tenant[]);
      setM(met as unknown as Metricas);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace } = useRefresco(cargar);

  const lista = (tenants ?? []).filter(
    (t) =>
      (!estado || t.estado === estado) &&
      (!q.trim() || `${t.codigo} ${t.nombre_comercial}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const cuenta = (e: string) => (tenants ?? []).filter((t) => !e || t.estado === e).length;
  const ahora = Date.now();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[18px] font-semibold tracking-tight">Clientes</h1>
        <input className={`${input} w-[280px]`} placeholder="Buscar código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
      </div>

      {m && (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <TarjetaCifra titulo="MRR" valor={fmtMxn(m.mrr)} sub="suscripciones activas" />
          <TarjetaCifra titulo="Clientes" valor={String(m.totalTenants)} sub={`${m.activos} activos · ${m.trial} en prueba`} />
          <TarjetaCifra titulo="Suspendidos / cancelados" valor={`${m.suspendidos} / ${m.cancelados}`} />
          <TarjetaCifra titulo="Folios vendidos" valor={String(m.foliosVendidos30d)} sub="últimos 30 días" />
        </div>
      )}

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-1">
        {FILTROS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setEstado(k)}
            className={["btn rounded px-2.5 py-1 text-[12.5px] font-semibold", estado === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}
          >
            {l} ({cuenta(k)})
          </button>
        ))}
      </div>

      {tenants === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
      {tenants && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sel text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                <th className="px-4 py-2.5">Código</th>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Vertical</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Fase</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-3">{tenants.length === 0 ? "Sin clientes." : "Nada con ese filtro."}</td></tr>
              )}
              {lista.map((t) => {
                const bloqueo = t.bloqueo_desde && new Date(t.bloqueo_desde).getTime() > ahora ? t.bloqueo_desde : null;
                return (
                  <tr key={t.id} className="cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-hover" onClick={() => router.push("/clientes/" + t.id)}>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{t.codigo}</td>
                    <td className="px-4 py-2.5 font-medium">{t.nombre_comercial}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.vertical_principal}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.plan?.codigo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-3">{t.onboarding?.fase ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <PastillaEstado estado={t.estado} />
                      {bloqueo && <div className="mt-0.5 text-[11px] font-semibold text-warning">bloquea el {fechaCorta(bloqueo)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-[11.5px] text-ink-3">{textoActualizado(hace)}</p>
    </div>
  );
}
