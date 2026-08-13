"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import {
  leerReporteX,
  leerEstadisticasTurno,
  type ReporteXResumen,
  type EstadisticasTurno,
} from "../lib/cierre";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta de débito",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TRANSFERENCIA: "Transferencia",
  VALE: "Vale",
  APP_RAPPI: "Rappi",
  APP_UBER: "Uber Eats",
  APP_DIDI: "DiDi Food",
};

const MODO_LABEL: Record<string, string> = {
  COMER_AQUI: "Comedor",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Pick-up",
  DELIVERY_PROPIO: "Domicilio",
};

type Filtro = "TODO" | "MODO" | "PAGO";

/**
 * Monitor de ventas del turno abierto. Lectura pura: no cierra nada ni mueve dinero, así que
 * NO pide PIN — un cajero puede ver cómo va su propio turno.
 *
 * Reusa `reporte_x` (el mismo RPC del corte intermedio) y las estadísticas por modo del cierre:
 * si el monitor y el corte Z salieran de fuentes distintas, tarde o temprano mostrarían cifras
 * distintas del mismo turno y nadie sabría cuál creer.
 */
export function PantallaMonitorVentas({
  token,
  caja,
  turno,
  onSalir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  onSalir: () => void;
}) {
  const [x, setX] = useState<ReporteXResumen | null>(null);
  const [stats, setStats] = useState<EstadisticasTurno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODO");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [rx, st] = await Promise.all([
        leerReporteX(token, turno.id),
        leerEstadisticasTurno(token, turno.id),
      ]);
      setX(rx);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las ventas");
    } finally {
      setCargando(false);
    }
  }, [token, turno.id]);

  useEffect(() => {
    cargar();
    // El turno sigue vendiendo mientras el monitor está abierto: refresca solo.
    const id = setInterval(cargar, 20000);
    return () => clearInterval(id);
  }, [cargar]);

  return (
    <main className="flex h-screen flex-col bg-bg">
      <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-6">
        <div>
          <h1 className="font-display text-[19px] font-semibold tracking-tight">Monitor de ventas</h1>
          <p className="text-[12.5px] text-ink-3">
            {caja.nombre} · Turno {turno.codigo_turno}
            {x?.fechaApertura ? ` · desde las ${new Date(x.fechaApertura).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
          </p>
        </div>
        <Button variant="ghost" onClick={onSalir}>Volver</Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {cargando && !x && <p className="text-sm text-ink-3">Cargando ventas…</p>}
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}

        {x && stats && (
          <div className="mx-auto max-w-4xl">
            {/* Titular: lo que se vendió en el turno */}
            <div className="mb-5 rounded-xl border border-line bg-ink p-6 text-white">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-white/60">Venta del turno</div>
              <div className="mt-1.5 font-display text-[44px] font-bold leading-none tabular-nums">{fmtMxn(x.ventaNeta)}</div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/70">
                <span><b className="font-semibold text-white">{x.ticketsPagados}</b> tickets cobrados</span>
                <span>Ticket promedio <b className="font-semibold text-white">{fmtMxn(stats.ticketPromedio)}</b></span>
                {x.propinaTotal > 0 && <span>Propinas <b className="font-semibold text-white">{fmtMxn(x.propinaTotal)}</b></span>}
              </div>
            </div>

            {/* Cifras que el cajero necesita de un vistazo */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tarjeta titulo="Efectivo esperado" valor={fmtMxn(x.efectivoEsperado)} pie={`fondo ${fmtMxn(x.fondoApertura)}`} destacar />
              <Tarjeta titulo="IVA" valor={fmtMxn(x.iva)} pie="incluido en la venta" />
              <Tarjeta titulo="Descuentos" valor={fmtMxn(x.descuentos)} pie={`${stats.cuentasConDescuento} cuenta(s)`} alerta={x.descuentos > 0} />
              <Tarjeta titulo="Devoluciones" valor={fmtMxn(x.devoluciones)} pie={`${stats.cuentasCanceladas} cancelada(s)`} alerta={x.devoluciones > 0 || stats.cuentasCanceladas > 0} />
            </div>

            {/* Filtros */}
            <div className="mb-3 inline-flex gap-0.5 rounded-lg border border-line bg-hover p-[3px]">
              {([
                { v: "TODO", l: "Resumen" },
                { v: "PAGO", l: "Por forma de pago" },
                { v: "MODO", l: "Por tipo de servicio" },
              ] as { v: Filtro; l: string }[]).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setFiltro(t.v)}
                  className={["rounded-md px-4 py-2 text-[13.5px] font-semibold transition", filtro === t.v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"].join(" ")}
                >
                  {t.l}
                </button>
              ))}
            </div>

            {(filtro === "TODO" || filtro === "PAGO") && (
              <Bloque titulo="Cobrado por forma de pago">
                {x.pagosPorMetodo.length === 0 ? (
                  <Vacio texto="Todavía no hay cobros en este turno." />
                ) : (
                  x.pagosPorMetodo.map((p) => (
                    <Fila
                      key={p.metodo}
                      etiqueta={METODO_LABEL[p.metodo] ?? p.metodo}
                      detalle={`${p.cantidad} cobro${p.cantidad === 1 ? "" : "s"}`}
                      valor={fmtMxn(p.total)}
                      pct={x.ventaNeta > 0 ? (p.total / x.ventaNeta) * 100 : 0}
                    />
                  ))
                )}
              </Bloque>
            )}

            {(filtro === "TODO" || filtro === "MODO") && (
              <Bloque titulo="Venta por tipo de servicio">
                {stats.ventaPorModoServicio.length === 0 ? (
                  <Vacio texto="Todavía no hay ventas en este turno." />
                ) : (
                  stats.ventaPorModoServicio.map((m) => (
                    <Fila
                      key={m.modo}
                      etiqueta={MODO_LABEL[m.modo] ?? m.modo}
                      detalle={`${m.cantidad} ticket${m.cantidad === 1 ? "" : "s"}`}
                      valor={fmtMxn(m.total)}
                      pct={m.porcentaje}
                    />
                  ))
                )}
              </Bloque>
            )}

            {filtro === "TODO" && (stats.folioInicial || stats.folioFinal) && (
              <p className="mt-4 text-[12.5px] text-ink-3">
                Folios del turno: <b className="text-ink-2">{stats.folioInicial ?? "—"}</b> → <b className="text-ink-2">{stats.folioFinal ?? "—"}</b>
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Tarjeta({ titulo, valor, pie, destacar, alerta }: { titulo: string; valor: string; pie?: string; destacar?: boolean; alerta?: boolean }) {
  return (
    <div className={["rounded-lg border bg-surface p-4", destacar ? "border-ink" : "border-line"].join(" ")}>
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className={["mt-1 font-display text-[24px] font-bold tabular-nums", alerta ? "text-warning" : ""].join(" ")}>{valor}</div>
      {pie && <div className="mt-0.5 text-[11.5px] text-ink-3">{pie}</div>}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="border-b border-line bg-sel px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-ink-3">{titulo}</h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function Fila({ etiqueta, detalle, valor, pct }: { etiqueta: string; detalle: string; valor: string; pct: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{etiqueta}</div>
        <div className="text-[12px] text-ink-3">{detalle}</div>
      </div>
      <div className="hidden w-40 sm:block">
        <div className="h-2 overflow-hidden rounded-full bg-hover">
          <div className="h-full rounded-full bg-ink/75" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      </div>
      <div className="w-24 text-right">
        <div className="font-display text-[15px] font-bold tabular-nums">{valor}</div>
        <div className="text-[11.5px] text-ink-3 tabular-nums">{pct.toFixed(0)}%</div>
      </div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-4 py-6 text-center text-[13px] text-ink-3">{texto}</p>;
}
