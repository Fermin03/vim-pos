"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";
import { leerDashboard, type Dashboard } from "../../lib/reportes";
import { leerEstadoOnboarding, type EstadoOnboarding } from "../../lib/onboarding";

const ACCESOS = [
  { href: "/catalogo", nombre: "Catálogo", desc: "Productos, categorías y modificadores" },
  { href: "/usuarios", nombre: "Usuarios", desc: "Empleados, roles y PIN" },
  { href: "/reportes", nombre: "Reportes", desc: "Ventas, cortes Z, desempeño" },
  { href: "/configuracion", nombre: "Configuración", desc: "Negocio, fiscal, sucursales" },
];

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat("es-MX").format(n);

function Kpi({ label, valor, sub, acento }: { label: string; valor: string; sub?: string; acento?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-3">{label}</div>
      <div className={`mt-1 font-display text-[26px] font-bold tabular-nums ${acento ? "text-accent" : ""}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const perfil = usePerfil();
  const primer = (perfil?.nombre ?? "").split(/\s+/)[0] || "";
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onb, setOnb] = useState<EstadoOnboarding | null>(null);

  useEffect(() => {
    leerDashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar"));
    leerEstadoOnboarding().then(setOnb).catch(() => {});
  }, []);

  const mostrarOnboarding = onb && onb.fase !== "GO_LIVE" && !onb.listoParaVender;

  const hoy = data?.hoy;
  const sinVentas = data !== null && (hoy?.ticketsCompletados ?? 0) === 0;
  const maxTend = Math.max(1, ...(data?.tendencia ?? []).map((t) => t.total));

  return (
    <>
      <PageHeader titulo={`Hola, ${primer}`} subtitulo="Resumen de tu negocio" />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {mostrarOnboarding && onb && (
          <Link href="/bienvenida" className="mb-6 flex items-center gap-4 rounded-lg border border-[#E8DCC0] bg-[#F6EEDD] p-4 transition hover:border-accent">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold">Termina de configurar tu negocio</div>
              <div className="text-[12.5px] text-ink-2">{onb.obligatoriosHechos} de {onb.obligatoriosTotal} pasos · te faltan {onb.obligatoriosTotal - onb.obligatoriosHechos} para empezar a vender.</div>
            </div>
            <span className="text-[13px] font-semibold text-accent">Continuar →</span>
          </Link>
        )}

        {data === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}

        {sinVentas && (
          <div className="mb-6 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-display text-base font-semibold">Aún no hay ventas registradas</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              Las métricas en vivo aparecerán en cuanto el POS registre la primera venta del día.
              Mientras, administra tu negocio desde los accesos de abajo.
            </p>
          </div>
        )}

        {hoy && !sinVentas && (
          <>
            {/* KPIs del día */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Ventas del día" valor={fmt(hoy.totalNeto)} sub={`${fmtInt(hoy.ticketsCompletados)} tickets`} acento />
              <Kpi label="Ticket promedio" valor={fmt(hoy.ticketPromedio)} />
              <Kpi label="Propinas" valor={fmt(hoy.propinas)} />
              <Kpi label="Devoluciones" valor={fmt(hoy.devoluciones)} sub={hoy.ticketsCancelados > 0 ? `${hoy.ticketsCancelados} cancelados` : undefined} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Tendencia 7 días */}
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="mb-3 text-[13px] font-semibold">Ventas · últimos 7 días</div>
                <div className="flex h-32 items-end gap-2">
                  {(data?.tendencia ?? []).map((t) => (
                    <div key={t.dia} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-accent/85 transition-all"
                          style={{ height: `${Math.max(4, (t.total / maxTend) * 100)}%` }}
                          title={fmt(t.total)}
                        />
                      </div>
                      <div className="text-[10px] text-ink-3">{t.dia.slice(5)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mix por modo de servicio */}
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="mb-3 text-[13px] font-semibold">Tickets por modo · hoy</div>
                <div className="flex flex-col gap-2.5">
                  {[
                    { l: "Comer aquí", v: hoy.comerAqui },
                    { l: "Para llevar", v: hoy.paraLlevar },
                    { l: "Domicilio", v: hoy.delivery },
                    { l: "Apps", v: hoy.apps },
                  ].map((m) => {
                    const tot = hoy.comerAqui + hoy.paraLlevar + hoy.delivery + hoy.apps || 1;
                    return (
                      <div key={m.l}>
                        <div className="mb-0.5 flex justify-between text-[12.5px]">
                          <span className="text-ink-2">{m.l}</span>
                          <span className="font-semibold tabular-nums">{fmtInt(m.v)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-hover">
                          <div className="h-full rounded-full bg-ink/75" style={{ width: `${(m.v / tot) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Top productos */}
            {(data?.topProductos.length ?? 0) > 0 && (
              <div className="mb-6 rounded-lg border border-line bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[13px] font-semibold">Más vendidos · hoy</div>
                  <Link href="/reportes/ventas-producto" className="text-[12px] font-semibold text-ink-3 hover:text-ink">Ver todos</Link>
                </div>
                <div className="flex flex-col divide-y divide-line">
                  {data?.topProductos.map((p, i) => (
                    <div key={p.nombre} className="flex items-center gap-3 py-2">
                      <span className="font-display w-5 text-[13px] font-bold text-ink-3">{i + 1}</span>
                      <span className="flex-1 truncate text-[13.5px]">{p.nombre}</span>
                      <span className="text-[12.5px] text-ink-3">{fmtInt(p.unidades)} u</span>
                      <span className="w-24 text-right text-[13.5px] font-semibold tabular-nums">{fmt(p.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Accesos rápidos */}
        <h3 className="mb-3 font-display text-base font-semibold">Accesos</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ACCESOS.map((a) => (
            <Link key={a.href} href={a.href} className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink hover:bg-sel">
              <div className="text-[13.5px] font-semibold">{a.nombre}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{a.desc}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
