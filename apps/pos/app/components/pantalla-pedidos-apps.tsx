"use client";
// Panel de pedidos que llegan de Uber Eats / DiDi / Rappi (ADR 0011). Polling cada 10 s como el
// resto del POS. Cada tarjeta muestra el canal, el folio corto, el cliente, los ítems y un
// contador hasta que la app cancele por falta de respuesta.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatosCaja } from "../lib/turno";
import { fmtMxn } from "../lib/turno";
import {
  accionPedidoApp, cambiarPrepUber, etiquetaAlergia, etiquetaApp, etiquetaEstado, etiquetaTienda, leerPedidosApps, leerTiendaUber,
  marcarExpiradosVistos, mensajeErrorTienda, OPCIONES_PAUSA, ordenarPedidos, pausarTiendaUber, pedidoConAlergia, reanudarTiendaUber,
  segundosRestantes, type DuracionPausa, type EstadoTiendaApp, type PedidoApp,
} from "../lib/pedidos-apps";
import { BotonVolver } from "./boton-volver";

const REFRESCO_MS = 10_000;
const REFRESCO_TIENDA_MS = 60_000;
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
  // Tienda de Uber (spec A6): estado cacheado en el servidor; sin conexión → la barra no se pinta.
  const [tienda, setTienda] = useState<EstadoTiendaApp | null>(null);
  const [prep, setPrep] = useState<number | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [ocupadoTienda, setOcupadoTienda] = useState(false);
  const [menuPausa, setMenuPausa] = useState(false);
  const montado = useRef(true);

  const recargarTienda = useCallback(async (forzar = false) => {
    const r = await leerTiendaUber(token, caja.sucursal_id, forzar);
    if (!montado.current) return;
    if (r.ok) { setSinConexion(false); setTienda(r.tienda); if (r.tiempoPrepMin !== undefined) setPrep(r.tiempoPrepMin); }
    else if (r.error === "SIN_CONEXION_UBER") setSinConexion(true);
    else { /* la barra queda en "sin datos" y se reintenta al minuto; los minutos de VIM sí se muestran */
      if (r.tiempoPrepMin !== undefined) setPrep(r.tiempoPrepMin);
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    marcarExpiradosVistos(null);
    recargarTienda();
    const id = setInterval(() => { recargarTienda(); }, REFRESCO_TIENDA_MS);
    return () => clearInterval(id);
  }, [recargarTienda]);

  const accionTienda = async (fn: () => Promise<{ ok: boolean; error?: string; detalle?: string }>) => {
    setOcupadoTienda(true); setError(null); setMenuPausa(false);
    const r = await fn();
    if (!montado.current) return;
    setOcupadoTienda(false);
    if (!r.ok) setError(mensajeErrorTienda(r.error ?? "SIN_DATOS", r.detalle));
  };
  const pausar = (d: DuracionPausa) => accionTienda(async () => {
    const r = await pausarTiendaUber(token, caja.sucursal_id, d);
    if (r.ok && montado.current) setTienda(r.tienda);
    return r;
  });
  const reanudar = () => accionTienda(async () => {
    const r = await reanudarTiendaUber(token, caja.sucursal_id);
    if (r.ok && montado.current) setTienda(r.tienda);
    return r;
  });
  const cambiarPrep = (n: number) => accionTienda(async () => {
    const minutos = Math.min(180, Math.max(1, n));
    const r = await cambiarPrepUber(token, caja.sucursal_id, minutos);
    if (r.ok && montado.current) setPrep(r.tiempoPrepMin);
    return r;
  });

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

      {!sinConexion && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold ${tienda?.estado === "EN_LINEA" ? "text-success" : tienda?.estado === "PAUSADA" ? "text-warning" : "text-ink-3"}`}>
            <span className={`h-2 w-2 rounded-full ${tienda?.estado === "EN_LINEA" ? "bg-success" : tienda?.estado === "PAUSADA" ? "bg-warning" : "bg-ink-3"}`} />
            {etiquetaTienda(tienda)}
          </span>
          {prep !== null && (
            <span className="ml-3 inline-flex items-center gap-1 text-[13.5px] text-ink-2">
              Prep:
              <button type="button" aria-label="Menos 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep - 5)}
                className="h-11 w-11 rounded border border-line-strong text-[16px] font-semibold text-ink transition hover:bg-hover disabled:opacity-50">−5</button>
              <span className="w-[64px] text-center font-semibold text-ink">{prep} min</span>
              <button type="button" aria-label="Más 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep + 5)}
                className="h-11 w-11 rounded border border-line-strong text-[16px] font-semibold text-ink transition hover:bg-hover disabled:opacity-50">+5</button>
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {tienda?.estado === "PAUSADA" ? (
              <button type="button" disabled={ocupadoTienda} onClick={reanudar}
                className="h-11 rounded bg-accent px-4 text-[14px] font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">Reanudar</button>
            ) : (
              <button type="button" disabled={ocupadoTienda} onClick={() => setMenuPausa(true)}
                className="h-11 rounded border border-line-strong px-4 text-[14px] font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">Pausar…</button>
            )}
          </span>
        </div>
      )}

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
            const alergia = pedidoConAlergia(p);
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-2 rounded border-2 bg-surface p-3 ${pendiente ? (urgente || alergia ? "border-danger" : "border-accent") : "border-line"}`}
              >
                {alergia && (
                  <p className="rounded bg-danger px-2 py-1 text-[13px] font-bold uppercase tracking-wide text-white">⚠ Pedido con alergia: revisa cada ítem</p>
                )}
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
                      {etiquetaAlergia(it) && (
                        <span className="mt-0.5 block rounded border border-danger bg-danger-soft px-1.5 py-0.5 text-[12.5px] font-semibold text-danger">{etiquetaAlergia(it)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {p.notaCliente && <p className="text-[13px] italic text-ink-2">“{p.notaCliente}”</p>}
                {p.totalCliente !== null && <p className="text-[13px] text-ink-3">Total en la app: {fmtMxn(p.totalCliente)}</p>}
                {p.ultimoError && (p.estado === "ERROR" || p.estado === "CANCELADO" || p.estado === "EXPIRADO") && (
                  <p className="text-[12px] font-semibold text-danger">{p.ultimoError}</p>
                )}
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

      {menuPausa && (
        <div role="dialog" aria-modal="true" aria-label="Pausar la tienda en Uber" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-line bg-surface p-4">
            <h2 className="mb-1 text-[15px] font-semibold text-ink">¿Cuánto tiempo pausamos Uber Eats?</h2>
            <p className="mb-3 text-[13px] text-ink-2">Uber dejará de mandar pedidos a esta sucursal durante ese tiempo.</p>
            <div className="flex flex-col gap-2">
              {OPCIONES_PAUSA.map((o) => (
                <button key={o.codigo} type="button" disabled={ocupadoTienda} onClick={() => pausar(o.codigo)}
                  className="h-11 rounded border border-line-strong px-3 text-left text-[14px] font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                  {o.label}
                </button>
              ))}
              <button type="button" onClick={() => setMenuPausa(false)} className="mt-1 h-10 text-[13.5px] text-ink-3">Cancelar</button>
            </div>
          </div>
        </div>
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
