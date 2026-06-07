"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { type Empleado } from "../lib/supabase";
import {
  devolverVenta,
  leerItemsVenta,
  leerVentasTurno,
  MEDIOS_DEV,
  MOTIVOS_DEV,
  type ItemVenta,
  type MedioDevolucion,
  type MotivoDevolucion,
  type VentaTurno,
} from "../lib/devoluciones";
import { autorizacionPropia, type Autorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";

const ROLES_DEVOLUCION = ["SUPERVISOR", "ADMIN", "DUENO"];

export function PantallaDevoluciones({
  token,
  caja,
  turno,
  empleado,
  onSalir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onSalir: () => void;
}) {
  const [ventas, setVentas] = useState<VentaTurno[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<VentaTurno | null>(null);
  const montado = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const v = await leerVentasTurno(token, turno.id);
      if (montado.current) {
        setVentas(v);
        setError(null);
      }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las ventas");
    }
  }, [token, turno.id]);

  useEffect(() => {
    montado.current = true;
    recargar();
    return () => {
      montado.current = false;
    };
  }, [recargar]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink"><span className="font-display text-[15px] font-bold text-white">V</span></div>
          <div>
            <div className="font-display text-[16px] font-bold leading-tight">Devoluciones · {caja.nombre}</div>
            <div className="text-[11.5px] text-ink-3">Selecciona la venta a devolver. La venta queda en el historial; el reembolso sale de la caja.</div>
          </div>
        </div>
        <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Salir
        </button>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-[#EDC4BE] bg-[#FBECEA] px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {ventas === null && <p className="text-center text-ink-3">Cargando ventas…</p>}
        {ventas !== null && ventas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 0 8h-1" /></svg>
            <p className="text-[17px] font-semibold text-ink-2">No hay ventas en el turno</p>
            <p className="text-[13px]">Las ventas cobradas aparecerán aquí para poder devolverlas.</p>
          </div>
        )}
        {ventas !== null && ventas.length > 0 && (
          <div className="mx-auto flex max-w-[680px] flex-col gap-2">
            {ventas.map((v) => (
              <div key={v.ticketId} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[15px] font-bold">{v.folio}</span>
                    {v.tieneDevolucion && <span className="rounded-full bg-[#FCF3E6] px-2 py-0.5 text-[10.5px] font-bold text-warning">Con devolución</span>}
                  </div>
                  {v.fechaCobro && (
                    <div className="mt-0.5 text-[12px] text-ink-3">
                      {new Date(v.fechaCobro).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
                <div className="font-display text-[16px] font-bold tabular-nums">{fmtMxn(v.total)}</div>
                <Button variant="ghost" onClick={() => setSel(v)}>Devolver</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <ModalDevolucion
          token={token}
          caja={caja}
          turno={turno}
          empleado={empleado}
          venta={sel}
          onHecho={() => {
            setSel(null);
            recargar();
          }}
          onCerrar={() => setSel(null)}
        />
      )}
    </div>
  );
}

function ModalDevolucion({
  token,
  caja,
  turno,
  empleado,
  venta,
  onHecho,
  onCerrar,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  venta: VentaTurno;
  onHecho: () => void;
  onCerrar: () => void;
}) {
  const [items, setItems] = useState<ItemVenta[] | null>(null);
  const [motivo, setMotivo] = useState<MotivoDevolucion>("PRODUCTO_DEFECTUOSO");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [medio, setMedio] = useState<MedioDevolucion>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  const tienePermiso = ROLES_DEVOLUCION.includes(empleado.rol);

  useEffect(() => {
    leerItemsVenta(token, venta.ticketId).then(setItems).catch(() => setError("No se pudieron leer los ítems"));
  }, [token, venta.ticketId]);

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS_DEV.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  async function ejecutar(a: Autorizacion) {
    if (!items) return;
    setProcesando(true);
    setError(null);
    try {
      await devolverVenta(token, {
        ticketId: venta.ticketId,
        cajaId: turno.caja_id,
        turnoId: turno.id,
        items: items.map((i) => ({ ticketItemId: i.ticketItemId, cantidadDevuelta: i.cantidad })),
        motivo,
        motivoTexto,
        medio,
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function confirmar() {
    setError(null);
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (!tienePermiso) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      const a = await autorizacionPropia(token, {
        accion: "devolucion",
        permisoCodigo: "venta.devolucion",
        entidadTipo: "ticket",
        entidadId: venta.ticketId,
        monto: venta.total,
        motivo: labelMotivo(),
        cajaId: turno.caja_id,
        turnoId: turno.id,
      });
      await ejecutar(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="devolucion"
        permisoCodigo="venta.devolucion"
        descripcion={`Devolución de ${venta.folio} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={venta.total}
        entidadTipo="ticket"
        entidadId={venta.ticketId}
        cajaId={turno.caja_id}
        turnoId={turno.id}
        motivo={labelMotivo()}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal open onClose={onCerrar} title="Devolver venta" hideTitle
      className="w-[460px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Devolver venta</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">{venta.folio} · se reembolsará {fmtMxn(venta.total)} (la venta queda en el historial).</p>
      </div>

      {items === null ? (
        <p className="mb-4 text-sm text-ink-3">Cargando ítems…</p>
      ) : (
        <div className="mb-4 max-h-32 overflow-y-auto rounded border border-line bg-sel p-3 text-[12.5px] text-ink-2">
          {items.map((i) => (
            <div key={i.ticketItemId} className="flex justify-between py-0.5">
              <span>{i.cantidad}× {i.nombre}</span>
              <span className="tabular-nums">{fmtMxn(i.totalItem)}</span>
            </div>
          ))}
          <p className="mt-1 border-t border-line pt-1 text-[11.5px] text-ink-3">Devolución total (todos los ítems).</p>
        </div>
      )}

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Motivo</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS_DEV.map((m) => (
          <button key={m.codigo} type="button" onClick={() => setMotivo(m.codigo)}
            className={["rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition", motivo === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {m.label}
          </button>
        ))}
      </div>
      {motivo === "OTRO" && (
        <input className={`${input} mb-3`} value={motivoTexto} maxLength={200} onChange={(e) => setMotivoTexto(e.target.value)} placeholder="Describe el motivo" />
      )}

      <div className="mb-1.5 text-[13px] font-medium text-ink-2">Reembolso en</div>
      <div className="mb-4 flex gap-2">
        {MEDIOS_DEV.map((m) => (
          <button key={m.codigo} type="button" onClick={() => setMedio(m.codigo)}
            className={["flex-1 rounded border px-3 py-2 text-[12.5px] font-semibold transition", medio === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {m.label}
          </button>
        ))}
      </div>

      <div className={["mb-4 rounded border px-3 py-2 text-[12.5px] font-medium", tienePermiso ? "border-[#D6E8DD] bg-[#EAF3EE] text-success" : "border-[#E8DCC0] bg-[#F6EEDD] text-warning"].join(" ")}>
        {tienePermiso ? "Dentro de tu rol · no requiere autorización." : "Requiere PIN de un supervisor."}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
        <Button onClick={confirmar} disabled={procesando || items === null}>{procesando ? "Devolviendo…" : "Confirmar devolución"}</Button>
      </div>
    </Modal>
  );
}
