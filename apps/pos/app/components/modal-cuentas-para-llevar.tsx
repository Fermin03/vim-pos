"use client";
import { useEffect, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { fmtMxn } from "../lib/turno";
import { listarCuentasAbiertas, minutosAbierta, type CuentaAbierta } from "../lib/cuentas-abiertas";

/**
 * Cuentas abiertas de "Para llevar": las que tienen folio, no se han cobrado y NO están en espera.
 *
 * Era el único modo sin lista propia. Una cuenta que se quedaba abierta ahí —se abrió el cobro y
 * el cliente se arrepintió, se cerró la caja a media venta— no salía en ninguna pantalla y solo
 * reaparecía al cerrar el turno, trabándolo (Knock-Out, 22 sep 2026).
 *
 * Solo las que tienen folio: un BORRADOR sin folio es un carrito que nunca llegó a ser cuenta.
 */
export async function listarCuentasParaLlevar(token: string, sucursalId: string): Promise<CuentaAbierta[]> {
  return (await listarCuentasAbiertas(token, sucursalId, "PARA_LLEVAR")).filter((c) => c.folio !== null);
}

export function ModalCuentasParaLlevar({
  token,
  sucursalId,
  onAbrir,
  onCerrar,
  procesando,
  error,
}: {
  token: string;
  sucursalId: string;
  onAbrir: (ticketId: string) => void;
  onCerrar: () => void;
  procesando: boolean;
  error: string | null;
}) {
  const [cuentas, setCuentas] = useState<CuentaAbierta[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  useEffect(() => {
    listarCuentasParaLlevar(token, sucursalId)
      .then(setCuentas)
      .catch((e) => setErrorCarga(e instanceof Error ? e.message : "Error"));
  }, [token, sucursalId]);

  return (
    <Modal open onClose={onCerrar} title="Cuentas abiertas · Para llevar" className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
      {(error ?? errorCarga) && <p className="mb-3 text-[13px] font-medium text-danger" role="alert">{error ?? errorCarga}</p>}
      {cuentas === null && !errorCarga && <p className="py-6 text-center text-sm text-ink-3">Cargando…</p>}
      {cuentas !== null && cuentas.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-3">No hay cuentas abiertas de Para llevar.</p>
      )}
      {cuentas !== null && cuentas.length > 0 && (
        <div className="max-h-[55vh] overflow-y-auto rounded border border-line">
          {cuentas.map((c) => {
            const min = minutosAbierta(c.desdeIso);
            return (
              <button
                key={c.ticketId}
                type="button"
                disabled={procesando}
                onClick={() => onAbrir(c.ticketId)}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-hover disabled:opacity-60"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold">{c.cliente ?? c.folio}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {c.nItems} art. · {min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`}
                    {c.cliente ? ` · ${c.folio}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="font-display text-[16px] font-bold tabular-nums">{fmtMxn(c.total)}</span>
                  <span className="rounded bg-ink px-2.5 py-1 text-[12px] font-semibold text-white">Abrir</span>
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
