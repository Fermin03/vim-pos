"use client";
import { useCallback, useEffect, useState } from "react";
import { BotonVolver } from "./boton-volver";
import { RenglonItem } from "./renglon-item";
import { Button } from "@vim/ui/styles";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { listarCuentasAbiertas, leerRenglonesCuenta, marcarSalidaDomicilio, minutosAbierta, type CuentaAbierta, type RenglonCuenta } from "../lib/cuentas-abiertas";
import { leerTotales, type TotalesTicket } from "../lib/cobro";
import { ModalCancelarItem } from "./modal-cancelar-item";
import { ModalCancelarTicket } from "./modal-cancelar-ticket";
import { ModalDescuento } from "./modal-descuento";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import type { Empleado } from "../lib/supabase";
import type { ModoServicio } from "../lib/carrito";

const PERMISO_REIMPRIMIR = "venta.reimprimir_ticket";

type Copia = {
  titulo: string;
  subtitulo: (n: number) => string;
  vacioTitulo: string;
  vacioTexto: string;
  nuevaCuenta: string;
};

const COPIA: Record<"DRIVE_THRU" | "DELIVERY_PROPIO", Copia> = {
  DRIVE_THRU: {
    titulo: "Pick-up",
    subtitulo: (n) => `${n} ${n === 1 ? "orden por recolectar" : "órdenes por recolectar"}`,
    vacioTitulo: "Sin órdenes por recolectar",
    vacioTexto: "Abre una cuenta para tomar un pedido de Pick-up.",
    nuevaCuenta: "Nueva orden",
  },
  DELIVERY_PROPIO: {
    titulo: "Domicilios",
    subtitulo: (n) => `${n} ${n === 1 ? "pedido activo" : "pedidos activos"}`,
    vacioTitulo: "Sin pedidos a domicilio",
    vacioTexto: "Abre una cuenta para tomar un pedido a domicilio.",
    nuevaCuenta: "Nueva orden",
  },
};

/**
 * Cuentas abiertas de un modo (Pick-up / Domicilio), en maestro-detalle.
 *
 * Antes estas pantallas solo listaban las cuentas y cualquier acción obligaba a "retomar" —
 * es decir, cargar la cuenta al carrito y salir a la pantalla de venta— aunque solo se
 * quisiera ver qué pidió el cliente o cobrar. Ahora la lista queda a la izquierda, el detalle
 * a la derecha, y las acciones sobre la cuenta seleccionada arriba.
 *
 * Las dos acciones que necesitan el catálogo (agregar producto) o el flujo de cobro siguen
 * saliendo a la pantalla de venta: ahí vive esa maquinaria y duplicarla sería pedir que dos
 * copias del carrito se mantengan iguales para siempre.
 */
