"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";
import { leerDashboard, variacionPct, type Dashboard, type ResumenDia } from "../../lib/reportes";
import { leerEstadoOnboarding, type EstadoOnboarding } from "../../lib/onboarding";
import { listarSucursales } from "../../lib/configuracion";
import { mensajeError } from "../../lib/errores";

// Accesos rápidos del P-177: son de Reportes, no navegación genérica.
const REPORTES_RAPIDOS = [
  { href: "/reportes/consolidado", nombre: "Estado de resultados", desc: "Ventas, IVA, descuentos, comisiones" },
  { href: "/reportes/ventas-producto", nombre: "Ventas por producto", desc: "Top productos y unidades" },
  { href: "/reportes/ventas-mesero", nombre: "Ventas por mesero", desc: "Desempeño del equipo" },
  { href: "/reportes/z-historico", nombre: "Cortes Z", desc: "Histórico de cierres de turno" },
];

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat("es-MX").format(n);

function Delta({ pct, comparativo, sobreOscuro }: { pct: number | null; comparativo?: string; sobreOscuro?: boolean }) {
  if (pct === null) return comparativo ? <span className={`text-[11.5px] ${sobreOscuro ? "text-white/50" : "text-ink-3"}`}>{comparativo}</span> : null;
  const sube = pct >= 0;
  const claseChip = sobreOscuro
    ? sube ? "bg-success/25 text-[#7FD1A3]" : "bg-danger/25 text-[#E8927F]"
    : sube ? "bg-[#E8F1EC] text-success" : "bg-[#FBF1EF] text-danger";
  return (
    <>
      <span className={`inline-flex items-center gap-[3px] rounded-full px-[7px] py-0.5 text-[12.5px] font-bold ${claseChip}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          {sube ? <path d="M7 17L17 7M17 7H8M17 7v9" /> : <path d="M7 7l10 10M17 17H8M17 17V8" />}
        </svg>
        {Math.abs(pct)}%
      </span>
      {comparativo && <span className={`text-[11.5px] ${sobreOscuro ? "text-white/50" : "text-ink-3"}`}>{comparativo}</span>}
    </>
  );
}

function Kpi({
  label,
  valor,
  icono,
  pct,
  comparativo,
  primario,
}: {
  label: string;
  valor: string;
  icono: React.ReactNode;
  pct: number | null;
  comparativo?: string;
  primario?: boolean;
}) {
  return (
    <div className={`relative min-w-0 rounded-lg border p-4 lg:p-5 ${primario ? "border-ink bg-ink" : "border-line bg-surface"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`min-w-0 truncate text-[11.5px] font-semibold uppercase tracking-[0.04em] lg:text-[12px] ${primario ? "text-white/60" : "text-ink-3"}`}>{label}</span>
        <span className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded ${primario ? "bg-white/10 text-white" : "bg-hover text-ink-2"}`}>{icono}</span>
      </div>
      <div className={`mt-3 font-display text-[22px] font-bold tracking-[-0.025em] tabular-nums lg:mt-3.5 lg:text-[30px] ${primario ? "text-white" : ""}`}>{valor}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-[7px] gap-y-1">
        <Delta pct={pct} comparativo={comparativo} sobreOscuro={primario} />
      </div>
    </div>
  );
}

const ICONOS = {
  ventas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  tickets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><path d="M8 8h8M8 12h8" /></svg>,
  promedio: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>,
  propinas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4.5" /></svg>,
};

/** Gráfica de ventas por hora del día (P-177). La barra de la hora pico va en negro. */
function GraficaPorHora({ datos }: { datos: { hora: number; total: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const pico = datos.reduce((a, b) => (b.total > a.total ? b : a), datos[0]!);
  const promedio = datos.reduce((a, d) => a + d.total, 0) / datos.length;

  return (
    <>
      {/* En móvil la gráfica se desliza en horizontal: 24 barras en 343px serían ilegibles. */}
      <div className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-x-visible lg:px-0">
      <div className="grafica-min flex h-[200px] items-end gap-1.5 pt-4 lg:h-[240px]">
        {datos.map((d) => {
          const esPico = d.hora === pico.hora;
          return (
            <div key={d.hora} className="group flex h-full flex-1 cursor-default flex-col items-center justify-end gap-[7px]">
              <div className="relative flex w-full flex-1 items-end justify-center">
                <div
                  className={`w-full max-w-[26px] rounded-t-[3px] transition-colors group-hover:bg-accent ${esPico ? "bg-ink" : "bg-line-strong"}`}
                  style={{ height: `${Math.max(2, (d.total / max) * 100)}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {d.hora}:00 · {fmt(d.total)}
                </span>
              </div>
              <div className="text-[10px] font-semibold text-ink-3">{d.hora}</div>
            </div>
          );
        })}
      </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
        <div className="flex items-center gap-[7px] text-[12px] text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-ink" />
          Hora pico <span className="font-semibold">{pico.hora}:00 ({fmt(pico.total)})</span>
        </div>
        <div className="flex items-center gap-[7px] text-[12px] text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-line-strong" />
          Promedio/hora <span className="font-semibold">{fmt(Math.round(promedio * 100) / 100)}</span>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const perfil = usePerfil();
  const primer = (perfil?.nombre ?? "").split(/\s+/)[0] || "";
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onb, setOnb] = useState<EstadoOnboarding | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);

  useEffect(() => {
    leerDashboard().then(setData).catch((e) => setError(mensajeError(e, "No se pudo cargar")));
    leerEstadoOnboarding().then(setOnb).catch(() => {});
    listarSucursales()
      .then((s) => setSucursal(s.length === 1 ? s[0]!.nombre : null))
      .catch(() => {});
  }, []);

  const mostrarOnboarding = onb && onb.fase !== "GO_LIVE" && !onb.listoParaVender;

  const hoy: ResumenDia | undefined = data?.hoy;
  const ayer = data?.ayer ?? null;
  const sinVentas = data !== null && (hoy?.ticketsCompletados ?? 0) === 0;
  // La fecha del DÍA CONTABLE que se está mostrando, no la del reloj del navegador. Antes se
  // pintaba `new Date()` junto a cifras que podían ser de días atrás: el rótulo decía "hoy" y los
  // números eran del 17. Además el día contable cierra a las 3 am, así que a la 1 de la mañana
  // esto sigue diciendo —correctamente— la fecha de ayer.
  const fmtDia = (iso: string) => {
    const p = iso.split("-").map(Number);
    // Se construye la fecha en hora LOCAL a partir de las partes, no con `new Date(iso)`: esa
    // ruta interpreta "2026-08-19" como medianoche UTC y en México lo pinta como el día 18.
    const fecha = new Date(p[0] ?? 1970, (p[1] ?? 1) - 1, p[2] ?? 1);
    return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(fecha);
  };
  const fechaCorta = data ? fmtDia(data.dia) : "—";
  const ultimaVenta = data?.ultimoDiaConVentas ?? null;

  return (
    <>
      <PageHeader
        titulo={`Hola, ${primer}`}
        subtitulo={sucursal ? `Esto es lo que pasa hoy en ${sucursal}` : "Esto es lo que pasa hoy en tu negocio"}
        right={
          <span className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface px-3.5 py-[9px] text-[13px] font-semibold">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[15px] w-[15px] text-ink-3"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
            Hoy · {fechaCorta}
            <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              En vivo
            </span>
          </span>
        }
      />
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
            {/* Cuándo fue la última vez que sí hubo ventas. Un cero puede significar "todavía no
                abrimos" o "la caja lleva días sin subir nada", y son cosas muy distintas: sin este
                dato, la segunda pasa desapercibida hasta que las cuentas no cuadran. */}
            {ultimaVenta && ultimaVenta !== data?.dia && (
              <p className="mt-3 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[13px] font-medium text-warning">
                La última venta registrada es del {fmtDia(ultimaVenta)}. Si el negocio ha vendido
                desde entonces, la caja no está enviando sus ventas.
              </p>
            )}
          </div>
        )}

        {hoy && !sinVentas && (
          <>
            {/* KPIs con variación vs. ayer (P-177) */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                primario
                label="Ventas hoy"
                valor={fmt(hoy.totalNeto)}
                icono={ICONOS.ventas}
                pct={variacionPct(hoy.totalNeto, ayer?.totalNeto)}
                comparativo={ayer ? `vs ayer (${fmt(ayer.totalNeto)})` : "sin día previo"}
              />
              <Kpi
                label="Tickets"
                valor={fmtInt(hoy.ticketsCompletados)}
                icono={ICONOS.tickets}
                pct={variacionPct(hoy.ticketsCompletados, ayer?.ticketsCompletados)}
                comparativo={ayer ? `vs ayer (${fmtInt(ayer.ticketsCompletados)})` : "sin día previo"}
              />
              <Kpi
                label="Ticket promedio"
                valor={fmt(hoy.ticketPromedio)}
                icono={ICONOS.promedio}
                pct={variacionPct(hoy.ticketPromedio, ayer?.ticketPromedio)}
                comparativo={ayer ? `vs ayer (${fmt(ayer.ticketPromedio)})` : "sin día previo"}
              />
              <Kpi
                label="Propinas"
                valor={fmt(hoy.propinas)}
                icono={ICONOS.propinas}
                pct={variacionPct(hoy.propinas, ayer?.propinas)}
                comparativo={ayer ? `vs ayer (${fmt(ayer.propinas)})` : "sin día previo"}
              />
            </div>

            {/* Gráfica por hora + Top productos al lado (P-177: 1fr / 340px) */}
            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                  <div className="font-display text-[15px] font-semibold">
                    Ventas por hora
                    <div className="mt-0.5 text-[12px] font-normal text-ink-3">Distribución del día contable</div>
                  </div>
                </div>
                <div className="p-5">
                  {(data?.ventasPorHora.length ?? 0) > 0 ? (
                    <GraficaPorHora datos={data!.ventasPorHora} />
                  ) : (
                    <p className="py-12 text-center text-[13px] text-ink-3">Sin ventas con hora registrada hoy.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-display text-[15px] font-semibold">Top productos hoy</div>
                    <Link href="/reportes/ventas-producto" className="text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink">Ver todos</Link>
                  </div>
                </div>
                <div className="px-5 py-2">
                  {(data?.topProductos.length ?? 0) > 0 ? (
                    <div className="flex flex-col">
                      {data!.topProductos.map((p, i) => {
                        const maxU = Math.max(1, ...data!.topProductos.map((t) => t.unidades));
                        return (
                          <div key={p.nombre} className="flex items-center gap-[11px] border-b border-line py-[11px] last:border-b-0">
                            <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold ${i === 0 ? "bg-ink text-white" : "bg-hover text-ink-2"}`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold">{p.nombre}</div>
                              <div className="mt-[5px] h-1 overflow-hidden rounded-full bg-hover">
                                <span className="block h-full rounded-full bg-ink-3" style={{ width: `${(p.unidades / maxU) * 100}%` }} />
                              </div>
                            </div>
                            <span className="flex-shrink-0 text-[13px] font-bold tabular-nums">{fmtInt(p.unidades)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-10 text-center text-[13px] text-ink-3">Sin productos vendidos hoy.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Accesos rápidos a reportes (P-177) */}
        <h3 className="mb-3 font-display text-base font-semibold">Reportes</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {REPORTES_RAPIDOS.map((a) => (
            <Link key={a.href} href={a.href} className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink hover:bg-sel">
              <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded bg-hover text-ink-2 transition-colors group-hover:bg-surface group-hover:text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
              </div>
              <div className="text-[13.5px] font-semibold">{a.nombre}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{a.desc}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
