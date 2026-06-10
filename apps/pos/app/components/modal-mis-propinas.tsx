"use client";
import { useEffect, useState } from "react";
import { Modal } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { misPropinas, type MisPropinas } from "../lib/mesero";

export function ModalMisPropinas({ token, meseroId, meseroNombre, onCerrar }: { token: string; meseroId: string; meseroNombre: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<MisPropinas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    misPropinas(token, meseroId).then(setDatos).catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [token, meseroId]);

  return (
    <Modal open onClose={onCerrar} title="Mis propinas" hideTitle
      className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Mis propinas</h2>
          <p className="text-[13px] text-ink-3">{meseroNombre} · Turno de hoy</p>
        </div>
        <span className="rounded-full bg-sel px-2.5 py-1 text-[11px] font-semibold text-ink-3">Solo lectura</span>
      </div>

      {error ? (
        <p className="py-6 text-center text-sm text-danger">{error}</p>
      ) : !datos ? (
        <p className="py-6 text-center text-[13px] text-ink-3">Cargando…</p>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-[#FBF0EC] px-5 py-6 text-center">
            <div className="text-[12.5px] font-medium uppercase tracking-wide text-ink-3">Propinas acumuladas hoy</div>
            <div className="mt-1 font-display text-[40px] font-bold tabular-nums text-accent">{fmtMxn(datos.totalMxn)}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-center">
              <div className="font-display text-[20px] font-bold tabular-nums">{fmtMxn(datos.totalVendidoMxn)}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-3">Vendido hoy</div>
            </div>
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-center">
              <div className="font-display text-[20px] font-bold tabular-nums">{fmtMxn(datos.promedioMxn)}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-3">Ticket promedio</div>
            </div>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
            Este es el total que <b className="text-ink-2">tú generaste</b>. El monto final que recibes se define en el
            <b className="text-ink-2"> reparto al cierre del turno</b>, según la política del restaurante.
          </p>
        </>
      )}
    </Modal>
  );
}
