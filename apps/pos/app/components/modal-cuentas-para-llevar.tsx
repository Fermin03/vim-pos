"use client";
import { useEffect, useState } from "react";
import { listarCuentasAbiertas, type CuentaAbierta } from "../lib/cuentas-abiertas";
import { ModalListaTickets } from "./modal-espera";

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
    <ModalListaTickets
      titulo="Cuentas abiertas · Para llevar"
      vacio="No hay cuentas abiertas de Para llevar."
      verbo="Abrir"
      filas={cuentas?.map((c) => ({ ticketId: c.ticketId, titulo: c.cliente ?? c.folio ?? "", nItems: c.nItems, desdeIso: c.desdeIso, pie: c.cliente ? c.folio : null, total: c.total })) ?? null}
      error={error}
      errorCarga={errorCarga}
      procesando={procesando}
      onElegir={(f) => onAbrir(f.ticketId)}
      onCerrar={onCerrar}
    />
  );
}
