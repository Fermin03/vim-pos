"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { listarTicketsEnEspera, minutosEnEspera, type TicketEnEspera } from "../lib/espera";

/**
 * D45 §12 — Pedidos en espera.
 *  - ModalEtiquetaEspera: pide la etiqueta ("Cliente camisa azul") al guardar el pedido.
 *  - ModalListaEspera: lista los tickets en espera de la caja para retomarlos.
 */

export function ModalEtiquetaEspera({
  onConfirmar,
  onCerrar,
  procesando,
  error,
}: {
  onConfirmar: (etiqueta: string) => void;
  onCerrar: () => void;
  procesando: boolean;
  error: string | null;
}) {
  const [etiqueta, setEtiqueta] = useState("");
  const lista = etiqueta.trim().length > 0;

  return (
    <Modal open onClose={onCerrar} title="Poner pedido en espera">
      <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
        El pedido se guarda con su cuenta y lo retomas en cualquier momento desde <b>En espera</b>.
        Ponle una etiqueta para identificar al cliente.
      </p>
      <input
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        maxLength={100}
        placeholder='P. ej. "Cliente camisa azul" o "Pedido de Laura"'
        className="h-12 w-full rounded border border-line-strong px-3 text-[15px] outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
        onKeyDown={(e) => { if (e.key === "Enter" && lista && !procesando) onConfirmar(etiqueta); }}
      />
      {error && <p className="mt-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCerrar} disabled={procesando}>Cancelar</Button>
        <Button className="flex-1" onClick={() => onConfirmar(etiqueta)} disabled={!lista || procesando}>
          {procesando ? "Guardando…" : "Poner en espera"}
        </Button>
      </div>
    </Modal>
  );
}

export function ModalListaEspera({
  token,
  cajaId,
  onRetomar,
  onCerrar,
  procesando,
  error,
}: {
  token: string;
  cajaId: string;
  onRetomar: (ticketId: string) => void;
  onCerrar: () => void;
  procesando: boolean;
  error: string | null;
}) {
  const [tickets, setTickets] = useState<TicketEnEspera[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => {
    listarTicketsEnEspera(token, cajaId)
      .then(setTickets)
      .catch((e) => setErrorCarga(e instanceof Error ? e.message : "Error"));
  }, [token, cajaId]);

  return (
    <Modal open onClose={onCerrar} title="Pedidos en espera" className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
      {(error ?? errorCarga) && <p className="mb-3 text-[13px] font-medium text-danger" role="alert">{error ?? errorCarga}</p>}
      {tickets === null && !errorCarga && <p className="py-6 text-center text-sm text-ink-3">Cargando…</p>}
      {tickets !== null && tickets.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-3">No hay pedidos en espera en esta caja.</p>
      )}
      {tickets !== null && tickets.length > 0 && (
        <div className="max-h-[55vh] overflow-y-auto rounded border border-line">
          {tickets.map((t) => {
            const min = minutosEnEspera(t.desdeIso);
            return (
              <button
                key={t.ticketId}
                type="button"
                disabled={procesando}
                onClick={() => onRetomar(t.ticketId)}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-hover disabled:opacity-60"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold">{t.etiqueta}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {t.nItems} art. · {min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`}
                    {t.folio ? ` · ${t.folio}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="font-display text-[16px] font-bold tabular-nums">{fmtMxn(t.total)}</span>
                  <span className="rounded bg-ink px-2.5 py-1 text-[12px] font-semibold text-white">Retomar</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4">
        <Button variant="ghost" className="w-full" onClick={onCerrar} disabled={procesando}>Cerrar</Button>
      </div>
    </Modal>
  );
}
