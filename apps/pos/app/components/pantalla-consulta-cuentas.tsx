"use client";
import { Icono, Cargando } from "@vim/ui/styles";
import { useCallback, useEffect, useState } from "react";
import { BotonVolver, ENCABEZADO_PANTALLA } from "./boton-volver";
import { useEscape } from "../lib/use-escape";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { type Empleado } from "../lib/supabase";
import { listarCuentas, labelModoCuenta, type CuentaCerrada, type FiltroCuentas } from "../lib/consulta-cuentas";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { type DatosTicketImpresion } from "../lib/print/tipos";
import { ModalCancelarTicket } from "./modal-cancelar-ticket";
import { ModalCambiarPago } from "./modal-cambiar-pago";
import { ModalReabrirCuenta } from "./modal-reabrir-cuenta";
import { METODOS_PAGO } from "../lib/cuentas-acciones";
import { hoyMx } from "@vim/fecha";
import { etiquetaMetodoPago } from "@vim/db/metodos-pago";

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
}
// Hora de México, no UTC: con `toISOString()` esta pantalla se abría en la fecha de MAÑANA a
// partir de las 18:00 hora local —y salía vacía— justo durante el servicio de la cena.
const hoyISO = () => hoyMx();

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
  const [cancelando, setCancelando] = useState<CuentaCerrada | null>(null);
  const [cambiandoPago, setCambiandoPago] = useState<CuentaCerrada | null>(null);
  const [reabriendo, setReabriendo] = useState<CuentaCerrada | null>(null);
  // Los modales de esta pantalla cierran con su propio Escape; sin ninguno abierto, es «Volver».
  useEscape(onSalir);

  const cuentaSel = cuentas?.find((c) => c.ticketId === sel) ?? null;
  // Método actual: el detalle trae la etiqueta legible ("Efectivo"); la mapeo de vuelta al código
  // enum para prellenar/filtrar el modal de cambio de pago (null si no está en la lista conocida).
  const etiquetaPago = detalle?.pagos[0]?.metodo ?? null;
  const metodoActual = METODOS_PAGO.find((m) => m.label === etiquetaPago)?.codigo ?? null;
  // Pagada en línea (tienda): ni se le cambia el pago ni se reabre; la base tampoco lo deja (0173).
  const pagadaEnLinea = (detalle?.pagos ?? []).some((p) => p.metodo === etiquetaMetodoPago("PAGO_EN_LINEA"));

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
    <div className="flex h-dvh flex-col bg-bg">
      {/* Encabezado */}
      <header className={`${ENCABEZADO_PANTALLA} flex-wrap bg-surface py-1`}>
        <BotonVolver onClick={onSalir} />
        <div className="mr-auto flex items-center gap-3">
          <div>
            <div className="font-display text-16 font-bold leading-tight">Cuentas · {caja.nombre}</div>
            <div className="text-12 text-ink-3">{cuentas?.length ?? 0} cuentas</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line-strong p-0.5">
            <button type="button" onClick={() => setModoFiltro("turno")} className={`rounded px-3 py-1.5 text-13 font-semibold transition ${modoFiltro === "turno" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>Turno actual</button>
            <button type="button" onClick={() => setModoFiltro("fechas")} className={`rounded px-3 py-1.5 text-13 font-semibold transition ${modoFiltro === "fechas" ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}>Por fechas</button>
          </div>
          {modoFiltro === "fechas" && (
            <div className="flex items-center gap-1.5 text-13">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded border border-line-strong px-2 text-ink" />
              <span className="text-ink-3">a</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 rounded border border-line-strong px-2 text-ink" />
            </div>
          )}
          <button type="button" onClick={recargar} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
            <Icono nombre="actualizar" className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-danger-line bg-danger-soft px-3 py-2 text-13 font-medium text-danger" role="alert">{error}</div>}

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <div className="flex w-[420px] flex-shrink-0 flex-col border-r border-line">
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-line px-4 py-2 text-11 font-bold uppercase tracking-wide text-ink-3">
            <span>Folio · Fecha</span><span>Total</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cuentas === null && <Cargando />}
            {cuentas !== null && cuentas.length === 0 && <p className="p-6 text-center text-13 text-ink-3">Sin cuentas en este filtro.</p>}
            {cuentas?.map((c) => (
              <button
                key={c.ticketId}
                type="button"
                onClick={() => seleccionar(c.ticketId)}
                className={`grid w-full grid-cols-[1fr_auto] items-center gap-2 border-b border-line px-4 py-2.5 text-left transition ${sel === c.ticketId ? "bg-sel" : "hover:bg-hover"}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-14 font-bold tabular-nums">{c.folio ?? c.ticketId.slice(-6)}</span>
                    {c.estado === "CANCELADO" && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-11 font-bold text-danger">Cancelada</span>}
                  </span>
                  <span className="block truncate text-12 text-ink-3">{fechaCorta(c.fechaIso)} · {labelModoCuenta(c.modo, caja.giro)}{c.cliente ? ` · ${c.cliente}` : ""}</span>
                </span>
                <span className={`font-display text-14 font-bold tabular-nums ${c.estado === "CANCELADO" ? "text-ink-3 line-through" : "text-ink"}`}>{fmtMxn(c.total)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle */}
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {!sel && <div className="flex flex-1 items-center justify-center text-center text-13 text-ink-3">Elige una cuenta de la lista para ver su detalle.</div>}
          {sel && cargandoDet && <Cargando texto="Cargando detalle" className="flex-1" />}
          {sel && detalle && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Encabezado — fijo. Los datos de la cuenta arriba y los botones en una fila debajo,
                  igual que en Comedor, Pickup y Domicilio. Antes compartían renglón y se repartían
                  el ancho: a 1024×768 el folio salía en tres renglones ("KC-" / "2026-" /
                  "000015") y "Cancelar folio" en dos. */}
              <div className="flex-shrink-0">
                <div className="min-w-0">
                  <div className="whitespace-nowrap font-display text-24 font-bold tabular-nums">{detalle.meta.folio}</div>
                  <div className="text-13 text-ink-3">{fechaCorta(detalle.meta.fechaIso)} · {labelModoCuenta(detalle.meta.modoServicio)} · Cajero: {detalle.meta.cajero}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={imprimiendo}
                    onClick={reimprimir}
                    className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line-strong px-4 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-60"
                  >
                    <Icono nombre="impresora" className="h-4 w-4" />
                    {imprimiendo ? "Imprimiendo…" : "Reimprimir"}
                  </button>
                  {cuentaSel?.estado === "PAGADO" && (
                    <>
                      {!pagadaEnLinea && <>
                      <button
                        type="button"
                        onClick={() => setCambiandoPago(cuentaSel)}
                        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line-strong px-4 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                      >
                        <Icono nombre="tarjeta" className="h-4 w-4" />
                        Cambiar pago
                      </button>
                      <button
                        type="button"
                        onClick={() => setReabriendo(cuentaSel)}
                        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line-strong px-4 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                      >
                        <Icono nombre="actualizar" className="h-4 w-4" />
                        Reabrir
                      </button>
                      </>}
                      <button
                        type="button"
                        onClick={() => setCancelando(cuentaSel)}
                        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-danger/40 px-4 text-14 font-semibold text-danger transition hover:border-danger hover:bg-danger/[0.06]"
                      >
                        <Icono nombre="cerrar" className="h-4 w-4" />
                        Cancelar folio
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Productos — ocupa el alto disponible con scroll interno (mini-ventana) */}
              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line">
                <div className="grid flex-shrink-0 grid-cols-[56px_1fr_110px] gap-2 border-b border-line bg-hover px-4 py-2.5 text-11 font-bold uppercase tracking-wide text-ink-3">
                  <span>Cant.</span><span>Descripción</span><span className="text-right">Importe</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {detalle.lineas.map((l, i) => (
                    <div key={i} className="grid grid-cols-[56px_1fr_110px] gap-2 border-b border-line px-4 py-2.5 last:border-b-0">
                      <span className="font-display text-15 font-bold tabular-nums">{l.cantidad}</span>
                      <span className="min-w-0">
                        <span className="block text-14 font-medium">{l.nombre}</span>
                        {l.modificadores.length > 0 && <span className="block text-12 text-ink-3">{l.modificadores.join(" · ")}</span>}
                        {l.notaCocina && <span className="block text-12 italic text-ink-3">“{l.notaCocina}”</span>}
                      </span>
                      <span className="text-right font-display tabular-nums">{fmtMxn(l.totalMxn)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Forma de pago + totales — fijos abajo */}
              <div className="mt-4 grid flex-shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3.5">
                  <div className="mb-2 text-11 font-bold uppercase tracking-wide text-ink-3">Forma de pago</div>
                  {detalle.pagos.length === 0 ? (
                    <div className="text-13 text-ink-3">Sin pagos registrados.</div>
                  ) : detalle.pagos.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 text-14">
                      <span className="text-ink-2">{p.metodo}{p.recibidoMxn != null ? ` · recibido ${fmtMxn(p.recibidoMxn)} · cambio ${fmtMxn(p.cambioMxn)}` : ""}</span>
                      <span className="font-display tabular-nums">{fmtMxn(p.montoMxn)}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-line p-3.5">
                  <Row k="Subtotal" v={detalle.totales.subtotal} />
                  {detalle.totales.descuentos > 0 && <Row k="Descuento" v={-detalle.totales.descuentos} />}
                  {(detalle.totales.lealtad ?? 0) > 0 && <Row k="Lealtad" v={-(detalle.totales.lealtad ?? 0)} />}
                  <Row k="IVA" v={detalle.totales.iva} />
                  {detalle.totales.propina > 0 && <Row k="Propina" v={detalle.totales.propina} />}
                  <div className="mt-1.5 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-14 font-bold uppercase tracking-wide">Total</span>
                    <span className="font-display text-20 font-bold tabular-nums">{fmtMxn(detalle.totales.total + detalle.totales.propina)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {cancelando && (
        <ModalCancelarTicket
          token={token}
          empleado={empleado}
          ticketId={cancelando.ticketId}
          folio={cancelando.folio}
          totalActual={cancelando.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          pagada
          enLinea={pagadaEnLinea}
          cuentaDesde={cancelando.fechaIso}
          onCancelado={() => { setCancelando(null); setSel(null); setDetalle(null); recargar(); }}
          onCerrar={() => setCancelando(null)}
        />
      )}

      {cambiandoPago && (
        <ModalCambiarPago
          token={token}
          empleado={empleado}
          ticketId={cambiandoPago.ticketId}
          folio={cambiandoPago.folio}
          total={cambiandoPago.total}
          metodoActual={metodoActual}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onCambiado={() => { setCambiandoPago(null); seleccionar(cambiandoPago.ticketId); recargar(); }}
          onCerrar={() => setCambiandoPago(null)}
        />
      )}

      {reabriendo && (
        <ModalReabrirCuenta
          token={token}
          empleado={empleado}
          ticketId={reabriendo.ticketId}
          folio={reabriendo.folio}
          total={reabriendo.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onReabierto={() => { setReabriendo(null); setSel(null); setDetalle(null); recargar(); }}
          onCerrar={() => setReabriendo(null)}
        />
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-14">
      <span className="text-ink-2">{k}</span>
      <span className="font-display tabular-nums">{fmtMxn(v)}</span>
    </div>
  );
}