export function PantallaCuentasModo({
  token,
  caja,
  turno,
  empleado,
  modo,
  onSalir,
  onAbrirCuenta,
  onAgregarProductos,
  onCobrar,
  onImprimirTicket,
  extraPorCuenta,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  modo: Extract<ModoServicio, "DRIVE_THRU" | "DELIVERY_PROPIO">;
  onSalir: () => void;
  /** Abre una cuenta NUEVA en este modo (entra al catálogo con el modo ya fijado). */
  onAbrirCuenta: () => void;
  /** Carga la cuenta en el carrito para agregarle productos (sale a la pantalla de venta). */
  /** El folio viaja para que el modal pueda titularse sin volver a consultarlo. */
  onAgregarProductos: (ticketId: string, folio: string | null) => void;
  /** Carga la cuenta y abre el cobro. */
  onCobrar: (ticketId: string) => void;
  /** Imprime el ticket del cliente de esa cuenta. */
  onImprimirTicket: (ticketId: string) => Promise<void>;
  /** Acciones propias del modo (p. ej. "Marcar salida" en domicilio). */
  extraPorCuenta?: (c: CuentaAbierta, recargar: () => void) => React.ReactNode;
}) {
  const copia = COPIA[modo];
  const [items, setItems] = useState<CuentaAbierta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<RenglonCuenta[] | null>(null);
  const [totales, setTotales] = useState<TotalesTicket | null>(null);
  const [descontando, setDescontando] = useState(false);
  const [cancelandoCuenta, setCancelandoCuenta] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const [imprimiendo, setImprimiendo] = useState(false);
  const [pidiendoPinReimpresion, setPidiendoPinReimpresion] = useState(false);
  const [cancelando, setCancelando] = useState<RenglonCuenta | null>(null);
  // Impresiones hechas en esta sesión: la primera es libre, de ahí en adelante pide PIN.
  const [yaImpresas, setYaImpresas] = useState<Set<string>>(new Set());

  const recargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await listarCuentasAbiertas(token, caja.sucursal_id, modo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las cuentas");
      setItems([]);
    }
  }, [token, caja.sucursal_id, modo]);

  useEffect(() => { recargar(); }, [recargar]);
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  /** Relee el detalle de la cuenta: renglones + totales AUTORITATIVOS de la BD (no del carrito:
   *  el descuento y el IVA los recalcula el servidor y aquí se cobra con esa cifra). */
  const recargarDetalle = useCallback(async (ticketId: string) => {
    const [rs, ts] = await Promise.all([
      leerRenglonesCuenta(token, ticketId),
      leerTotales(token, ticketId).catch(() => null),
    ]);
    setDetalle(rs);
    setTotales(ts);
  }, [token]);

  useEffect(() => {
    if (!selId) { setDetalle(null); setTotales(null); return; }
    let vivo = true;
    setDetalle(null); setTotales(null);
    recargarDetalle(selId).catch(() => { if (vivo) setDetalle([]); });
    return () => { vivo = false; };
  }, [selId, recargarDetalle]);

  const sel = (items ?? []).find((c) => c.ticketId === selId) ?? null;
  // "Ya se imprimió" = lo hicimos en esta sesión, o el ticket trae marca de impresión previa.
  const yaSeImprimio = sel != null && (yaImpresas.has(sel.ticketId) || sel.impresaAt != null);
  const hayDescuento = (totales?.descuentos ?? 0) > 0;

  const imprimir = useCallback(async (ticketId: string) => {
    setImprimiendo(true);
    try {
      await onImprimirTicket(ticketId);
      setYaImpresas((s) => new Set(s).add(ticketId));
      // En domicilio, imprimir el ticket ES el momento en que la orden sale con el repartidor.
      // Se persiste (comanda_impresa_at) para que el naranja siga ahí tras recargar y lo vea
      // cualquier caja de la sucursal, no solo la que imprimió. Si el UPDATE falla, la orden
      // ya se imprimió: se deja la marca local y no se molesta al cajero con un error.
      if (modo === "DELIVERY_PROPIO") {
        try {
          await marcarSalidaDomicilio(token, ticketId);
          await recargar();
        } catch {
          /* la marca local ya pintó la cuenta */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo imprimir");
    } finally {
      setImprimiendo(false);
    }
  }, [onImprimirTicket, modo, token, recargar]);

  return (
    <main className="flex h-screen flex-col bg-bg">
      <header className="flex h-[clamp(3rem,7.5vh,4.25rem)] flex-shrink-0 items-center justify-between gap-3 border-b border-line px-3">
        <BotonVolver onClick={onSalir} />
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink">
            <span className="font-display text-[15px] font-bold leading-none tracking-tight text-white">V</span>
            <span className="absolute bottom-1 right-1 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-semibold tracking-tight">{copia.titulo} · {caja.nombre}</div>
            <div className="truncate text-[12px] text-ink-3">{copia.subtitulo((items ?? []).length)}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button onClick={onAbrirCuenta}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]"><path d="M12 5v14M5 12h14" /></svg>
            {copia.nuevaCuenta}
          </Button>
        </div>
      </header>

      {error && <p className="flex-shrink-0 bg-[#FBF1EF] px-4 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}

      <div className="flex min-h-0 flex-1">
        {/* ── Lista de cuentas ─────────────────────────────────────────── */}
        <div className="flex w-[clamp(18rem,30vw,24rem)] flex-shrink-0 flex-col border-r border-line">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {items === null && <p className="p-3 text-sm text-ink-3">Cargando…</p>}
            {items?.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <p className="text-[14px] font-semibold text-ink-2">{copia.vacioTitulo}</p>
                <p className="text-[12.5px] text-ink-3">{copia.vacioTexto}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {items?.map((c) => {
                const activa = c.ticketId === selId;
                // Ticket ya impreso = la orden salió. Se pinta en naranja para distinguir de un
                // vistazo lo que ya va en camino de lo que sigue pendiente de imprimir.
                const salio = yaImpresas.has(c.ticketId) || c.impresaAt != null;
                return (
                  <button
                    key={c.ticketId}
                    type="button"
                    onClick={() => setSelId(c.ticketId)}
                    className={[
                      "w-full rounded-lg border p-3 text-left transition",
                      salio
                        ? `bg-accent text-white ${activa ? "border-ink" : "border-accent hover:brightness-105"}`
                        : activa
                          ? "border-ink bg-sel"
                          : "border-line-strong bg-surface hover:border-ink",
                    ].join(" ")}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-display text-[15px] font-semibold">{c.cliente ?? c.folio ?? "Cuenta"}</span>
                      <span className="flex-shrink-0 font-display text-[15px] font-bold tabular-nums">{fmtMxn(c.total)}</span>
                    </div>
                    <div className={["mt-0.5 flex items-center justify-between gap-2 text-[12px]", salio ? "text-white/75" : "text-ink-3"].join(" ")}>
                      <span className="truncate">{c.nItems} {c.nItems === 1 ? "producto" : "productos"}</span>
                      <span className="flex-shrink-0">{minutosAbierta(c.desdeIso, ahora)} min</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Detalle de la cuenta ─────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!sel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-10 w-10 text-line-strong"><path d="M6 2h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
              <p className="text-[14px] font-semibold text-ink-2">Elige una cuenta</p>
              <p className="text-[12.5px] text-ink-3">Verás lo que se ordenó y podrás cobrarla o modificarla.</p>
            </div>
          ) : (
            <>
              {/* Barra de acciones sobre la cuenta seleccionada */}
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <div className="mr-auto min-w-0">
                  <div className="truncate font-display text-[16px] font-semibold">{sel.cliente ?? sel.folio ?? "Cuenta"}</div>
                  <div className="text-[12px] text-ink-3">{sel.folio ? `${sel.folio} · ` : ""}{fmtMxn(sel.total)}</div>
                </div>
                <Accion label="Agregar producto" onClick={() => onAgregarProductos(sel.ticketId, sel.folio)} />
                <Accion label={hayDescuento ? "Descuento aplicado" : "Descuento"} onClick={() => setDescontando(true)} inactivo={hayDescuento} />
                <Accion label={yaSeImprimio ? "Reimprimir" : "Imprimir ticket"} onClick={() => (yaSeImprimio ? setPidiendoPinReimpresion(true) : imprimir(sel.ticketId))} ocupado={imprimiendo} />
                {extraPorCuenta?.(sel, recargar)}
                <Accion label="Cancelar cuenta" onClick={() => setCancelandoCuenta(true)} peligro />
                <Accion label={`Cobrar ${fmtMxn(totales?.total ?? sel.total)}`} onClick={() => onCobrar(sel.ticketId)} destacado />
              </div>

              {/* Lo que se ordenó */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {detalle === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
                {detalle?.length === 0 && <p className="text-sm text-ink-3">Esta cuenta no tiene productos.</p>}
                <div className="flex flex-col divide-y divide-line">
                  {detalle?.map((it) => (
                    <div key={it.id} className="flex items-start gap-2 py-2.5">
                      {/* Mismo renglón que el carrito y que "Agregar productos": el cajero
                          verifica el pedido con el cliente delante y no debería tener que
                          reinterpretar tres formatos distintos de la misma información. */}
                      <div className="min-w-0 flex-1">
                        <RenglonItem
                          cantidad={it.cantidad}
                          nombre={it.productoNombre}
                          modificadores={it.modificadores}
                          notaCocina={it.notaCocina}
                          totalMxn={it.totalItemMxn}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCancelando(it)}
                        title="Eliminar producto"
                        className="flex-shrink-0 rounded px-2 py-1 text-[12.5px] font-semibold text-ink-3 transition hover:bg-hover hover:text-danger"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales de la BD: es la cifra con la que se va a cobrar. */}
              {totales && (
                <div className="flex-shrink-0 border-t border-line bg-sel px-4 py-3">
                  <div className="flex justify-between text-[13px] text-ink-2">
                    <span>Subtotal</span><span className="font-medium tabular-nums text-ink">{fmtMxn(totales.subtotal)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-[13px] text-ink-2">
                    <span>IVA (16%)</span><span className="font-medium tabular-nums text-ink">{fmtMxn(totales.iva)}</span>
                  </div>
                  {hayDescuento && (
                    <div className="mt-0.5 flex justify-between text-[13px] font-medium text-danger">
                      <span>Descuento</span><span className="tabular-nums">−{fmtMxn(totales.descuentos)}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-[14px] font-bold uppercase tracking-[0.03em]">Total</span>
                    <span className="font-display text-[25px] font-bold leading-none tabular-nums">{fmtMxn(totales.total)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {cancelando && sel && (
        <ModalCancelarItem
          token={token}
          empleado={empleado}
          ticketItemId={cancelando.id}
          productoNombre={cancelando.productoNombre}
          cantidad={cancelando.cantidad}
          totalItem={cancelando.totalItemMxn}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          estadoCocina={cancelando.estadoCocina}
          onCancelado={async () => {
            setCancelando(null);
            await recargar();
            await recargarDetalle(sel.ticketId).catch(() => {});
          }}
          onCerrar={() => setCancelando(null)}
        />
      )}

      {descontando && sel && (
        <ModalDescuento
          token={token}
          empleado={empleado}
          ticketId={sel.ticketId}
          totalActual={totales?.total ?? sel.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onAplicado={async () => {
            setDescontando(false);
            await recargar();
            await recargarDetalle(sel.ticketId).catch(() => {});
          }}
          onCerrar={() => setDescontando(false)}
        />
      )}

      {cancelandoCuenta && sel && (
        <ModalCancelarTicket
          token={token}
          empleado={empleado}
          ticketId={sel.ticketId}
          folio={sel.folio}
          totalActual={totales?.total ?? sel.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onCancelado={async () => {
            setCancelandoCuenta(false);
            setSelId(null); // la cuenta ya no existe: no dejar el detalle colgado
            await recargar();
          }}
          onCerrar={() => setCancelandoCuenta(false)}
        />
      )}

      {pidiendoPinReimpresion && sel && (
        <ModalAutorizacionPin
          token={token}
          accion="reimprimir_ticket"
          permisoCodigo={PERMISO_REIMPRIMIR}
          descripcion={`Reimprimir el ticket de ${sel.cliente ?? sel.folio ?? "la cuenta"} · ${fmtMxn(sel.total)}`}
          ejecutaNombre={empleado.nombre}
          monto={sel.total}
          entidadTipo="ticket"
          entidadId={sel.ticketId}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          motivo="Reimpresión de ticket"
          onAutorizado={() => { setPidiendoPinReimpresion(false); imprimir(sel.ticketId); }}
          onCancelar={() => setPidiendoPinReimpresion(false)}
        />
      )}
    </main>
  );
}

function Accion({
  label, onClick, destacado, ocupado, inactivo, peligro,
}: { label: string; onClick: () => void; destacado?: boolean; ocupado?: boolean; inactivo?: boolean; peligro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado || inactivo}
      className={[
        "flex h-9 flex-shrink-0 items-center rounded px-3 text-[13px] font-semibold transition disabled:cursor-default disabled:opacity-45",
        destacado
          ? "bg-accent text-white hover:bg-accent-hover"
          : peligro
            ? "border border-line-strong text-ink-3 hover:border-danger hover:text-danger"
            : "border border-line-strong text-ink-2 hover:border-ink hover:text-ink",
      ].join(" ")}
    >
      {ocupado ? "Imprimiendo…" : label}
    </button>
  );
}
