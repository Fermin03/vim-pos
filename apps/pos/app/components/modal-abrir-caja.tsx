"use client";
import { useState } from "react";
import { Modal } from "@vim/ui/styles";
import { type Empleado } from "../lib/supabase";
import type { Autorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { obtenerImpresora } from "../lib/print/adapter";
import type { PrintResult } from "../lib/print/tipos";

const PERMISO = "caja.abrir_cajon";

function mensajeFalla(r: Extract<PrintResult, { ok: false }>): string {
  if (r.motivo === "OFFLINE") return "No se pudo conectar con la impresora del cajón. Revisa que esté encendida y en la red.";
  return "El cajón no respondió. Inténtalo de nuevo.";
}

/**
 * Abre el cajón de dinero sin una venta de por medio (revisar cambio, corregir efectivo).
 * Siempre pide PIN de DUEÑO/ADMIN — abrir el cajón sin ticket es el punto clásico de fraude
 * en caja, así que no hay atajo "ya soy admin, me lo salto": cada apertura manual se autoriza
 * y queda registrada igual que cualquier otra acción sensible (autorizar-pin).
 */
export function ModalAbrirCaja({
  token,
  empleado,
  cajaId,
  turnoId,
  onCerrar,
}: {
  token: string;
  empleado: Empleado;
  cajaId: string;
  turnoId: string;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<"pin" | "abriendo" | "abierta" | "error">("pin");
  const [error, setError] = useState<string | null>(null);

  async function onAutorizado(_a: Autorizacion) {
    setEstado("abriendo");
    const r = await obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon();
    if (r.ok) {
      setEstado("abierta");
      setTimeout(onCerrar, 1200);
    } else {
      setError(mensajeFalla(r));
      setEstado("error");
    }
  }

  if (estado === "pin") {
    return (
      <ModalAutorizacionPin
        token={token}
        accion="abrir_cajon"
        permisoCodigo={PERMISO}
        descripcion="Abrir cajón de dinero"
        ejecutaNombre={empleado.nombre}
        monto={null}
        entidadTipo="caja"
        entidadId={cajaId}
        cajaId={cajaId}
        turnoId={turnoId}
        motivo="Apertura manual del cajón"
        onAutorizado={onAutorizado}
        onCancelar={onCerrar}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onCerrar}
      title="Abrir caja"
      hideTitle
      backdropClassName="bg-ink/40 backdrop-blur-sm"
      className="w-[360px] rounded-lg border border-line bg-surface p-6 text-center shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      {estado === "abriendo" && <p className="py-2 text-[14px] font-medium text-ink-2">Abriendo cajón…</p>}

      {estado === "abierta" && (
        <div className="flex flex-col items-center gap-2 py-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="font-display text-base font-semibold text-success">Cajón abierto</p>
        </div>
      )}

      {estado === "error" && (
        <div className="flex flex-col items-center gap-3 py-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
          </div>
          <p className="text-[13.5px] font-medium text-ink-2">{error}</p>
          <button type="button" onClick={onCerrar} className="text-[13px] font-semibold text-ink-2 hover:text-ink">Cerrar</button>
        </div>
      )}
    </Modal>
  );
}
