"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { type Empleado } from "../lib/supabase";
import { listarCuentas, labelModoCuenta, type CuentaCerrada, type FiltroCuentas } from "../lib/consulta-cuentas";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { type DatosTicketImpresion } from "../lib/print/tipos";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Consulta de cuentas — historial de cuentas cerradas (PAGADO) y canceladas. Lista + detalle
 * (productos, forma de pago, totales) + reimpresión. Acciones de cancelar/reabrir/cambiar pago
 * llegan en fases siguientes (via onCancelarFolio, etc.).
 */
export function PantallaConsultaCuentas({
  token,
  caja,
  turno,
  empleado,
  onSalir,
  onReimprimir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onSalir: () => void;
  onReimprimir: (ticketId: string) => Promise<void>;
}) {
  const [modoFiltro, setModoFiltro] = useState<"turno" | "fechas">("turno");
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [cuentas, setCuentas] = useState<CuentaCerrada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DatosTicketImpresion | null>(null);
  const [cargandoDet, setCargandoDet] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const filtro: FiltroCuentas = modoFiltro === "turno"
        ? { tipo: "turno", turnoId: turno.id }
        : { tipo: "fechas", sucursalId: caja.sucursal_id, desde: `${desde}T00:00:00`, hasta: `${hasta}T23:59:59` };
      const cs = await listarCuentas(token, filtro);
      setCuentas(cs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las cuentas");
    }
  }, [token, modoFiltro, turno.id, caja.sucursal_id, desde, hasta]);

  useEffect(() => { recargar(); }, [recargar]);

  const seleccionar = useCallback(async (ticketId: string) => {
    setSel(ticketId);
    setDetalle(null);
    setCargandoDet(true);
    try {
      const d = await leerTicketParaImpresion(ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
      setDetalle(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el detalle");
    } finally {
      setCargandoDet(false);
    }
  }, [token, empleado.nombre, caja.nombre]);

  const reimprimir = useCallback(async () => {
    if (!sel) return;
    setImprimiendo(true);
    try { await onReimprimir(sel); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo reimprimir"); } finally { setImprimiendo(false); }
  }, [sel, onReimprimir]);

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Encabezado */}
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Cuentas · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">{cuentas?.length ?? 0} cuentas</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line-strong p-0.5">
            <button type="button" onClick={() => setModoFiltro("turno")} className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition ${modoFiltro === "turno" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>Turno actual</button>
            <button type="button" onClick={() => setModoFiltro("fechas")} className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition ${modoFiltro === "fechas" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>Por fechas</button>
          </div>
          {modoFiltro === "fechas" && (
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded border border-line-strong px-2 text-ink" />
              <span className="text-ink-3">a</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 rounded border border-line-strong px-2 text-ink" />
            </div>
          )}
          <button type="button" onClick={recargar} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>
            Actualizar
          </button>
          <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>}

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <div className="flex w-[420px] flex-shrink-0 flex-col border-r border-line">
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-line px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">
            <span>Folio · Fecha</span><span>Total</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cuentas === null && <p className="p-6 text-center text-[13px] text-ink-3">Cargando…</p>}
            {cuentas !== null && cuentas.length === 0 && <p className="p-6 text-center text-[13px] text-ink-3">Sin cuentas en este filtro.</p>}
            {cuentas?.map((c) => (
              <button
                key={c.ticketId}
                type="button"
                onClick={() => seleccionar(c.ticketId)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 border-b border-line px-4 py-2.5 text-left transition ${sel === c.ticketId ? "bg-sel" : "hover:bg-hover"}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-[14px] font-bold tabular-nums">{c.folio ?? c.ticketId.slice(-6)}</span>
                    {c.estado === "CANCELADO" && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold text-danger">Cancelada</span>}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-3">{fechaCorta(c.fechaIso)} · {labelModoCuenta(c.modo)}{c.cliente ? ` · ${c.cliente}` : ""}</span>
                </span>
                <span className={`font-display text-[14px] font-bold tabular-nums ${c.estado === "CANCELADO" ? "text-ink-3 line-through" : "text-ink"}`}>{fmtMxn(c.total)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {!sel && <div className="flex flex-1 items-center justify-center text-center text-[13px] text-ink-3">Elige una cuenta de la lista para ver su detalle.</div>}
          {sel && cargandoDet && <div className="flex flex-1 items-center justify-center text-center text-ink-3">Cargando detalle…</div>}
          {sel && detalle && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Encabezado — fijo */}
              <div className="flex flex-shrink-0 items-start justify-between">
                <div>
                  <div className="font-display text-[22px] font-bold tabular-nums">{detalle.meta.folio}</div>
                  <div className="text-[12.5px] text-ink-3">{fechaCorta(detalle.meta.fechaIso)} · {labelModoCuenta(detalle.meta.modoServicio)} · Cajero: {detalle.meta.cajero}</div>
                </div>
                <button
                  type="button"
                  disabled={imprimiendo}
                  onClick={reimprimir}
                  className="flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-60"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
                  {imprimiendo ? "Imprimiendo…" : "Reimprimir"}
                </button>
              </div>

              {/* Productos — ocupa el alto disponible con scroll interno (mini-ventana) */}
              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line">
                <div className="grid flex-shrink-0 grid-cols-[56px_1fr_110px] gap-2 border-b border-line bg-hover px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-3">
                  <span>Cant.</span><span>Descripción</span><span className="text-right">Importe</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {detalle.lineas.map((l, i) => (
                    <div key={i} className="grid grid-cols-[56px_1fr_110px] gap-2 border-b border-line px-4 py-2.5 last:border-b-0">
                      <span className="font-display text-[15px] font-bold tabular-nums">{l.cantidad}</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium">{l.nombre}</span>
                        {l.modificadores.length > 0 && <span className="block text-[12px] text-ink-3">{l.modificadores.join(" · ")}</span>}
                        {l.notaCocina && <span className="block text-[12px] italic text-ink-3">“{l.notaCocina}”</span>}
                      </span>
                      <span className="text-right font-display tabular-nums">{fmtMxn(l.totalMxn)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Forma de pago + totales — fijos abajo */}
              <div className="mt-4 grid flex-shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3.5">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">Forma de pago</div>
                  {detalle.pagos.length === 0 ? (
                    <div className="text-[13px] text-ink-3">Sin pagos registrados.</div>
                  ) : detalle.pagos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 text-[13.5px]">
                      <span className="text-ink-2">{p.metodo}{p.recibidoMxn != null ? ` · recibido ${fmtMxn(p.recibidoMxn)} · cambio ${fmtMxn(p.cambioMxn)}` : ""}</span>
                      <span className="font-display tabular-nums">{fmtMxn(p.montoMxn)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-line p-3.5">
                  <Row k="Subtotal" v={detalle.totales.subtotal} />
                  {detalle.totales.descuentos > 0 && <Row k="Descuento" v={-detalle.totales.descuentos} />}
                  <Row k="IVA" v={detalle.totales.iva} />
                  {detalle.totales.propina > 0 && <Row k="Propina" v={detalle.totales.propina} />}
                  <div className="mt-1.5 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-[14px] font-bold uppercase tracking-wide">Total</span>
                    <span className="font-display text-[19px] font-bold tabular-nums">{fmtMxn(detalle.totales.total + detalle.totales.propina)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-[13.5px]">
      <span className="text-ink-2">{k}</span>
      <span className="font-display tabular-nums">{fmtMxn(v)}</span>
    </div>
  );
}
