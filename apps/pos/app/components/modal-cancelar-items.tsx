"use client";
import { useMemo, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarItem, MOTIVOS_CANCELACION, type MotivoCancelacion } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { fmtMxn } from "../lib/turno";
import { useEscape } from "../lib/use-escape";

/** Roles que tienen `venta.cancelar_abierta` por defecto (matriz §2.2). */
const ROLES_CANCELAR = ["CAJERO", "SUPERVISOR", "ADMIN", "DUENO"];

export type ItemCancelable = {
  ticketItemId: string;
  nombre: string;
  cantidad: number;
  total: number;
  modificadores: string[];
  notaCocina: string | null;
};

/** Lo que se canceló, listo para armar la comanda que avisa a cocina. */
export type LineaCancelada = {
  /** Renglón del que salió: con él se averigua a qué estación hay que avisar la cancelación. */
  ticketItemId: string;
  cantidad: number;
  nombre: string;
  modificadores: string[];
  notaCocina: string | null;
};

/**
 * Cancelación de varios renglones de una vez.
 *
 * Antes había que cancelar de uno en uno, cada cual con su modal, su motivo y su PIN. Cuando una
 * mesa se arrepiente de media orden, eso son seis pasadas idénticas con la gente esperando — y en
 * la prisa se cancela de más o se abandona a la mitad, dejando la cuenta en un estado que nadie
 * quiso.
 *
 * El motivo y la autorización se piden UNA vez para todo el lote: es un solo hecho ("la mesa
 * canceló"), no seis decisiones distintas.
 */
export function ModalCancelarItems({
  token,
  empleado,
  ticketId,
  folio,
  items,
  estadoCocina,
  cajaId,
  turnoId,
  onCancelados,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  ticketId: string;
  folio: string | null;
  items: ItemCancelable[];
  /** Del TICKET: si ya está en cocina, la RPC exige PIN aunque el rol tenga el permiso. */
  estadoCocina: string | null;
  cajaId: string;
  turnoId: string;
  /** Recibe lo cancelado para que quien llama imprima la comanda de cocina. */
  onCancelados: (lineas: LineaCancelada[]) => void;
  onCerrar: () => void;
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState<MotivoCancelacion>("ERROR_DEL_CAJERO");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  useEscape(() => { if (!procesando) onCerrar(); });

  const seleccionados = useMemo(
    () => items.filter((i) => elegidos.has(i.ticketItemId)),
    [items, elegidos],
  );
  const montoTotal = seleccionados.reduce((a, i) => a + i.total, 0);
  const enCocina = estadoCocina === "EN_COCINA" || estadoCocina === "LISTO";
  const requierePin = enCocina || !ROLES_CANCELAR.includes(empleado.rol);

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function labelMotivo(): string {
    if (motivo === "OTRO") return motivoTexto.trim() || "Otro";
    return MOTIVOS_CANCELACION.find((m) => m.codigo === motivo)?.label ?? motivo;
  }

  function payload(): PayloadAutorizacion {
    return {
      accion: "cancelar_item",
      permisoCodigo: "venta.cancelar_abierta",
      entidadTipo: "ticket",
      entidadId: ticketId,
      monto: montoTotal,
      motivo: labelMotivo(),
      cajaId,
      turnoId,
    };
  }

  async function ejecutar(a: Autorizacion | null) {
    setProcesando(true);
    setError(null);
    const hechos: LineaCancelada[] = [];
    try {
      // En serie: la RPC cancela un renglón por llamada. Se acumulan los que SÍ entraron, para
      // que un fallo a media lista no borre el rastro de lo ya cancelado — la cocina tiene que
      // enterarse de eso aunque el resto falle.
      for (const it of seleccionados) {
        await cancelarItem(token, {
          ticketItemId: it.ticketItemId,
          motivo: labelMotivo(),
          autorizacionPinId: a?.autorizacionPinId ?? null,
        });
        hechos.push({
          ticketItemId: it.ticketItemId,
          cantidad: it.cantidad,
          nombre: it.nombre,
          modificadores: it.modificadores,
          notaCocina: it.notaCocina,
        });
      }
      onCancelados(hechos);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : "error";
      setProcesando(false);
      setPidiendoPin(false);
      if (hechos.length > 0) {
        setError(`Se cancelaron ${hechos.length} de ${seleccionados.length}. El resto no: ${detalle}`);
        onCancelados(hechos); // lo que sí se canceló debe llegar a cocina igual
      } else {
        setError(detalle);
      }
    }
  }

  async function confirmar() {
    setError(null);
    if (seleccionados.length === 0) {
      setError("Elige al menos un producto");
      return;
    }
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (requierePin) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      await ejecutar(await autorizacionPropia(token, payload()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="cancelar_item"
        permisoCodigo="venta.cancelar_abierta"
        descripcion={`Cancelar ${seleccionados.length} producto(s) · ${fmtMxn(montoTotal)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        monto={montoTotal}
        entidadTipo="ticket"
        entidadId={ticketId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo={labelMotivo()}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const input =
    "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Cancelar productos"
      hideTitle
      className="w-[520px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Cancelar productos</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {folio ? `${folio} · ` : ""}Marca los que se cancelan. Cocina recibe el aviso al confirmar.
        </p>
      </div>

      <div className="max-h-[280px] overflow-y-auto rounded border border-line">
        {items.length === 0 && (
          <p className="p-4 text-center text-[13px] text-ink-3">Esta cuenta no tiene productos por cancelar.</p>
        )}
        {items.map((i) => {
          const marcado = elegidos.has(i.ticketItemId);
          return (
            <button
              key={i.ticketItemId}
              type="button"
              onClick={() => alternar(i.ticketItemId)}
              className={[
                "flex w-full items-start gap-3 border-b border-line p-3 text-left transition last:border-0",
                marcado ? "bg-danger/5" : "hover:bg-hover",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border",
                  marcado ? "border-danger bg-danger text-white" : "border-line-strong",
                ].join(" ")}
              >
                {marcado && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">
                  {i.cantidad}× {i.nombre}
                </span>
                {i.modificadores.length > 0 && (
                  <span className="block text-[12px] text-ink-3">{i.modificadores.join(" · ")}</span>
                )}
              </span>
              <span className="flex-shrink-0 font-display text-[13.5px] tabular-nums text-ink-2">{fmtMxn(i.total)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-[12.5px] font-semibold text-ink-2">Motivo</label>
        <select className={input} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoCancelacion)}>
          {MOTIVOS_CANCELACION.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.label}
            </option>
          ))}
        </select>
        {motivo === "OTRO" && (
          <input
            className={`${input} mt-2`}
            placeholder="Describe el motivo"
            value={motivoTexto}
            onChange={(e) => setMotivoTexto(e.target.value)}
            maxLength={120}
          />
        )}
      </div>

      {enCocina && (
        <p className="mt-3 rounded border border-[#F0DCC0] bg-[#FCF3E6] px-3 py-2 text-[12.5px] font-medium text-warning">
          Este pedido ya está en cocina: se pedirá autorización con PIN.
        </p>
      )}
      {error && (
        <p className="mt-3 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-3">
          {seleccionados.length > 0
            ? `${seleccionados.length} seleccionado(s) · ${fmtMxn(montoTotal)}`
            : "Nada seleccionado"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-50"
          >
            Cerrar
          </button>
          <Button onClick={confirmar} disabled={procesando || seleccionados.length === 0}>
            {procesando ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
