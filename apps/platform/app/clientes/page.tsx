"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSesion } from "../lib/sesion";
import { textoActualizado, useRefresco } from "../lib/refresco";
import { fechaCorta, fmtMxn, input, nombreFase, nombreVertical } from "../lib/formato";
import { haceMinutos } from "../lib/fechas-panel";
import type { Metricas, Tenant } from "../lib/tipos";
import { TarjetaCifra } from "../components/tarjeta-cifra";
import { PastillaEstado } from "../components/pastilla-estado";

/** Cómo están sus cajas ahora, por latido. Lo que antes obligaba a abrir cada ficha. */
function CeldaCajas({ c }: { c: Tenant["cajas"] }) {
  if (!c || c.total === 0) return <span className="text-ink-2">sin cajas</span>;
  const callada = c.calladaMin !== null;
  return (
    <div className="leading-tight">
      <div className={callada ? "font-semibold text-ink" : c.enLinea > 0 ? "font-semibold text-success" : "text-ink-2"}>
        {callada
          ? `sin señal ${haceMinutos(c.calladaMin)}`
          : c.enLinea > 0
            ? `${c.enLinea} de ${c.total} en línea`
            : "sin reportar"}
      </div>
      <div className="text-[12px] text-ink-2">
        {c.version ?? "versión anterior a 0.4.60"}
        {c.sinReportar > 0 && c.sinReportar < c.total ? ` · ${c.sinReportar} sin reportar` : ""}
      </div>
    </div>
  );
}

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[18px] font-semibold tracking-tight">Clientes</h1>
        <input className={`${input} w-full sm:w-[280px]`} placeholder="Buscar código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" autoFocus />
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
            aria-pressed={estado === k}
            className={["btn rounded px-2.5 py-1 text-[12.5px] font-semibold", estado === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}
          >
            {l} ({cuenta(k)})
          </button>
        ))}
      </div>

      {tenants === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}
      {tenants && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-sel text-left text-[12px] font-semibold uppercase tracking-wide text-ink-2">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Cajas</th>
                <th className="px-4 py-2.5">Giro</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Fase</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-2">{tenants.length === 0 ? "Sin clientes." : "Nada con ese filtro."}</td></tr>
              )}
              {lista.map((t) => {
                const bloqueo = t.bloqueo_desde && new Date(t.bloqueo_desde).getTime() > ahora ? t.bloqueo_desde : null;
                return (
                  // La fila entera abre la ficha con el mouse; el nombre es un enlace de verdad (teclado,
                  // lector de pantalla y abrir varios clientes en pestañas).
                  <tr key={t.id} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover" onClick={() => router.push("/clientes/" + t.id)}>
                    <td className="px-4 py-2.5">
                      <Link href={`/clientes/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-ink underline-offset-2 hover:underline">
                        {t.nombre_comercial}
                      </Link>
                      <div className="font-mono text-[12px] text-ink-2">{t.codigo}</div>
                    </td>
                    <td className="px-4 py-2.5"><CeldaCajas c={t.cajas} /></td>
                    <td className="px-4 py-2.5 text-ink-2">{nombreVertical(t.vertical_principal)}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.plan?.nombre ?? t.plan?.codigo ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-2">{nombreFase(t.onboarding?.fase)}</td>
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
