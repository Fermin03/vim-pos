"use client";
// Panel de pedidos que llegan de Uber Eats / DiDi / Rappi (ADR 0011). Polling cada 10 s como el
// resto del POS. Cada tarjeta muestra el canal, el folio corto, el cliente, los ítems y un
// contador hasta que la app cancele por falta de respuesta.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatosCaja } from "../lib/turno";
import { fmtMxn } from "../lib/turno";
import {
  accionPedidoApp, etiquetaApp, etiquetaEstado, leerPedidosApps, ordenarPedidos, segundosRestantes,
  type PedidoApp,
} from "../lib/pedidos-apps";
import { BotonVolver } from "./boton-volver";

const REFRESCO_MS = 10_000;
type MotivoRechazo = "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO";
const MOTIVOS: { codigo: MotivoRechazo; label: string }[] = [
  { codigo: "AGOTADO", label: "Producto agotado" },
  { codigo: "SATURADO", label: "Cocina saturada" },
  { codigo: "CERRADO", label: "Ya cerramos" },
  { codigo: "OTRO", label: "Otro motivo" },
];

function mmss(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

function mensajeError(codigo: string, detalle?: string): string {
  switch (codigo) {
    case "SIN_TURNO_ABIERTO": return "Abre el turno para poder aceptar pedidos de apps.";
    case "ITEM_SIN_MAPEAR": return "El pedido trae un producto que no existe en el catálogo. Configura un producto genérico de apps o rechaza.";
    case "YA_PROCESADA": return "La app ya cerró este pedido.";
    case "SIN_RED": return "Sin conexión con la nube. Reintenta en unos segundos.";
    case "UBER_ERROR": return `No se pudo avisar a Uber Eats${detalle ? ` (${detalle})` : ""}. Reintenta; si sigue, revisa la conexión en el panel de administración.`;
    default: return detalle ? `${codigo}: ${detalle}` : codigo;
  }
}

export function PantallaPedidosApps({ token, caja, onSalir }: { token: string; caja: DatosCaja; onSalir: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoApp[] | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<PedidoApp | null>(null);
  const montado = useRef(true);

  const recargar = useCallback(async () => {
    try {
      const lista = ordenarPedidos(await leerPedidosApps(token, caja.sucursal_id));
      if (montado.current) setPedidos(lista);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer los pedidos");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => { montado.current = false; clearInterval(id); };
  }, [recargar]);
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(id); }, []);

  const accion = async (p: PedidoApp, a: "aceptar" | "rechazar" | "listo", motivo?: MotivoRechazo) => {
    setOcupado(p.id); setError(null);
    const r = await accionPedidoApp(token, { pedidoId: p.id, accion: a, motivo });
    if (!montado.current) return;
    setOcupado(null);
    setRechazando(null);
    if (!r.ok) setError(mensajeError(r.error, r.detalle));
    await recargar();
  };

  const pendientes = useMemo(() => (pedidos ?? []).filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR"), [pedidos]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-3.5">
        <BotonVolver onClick={onSalir} />
        <h1 className="text-[17px] font-semibold text-ink">Pedidos de apps</h1>
        {pendientes.length > 0 && (
          <span className="rounded-full bg-danger px-2.5 py-0.5 text-[13px] font-semibold text-white">
            {pendientes.length} por aceptar
          </span>
        )}
        <span className="ml-auto text-[13px] text-ink-3">{caja.sucursalNombre}</span>
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded border border-danger bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{error}</p>
      )}

      {pedidos === null ? (
        <p className="m-auto text-[14px] text-ink-3">Cargando…</p>
      ) : pedidos.length === 0 ? (
        <p className="m-auto text-center text-[14.5px] text-ink-3">
          Sin pedidos de apps por ahora.<br />Aquí aparecen solos cuando llegan.
        </p>
      ) : (
        <ul className="grid flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.map((p) => {
            const seg = p.estado === "RECIBIDO" ? segundosRestantes(p.venceAceptacion, ahora) : null;
            const urgente = seg !== null && seg < 120;
            const pendiente = p.estado === "RECIBIDO" || p.estado === "ERROR";
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-2 rounded border-2 bg-surface p-3 ${pendiente ? (urgente ? "border-danger" : "border-accent") : "border-line"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-2">{etiquetaApp(p.app)}</span>
                  <span className="text-[26px] font-bold leading-none text-ink">{p.folioCorto ?? p.idExterno.slice(-6)}</span>
                </div>
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="font-semibold text-ink">{etiquetaEstado(p.estado)}</span>
                  {seg !== null && (
                    <span className={`font-mono text-[15px] ${urgente ? "font-bold text-danger" : "text-ink-2"}`} aria-label="tiempo para aceptar">
                      {mmss(seg)}
                    </span>
                  )}
                  {p.ticketFolio && <span className="text-ink-3">Ticket {p.ticketFolio}</span>}
                </div>
                {p.clienteNombre && (
                  <p className="text-[13.5px] text-ink">
                    {p.clienteNombre}{p.tipoEntrega === "RECOGE_CLIENTE" ? " · recoge en tienda" : ""}
                  </p>
                )}
                <ul className="text-[13.5px] text-ink">
                  {p.items.map((it, i) => (
                    <li key={i} className={it.mapeado ? "" : "text-danger"}>
                      {it.cantidad} × {it.nombreApp}{it.mapeado ? "" : " (no está en el catálogo)"}
                      {it.modificadores.length > 0 && (
                        <span className="text-ink-3"> · {it.modificadores.map((m) => `${m.cantidad > 1 ? m.cantidad + "× " : ""}${m.nombreApp}`).join(", ")}</span>
                      )}
                      {it.nota && <span className="text-ink-3"> · “{it.nota}”</span>}
                    </li>
                  ))}
                </ul>
                {p.notaCliente && <p className="text-[13px] italic text-ink-2">“{p.notaCliente}”</p>}
                {p.totalCliente !== null && <p className="text-[13px] text-ink-3">Total en la app: {fmtMxn(p.totalCliente)}</p>}
                {p.ultimoError && p.estado === "ERROR" && <p className="text-[12px] text-danger">{p.ultimoError}</p>}
                <div className="mt-auto flex gap-2 pt-1">
                  {pendiente && (
                    <>
                      <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "aceptar")}
                        className="h-11 flex-1 rounded bg-accent text-[14px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">
                        Aceptar
                      </button>
                      <button type="button" disabled={ocupado === p.id} onClick={() => setRechazando(p)}
                        className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                        Rechazar
                      </button>
                    </>
                  )}
                  {(p.estado === "ACEPTADO" || p.estado === "EN_PREPARACION") && (
                    <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "listo")}
                      className="h-11 flex-1 rounded bg-accent text-[14px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">
                      Marcar listo
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rechazando && (
        <div role="dialog" aria-modal="true" aria-label="Motivo del rechazo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-line bg-surface p-4">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">¿Por qué se rechaza {rechazando.folioCorto ?? "el pedido"}?</h2>
            <div className="flex flex-col gap-2">
              {MOTIVOS.map((m) => (
                <button key={m.codigo} type="button" disabled={ocupado === rechazando.id} onClick={() => accion(rechazando, "rechazar", m.codigo)}
                  className="h-11 rounded border border-line-strong px-3 text-left text-[14px] font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                  {m.label}
                </button>
              ))}
              <button type="button" onClick={() => setRechazando(null)} className="mt-1 h-10 text-[13.5px] text-ink-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
