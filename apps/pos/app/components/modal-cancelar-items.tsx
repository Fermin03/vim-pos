"use client";
import { useMemo, useState } from "react";
import { DialogoPeligro } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import { cancelarItem, MOTIVOS_CANCELACION, type MotivoCancelacion } from "../lib/cancelacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { AvisoAutorizacion, MotivoChips, etiquetaMotivo } from "./motivo-y-autorizacion";
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

  const labelMotivo = () => etiquetaMotivo(MOTIVOS_CANCELACION, motivo, motivoTexto);

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
        payload={payload()}
        descripcion={`Cancelar ${seleccionados.length} producto(s) · ${fmtMxn(montoTotal)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo="Cancelar productos"
      contexto={folio ?? undefined}
      consecuencia="Marca los que se cancelan. Cocina recibe el aviso al confirmar."
      ancho="lg"
      error={error}
      nota={seleccionados.length > 0
        ? `${seleccionados.length} seleccionado(s) · ${fmtMxn(montoTotal)}`
        : "Nada seleccionado"}
      boton="Cancelar productos"
      ocupado={procesando}
      textoOcupado="Cancelando…"
      deshabilitado={seleccionados.length === 0}
      onConfirmar={() => void confirmar()}
      onCerrar={onCerrar}
    >
        <div className="max-h-[280px] overflow-y-auto rounded border border-line">
          {items.length === 0 && (
            <p className="p-4 text-center text-13 text-ink-3">Esta cuenta no tiene productos por cancelar.</p>
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
                  <span className="block text-14 font-semibold">
                    {i.cantidad}× {i.nombre}
                  </span>
                  {i.modificadores.length > 0 && (
                    <span className="block text-12 text-ink-3">{i.modificadores.join(" · ")}</span>
                  )}
                </span>
                <span className="flex-shrink-0 font-display text-14 tabular-nums text-ink-2">{fmtMxn(i.total)}</span>
              </button>
            );
          })}
        </div>
      <MotivoChips opciones={MOTIVOS_CANCELACION} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} maxLength={120} />
      <AvisoAutorizacion
        propia={!requierePin}
        texto={enCocina ? "Este pedido ya está en cocina: se pedirá autorización con PIN." : undefined}
      />
    </DialogoPeligro>
  );
}
