"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotonVolver } from "./boton-volver";
import { useEscape } from "../lib/use-escape";
import { Button, DialogoPeligro, LogoVim } from "@vim/ui/styles";
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
import { AvisoAutorizacion, MotivoChips, etiquetaMotivo } from "./motivo-y-autorizacion";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { obtenerImpresora } from "../lib/print/adapter";
import { construirDevolucionJob, type DatosDevolucion } from "../lib/print/devolucion-builder";
import { OverlayReciboDevolucion } from "./recibo-devolucion";

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
  const [reciboDev, setReciboDev] = useState<DatosDevolucion | null>(null);
  // El recibo de la devolución va encima de la lista: Escape lo cierra a él antes de salir.
  useEscape(reciboDev ? () => setReciboDev(null) : onSalir);
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
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-3.5">
        <BotonVolver onClick={onSalir} />
        <div className="mr-auto flex items-center gap-3">
          <LogoVim className="h-8 w-8" />
          <div>
            <div className="font-display text-16 font-bold leading-tight">Devoluciones · {caja.nombre}</div>
            <div className="text-12 text-ink-3">Selecciona la venta a devolver. La venta queda en el historial; el reembolso sale de la caja.</div>
          </div>
        </div>
      </header>

      {error && <div className="mx-6 mt-3 rounded border border-danger-line bg-danger-soft px-3 py-2 text-13 font-medium text-danger" role="alert">{error}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {ventas === null && <p className="text-center text-ink-3">Cargando ventas…</p>}
        {ventas !== null && ventas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 0 8h-1" /></svg>
            <p className="text-18 font-semibold text-ink-2">No hay ventas en el turno</p>
            <p className="text-13">Las ventas cobradas aparecerán aquí para poder devolverlas.</p>
          </div>
        )}
        {ventas !== null && ventas.length > 0 && (
          <div className="mx-auto flex max-w-[680px] flex-col gap-2">
            {ventas.map((v) => (
              <div key={v.ticketId} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-15 font-bold">{v.folio}</span>
                    {v.tieneDevolucion && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">Con devolución</span>}
                  </div>
                  {v.fechaCobro && (
                    <div className="mt-0.5 text-12 text-ink-3">
                      {new Date(v.fechaCobro).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
                <div className="font-display text-16 font-bold tabular-nums">{fmtMxn(v.total)}</div>
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
          onHecho={(d) => {
            setSel(null);
            if (d) setReciboDev(d);
            recargar();
          }}
          onCerrar={() => setSel(null)}
        />
      )}

      {reciboDev && (
        <OverlayReciboDevolucion
          d={reciboDev}
          onImprimir={() => { obtenerImpresora("CAJA", { onMostrar: () => window.print() }).imprimir(construirDevolucionJob(reciboDev)); }}
          onCerrar={() => setReciboDev(null)}
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
  onHecho: (d?: DatosDevolucion) => void;
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

  const labelMotivo = () => etiquetaMotivo(MOTIVOS_DEV, motivo, motivoTexto);

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
      // Comprobante de devolución (best-effort: si falla armarlo, la devolución ya quedó).
      let dDev: DatosDevolucion | undefined;
      try {
        const datos = await leerTicketParaImpresion(venta.ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
        dDev = {
          negocio: { nombre: datos.negocio.nombre, rfc: datos.negocio.rfc },
          sucursal: { direccion: datos.sucursal.direccion, telefono: datos.sucursal.telefono },
          folioOriginal: datos.meta.folio,
          fechaIso: new Date().toISOString(),
          cajero: empleado.nombre,
          caja: caja.nombre,
          autorizo: null,
          items: datos.lineas.map((l) => ({ cantidad: l.cantidad, nombre: l.nombre, totalMxn: l.totalMxn })),
          motivo: labelMotivo(),
          medio: MEDIOS_DEV.find((m) => m.codigo === medio)?.label ?? medio,
          totalReembolso: venta.total,
          ancho: 80,
        };
      } catch { /* recibo opcional */ }
      onHecho(dDev);
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
        payload={{ accion: "devolucion", permisoCodigo: "venta.devolucion", entidadTipo: "ticket", entidadId: venta.ticketId, monto: venta.total, motivo: labelMotivo(), cajaId: turno.caja_id, turnoId: turno.id }}
        descripcion={`Devolución de ${venta.folio} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo="Devolver venta"
      contexto={`${venta.folio} · se reembolsan ${fmtMxn(venta.total)}`}
      consecuencia="Se devuelven todos los productos. La venta queda en el historial."
      error={error}
      boton="Devolver venta"
      ocupado={procesando}
      textoOcupado="Devolviendo…"
      deshabilitado={items === null}
      onConfirmar={() => void confirmar()}
      onCerrar={onCerrar}
    >
      {items === null ? (
        <p className="text-sm text-ink-3">Cargando ítems…</p>
      ) : (
        <div className="max-h-32 overflow-y-auto rounded border border-line bg-sel p-3 text-13 text-ink-2">
          {items.map((i) => (
            <div key={i.ticketItemId} className="flex justify-between py-0.5">
              <span>{i.cantidad}× {i.nombre}</span>
              <span className="tabular-nums">{fmtMxn(i.totalItem)}</span>
            </div>
          ))}
        </div>
      )}
      <MotivoChips opciones={MOTIVOS_DEV} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <div>
        <div className="mb-1.5 text-13 font-medium text-ink-2">Reembolso en</div>
        <div className="flex gap-2">
          {MEDIOS_DEV.map((m) => (
            <button key={m.codigo} type="button" onClick={() => setMedio(m.codigo)}
              className={["flex-1 rounded border px-3 py-2 text-13 font-semibold transition", medio === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
              {m.label}
            </button>
          ))}
        </div>
        {MEDIOS_DEV.find((m) => m.codigo === medio)?.nota && (
          <p className="mt-1.5 text-12 text-ink-3">{MEDIOS_DEV.find((m) => m.codigo === medio)?.nota}</p>
        )}
      </div>
      <AvisoAutorizacion propia={tienePermiso} />
    </DialogoPeligro>
  );
}
