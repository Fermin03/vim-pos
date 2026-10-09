"use client";
// «Pedidos en línea»: lo que llega de Uber Eats / DiDi / Rappi (ADR 0011), y desde dónde se pausa
// cada tienda (la de Uber y la propia). Polling cada 10 s como el resto del POS. Cada tarjeta muestra
// de dónde viene, el folio, el cliente, los ítems y un contador hasta que el pedido se cancele por
// falta de respuesta.
// Los pedidos de la tienda propia (canal TIENDA) NO se listan aquí: cada uno llega a su canal,
// Pick-up o Domicilio (pantalla-cuentas-modo.tsx), y se anuncia con el aviso grande.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatosCaja } from "../lib/turno";
import { fmtMxn } from "../lib/turno";
import {
  accionPedidoApp, cambiarPrepUber, etiquetaApp, etiquetaEstado, etiquetaTienda, leerPedidosApps,
  leerTiendaUber, marcarExpiradosVistos, mensajeErrorTienda, OPCIONES_PAUSA, ordenarPedidos, pausarTiendaUber, pedidoConAlergia,
  reanudarTiendaUber, segundosRestantes, type DuracionPausa, type EstadoTiendaApp, type PedidoApp,
} from "../lib/pedidos-apps";
import { ErrorEnLinea, etiquetaEstadoEnLinea, leerEstadoEnLinea, mensajeErrorEnLinea, pausarEnLinea, reanudarEnLinea, type EstadoEnLinea } from "../lib/pedidos-en-linea";
import { BotonVolver } from "./boton-volver";
import { esUrgente, ListaItems, mmss, MotivosRechazo, type MotivoRechazo } from "./pedido-tienda";
import { useEscape } from "../lib/use-escape";

const REFRESCO_MS = 10_000;
const REFRESCO_TIENDA_MS = 60_000;
/** Pausa de la tienda propia (decisión 6). */
const PAUSAS_EN_LINEA: { codigo: "30m" | "1h" | "indefinida"; label: string }[] = [
  { codigo: "30m", label: "30 minutos" },
  { codigo: "1h", label: "1 hora" },
  { codigo: "indefinida", label: "Hasta que la reanude" },
];

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

export function PantallaPedidosApps({ token, caja, hayApps, hayTienda, cajaSinActualizar = false, onCambio, onSalir }: {
  token: string; caja: DatosCaja;
  /** POS web: la caja instalada de la sucursal aún no atiende la tienda; la barra lo dice. */
  cajaSinActualizar?: boolean;
  /** Módulo de apps de delivery encendido: pinta la barra de Uber y sus pedidos. */
  hayApps: boolean;
  /** Módulo de tienda en línea encendido: pinta la barra de la tienda propia. */
  hayTienda: boolean;
  /** Se aceptó o rechazó algo: quien sondea desde fuera (timbre, contador del inicio) relee ya. */
  onCambio?: () => void;
  onSalir: () => void;
}) {
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
  // Tienda propia. `null` = todavía no se sabe (o no se pudo leer); `sinTiendaPropia` = esta
  // sucursal no tiene tienda, y entonces la barra no se pinta.
  const [enLinea, setEnLinea] = useState<EstadoEnLinea | null>(null);
  const [sinTiendaPropia, setSinTiendaPropia] = useState(false);
  const [ocupadoEnLinea, setOcupadoEnLinea] = useState(false);
  const [menuPausa, setMenuPausa] = useState<"uber" | "tienda" | null>(null);
  // Los dos diálogos (motivo del rechazo, pausar la tienda) se cierran antes de salir.
  useEscape(rechazando ? () => setRechazando(null) : menuPausa ? () => setMenuPausa(null) : onSalir);
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
    if (!hayApps) return;
    recargarTienda();
    const id = setInterval(() => { recargarTienda(); }, REFRESCO_TIENDA_MS);
    return () => clearInterval(id);
  }, [recargarTienda, hayApps]);

  const recargarEnLinea = useCallback(async () => {
    try {
      const e = await leerEstadoEnLinea(token, caja.sucursal_id);
      if (!montado.current) return;
      setSinTiendaPropia(e === null);
      setEnLinea(e);
    } catch { /* la barra conserva lo último que supo y se reintenta al minuto */ }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    if (!hayTienda) return;
    recargarEnLinea();
    const id = setInterval(recargarEnLinea, REFRESCO_TIENDA_MS);
    return () => clearInterval(id);
  }, [recargarEnLinea, hayTienda]);

  const accionEnLinea = async (fn: () => Promise<EstadoEnLinea>) => {
    setOcupadoEnLinea(true); setError(null); setMenuPausa(null);
    try {
      const e = await fn();
      if (montado.current) setEnLinea(e);
    } catch (e) {
      if (montado.current) setError(mensajeErrorEnLinea(e instanceof ErrorEnLinea ? e.codigo : ""));
      // Tras un fallo no se sabe cómo quedó: se relee en vez de suponer.
      await recargarEnLinea();
    }
    if (montado.current) setOcupadoEnLinea(false);
  };

  const accionTienda = async (fn: () => Promise<{ ok: boolean; error?: string; detalle?: string }>) => {
    setOcupadoTienda(true); setError(null); setMenuPausa(null);
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
      // Solo las apps: lo de la tienda propia vive en Pick-up y en Domicilio.
      const lista = ordenarPedidos((await leerPedidosApps(token, caja.sucursal_id)).filter((p) => p.canal === "APP"));
      if (montado.current) setPedidos(lista);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer los pedidos");
    }
  }, [token, caja.sucursal_id]);

  useEffect(() => {
    montado.current = true;
    // Sin apps no hay tarjetas que leer: la pantalla queda para pausar la tienda.
    if (!hayApps) return () => { montado.current = false; };
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => { montado.current = false; clearInterval(id); };
  }, [recargar, hayApps]);
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(id); }, []);

  const accion = async (p: PedidoApp, a: "aceptar" | "rechazar" | "listo", motivo?: MotivoRechazo) => {
    setOcupado(p.id); setError(null);
    const r = await accionPedidoApp(token, { pedidoId: p.id, accion: a, motivo });
    if (!montado.current) return;
    setOcupado(null);
    setRechazando(null);
    if (!r.ok) setError(mensajeError(r.error, r.detalle));
    // Con éxito o con error se relee: el pedido pudo cambiar por su cuenta (venció, lo tomó otra caja).
    await recargar();
    onCambio?.();
  };

  const pendientes = useMemo(() => (pedidos ?? []).filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR"), [pedidos]);
  /** Esta sucursal vende en su tienda propia: sus pedidos llegan a su canal, y aquí se dice. */
  const conTiendaPropia = hayTienda && !sinTiendaPropia;
  const DONDE_LLEGAN = "Tus pedidos en línea llegan a Pick-up y a Domicilio.";
  const estadoEnLinea = enLinea ? etiquetaEstadoEnLinea(enLinea, ahora, cajaSinActualizar) : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-3.5">
        <BotonVolver onClick={onSalir} />
        <h1 className="text-18 font-semibold text-ink">Pedidos en línea</h1>
        {pendientes.length > 0 && (
          <span className="rounded-full bg-danger px-2.5 py-0.5 text-13 font-semibold text-white">
            {pendientes.length} por aceptar
          </span>
        )}
        <span className="ml-auto text-13 text-ink-3">{caja.sucursalNombre}</span>
      </header>

      {conTiendaPropia && (
        <div className="flex min-h-[60px] flex-shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className={`inline-flex items-center gap-1.5 text-14 font-semibold ${estadoEnLinea ? (estadoEnLinea.tono === "ok" ? "text-success" : "text-warning") : "text-ink-3"}`}>
            <span className={`h-2 w-2 rounded-full ${estadoEnLinea ? (estadoEnLinea.tono === "ok" ? "bg-success" : "bg-warning") : "bg-ink-3"}`} />
            {estadoEnLinea?.texto ?? "Tienda: sin datos"}
          </span>
          {enLinea?.participa && (
            <span className="ml-auto flex gap-2">
              {enLinea.motivo === "EN_PAUSA" ? (
                <button type="button" disabled={ocupadoEnLinea} onClick={() => accionEnLinea(() => reanudarEnLinea(token, caja.sucursal_id))}
                  className="h-11 rounded bg-accent px-4 text-14 font-semibold text-white transition hover:bg-accent-hover active:scale-[.97] disabled:opacity-50">Reanudar</button>
              ) : (
                <button type="button" disabled={ocupadoEnLinea} onClick={() => setMenuPausa("tienda")}
                  className="h-11 rounded border border-line-strong px-4 text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover active:scale-[.97] disabled:opacity-50">Pausar…</button>
              )}
            </span>
          )}
        </div>
      )}

      {hayApps && !sinConexion && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <span className={`inline-flex items-center gap-1.5 text-14 font-semibold ${tienda?.estado === "EN_LINEA" ? "text-success" : tienda?.estado === "PAUSADA" ? "text-warning" : "text-ink-3"}`}>
            <span className={`h-2 w-2 rounded-full ${tienda?.estado === "EN_LINEA" ? "bg-success" : tienda?.estado === "PAUSADA" ? "bg-warning" : "bg-ink-3"}`} />
            {etiquetaTienda(tienda)}
          </span>
          {prep !== null && (
            <span className="ml-3 inline-flex items-center gap-1 text-14 text-ink-2">
              Prep:
              <button type="button" aria-label="Menos 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep - 5)}
                className="h-11 w-11 rounded border border-line-strong text-16 font-semibold text-ink transition hover:bg-hover disabled:opacity-50">−5</button>
              <span className="w-[64px] text-center font-semibold text-ink">{prep} min</span>
              <button type="button" aria-label="Más 5 minutos" disabled={ocupadoTienda} onClick={() => cambiarPrep(prep + 5)}
                className="h-11 w-11 rounded border border-line-strong text-16 font-semibold text-ink transition hover:bg-hover disabled:opacity-50">+5</button>
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {tienda?.estado === "PAUSADA" ? (
              <button type="button" disabled={ocupadoTienda} onClick={reanudar}
                className="h-11 rounded bg-accent px-4 text-14 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">Reanudar</button>
            ) : (
              <button type="button" disabled={ocupadoTienda} onClick={() => setMenuPausa("uber")}
                className="h-11 rounded border border-line-strong px-4 text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">Pausar…</button>
            )}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded border border-danger bg-danger-soft px-3 py-2 text-14 text-danger">{error}</p>
      )}

      {!hayApps ? (
        <p className="m-auto max-w-sm px-4 text-center text-15 text-ink-2">{conTiendaPropia ? DONDE_LLEGAN : "Sin pedidos en línea por ahora."}</p>
      ) : pedidos === null ? (
        <p className="m-auto text-14 text-ink-3">Cargando…</p>
      ) : pedidos.length === 0 ? (
        <p className="m-auto text-center text-15 text-ink-3">
          Sin pedidos de apps por ahora.<br />Aquí aparecen solos cuando llegan.
          {conTiendaPropia && <><br /><span className="text-ink-2">{DONDE_LLEGAN}</span></>}
        </p>
      ) : (
        <>
          {conTiendaPropia && <p className="flex-shrink-0 px-4 pt-3 text-13 text-ink-2">{DONDE_LLEGAN}</p>}
          <ul className="grid flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
            {pedidos.map((p) => {
              const seg = p.estado === "RECIBIDO" ? segundosRestantes(p.venceAceptacion, ahora) : null;
              const urgente = esUrgente(seg);
              const pendiente = p.estado === "RECIBIDO" || p.estado === "ERROR";
              const alergia = pedidoConAlergia(p);
              return (
                <li
                  key={p.id}
                  className={`flex flex-col gap-2 rounded border-2 bg-surface p-3 ${pendiente ? (urgente || alergia ? "border-danger" : "border-accent") : "border-line"}`}
                >
                  {alergia && (
                    <p className="rounded bg-danger px-2 py-1 text-13 font-bold uppercase tracking-wide text-white">⚠ Pedido con alergia: revisa cada ítem</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-13 font-semibold uppercase tracking-wide text-ink-2">{etiquetaApp(p.app)}</span>
                    <span className="text-28 font-bold leading-none text-ink">{p.folioCorto ?? p.idExterno.slice(-6)}</span>
                  </div>
                  <div className="flex items-center justify-between text-14">
                    <span className="font-semibold text-ink">{etiquetaEstado(p.estado)}</span>
                    {seg !== null && (
                      <span className={`font-mono text-15 ${urgente ? "font-bold text-danger" : "text-ink-2"}`} aria-label="tiempo para aceptar">
                        {mmss(seg)}
                      </span>
                    )}
                    {p.ticketFolio && <span className="text-ink-3">Ticket {p.ticketFolio}</span>}
                  </div>
                  {p.clienteNombre && (
                    <p className="text-14 text-ink">
                      {p.clienteNombre}{p.tipoEntrega === "RECOGE_CLIENTE" ? " · recoge en tienda" : ""}
                    </p>
                  )}
                  <ListaItems items={p.items} />
                  {p.notaCliente && <p className="text-13 italic text-ink-2">“{p.notaCliente}”</p>}
                  {p.totalCliente !== null && <p className="text-13 text-ink-3">Total en la app: {fmtMxn(p.totalCliente)}</p>}
                  {p.ultimoError && (p.estado === "ERROR" || p.estado === "CANCELADO" || p.estado === "EXPIRADO") && (
                    <p className="text-12 font-semibold text-danger">{p.ultimoError}</p>
                  )}
                  <div className="mt-auto flex gap-2 pt-1">
                    {pendiente && (
                      <>
                        <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "aceptar")}
                          className="h-11 flex-1 rounded bg-accent text-14 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">
                          Aceptar
                        </button>
                        <button type="button" disabled={ocupado === p.id} onClick={() => setRechazando(p)}
                          className="h-11 rounded border border-line-strong px-4 text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                          Rechazar
                        </button>
                      </>
                    )}
                    {(p.estado === "ACEPTADO" || p.estado === "EN_PREPARACION") && (
                      <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "listo")}
                        className="h-11 flex-1 rounded bg-accent text-14 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50">
                        Marcar listo
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {menuPausa === "uber" && (
        <div role="dialog" aria-modal="true" aria-label="Pausar la tienda en Uber" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-line bg-surface p-4">
            <h2 className="mb-1 text-15 font-semibold text-ink">¿Cuánto tiempo pausamos Uber Eats?</h2>
            <p className="mb-3 text-13 text-ink-2">Uber dejará de mandar pedidos a esta sucursal durante ese tiempo.</p>
            <div className="flex flex-col gap-2">
              {OPCIONES_PAUSA.map((o) => (
                <button key={o.codigo} type="button" disabled={ocupadoTienda} onClick={() => pausar(o.codigo)}
                  className="h-11 rounded border border-line-strong px-3 text-left text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                  {o.label}
                </button>
              ))}
              <button type="button" onClick={() => setMenuPausa(null)} className="mt-1 h-10 text-14 text-ink-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {menuPausa === "tienda" && (
        <div role="dialog" aria-modal="true" aria-label="Pausar la tienda en línea" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-line bg-surface p-4">
            <h2 className="mb-1 text-15 font-semibold text-ink">¿Cuánto tiempo pausamos tu tienda?</h2>
            <p className="mb-3 text-13 text-ink-2">Tus clientes verán que por ahora no se reciben pedidos. Los que ya llegaron se atienden igual.</p>
            <div className="flex flex-col gap-2">
              {PAUSAS_EN_LINEA.map((o) => (
                <button key={o.codigo} type="button" disabled={ocupadoEnLinea} onClick={() => accionEnLinea(() => pausarEnLinea(token, caja.sucursal_id, o.codigo))}
                  className="h-11 rounded border border-line-strong px-3 text-left text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover active:scale-[.97] disabled:opacity-50">
                  {o.label}
                </button>
              ))}
              <button type="button" onClick={() => setMenuPausa(null)} className="mt-1 h-11 text-14 text-ink-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {rechazando && (
        <div role="dialog" aria-modal="true" aria-label="Motivo del rechazo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded border border-line bg-surface p-4">
            <h2 className="mb-3 text-15 font-semibold text-ink">¿Por qué se rechaza {rechazando.folioCorto ?? "el pedido"}?</h2>
            <MotivosRechazo ocupado={ocupado === rechazando.id} onElegir={(m) => accion(rechazando, "rechazar", m)} onCancelar={() => setRechazando(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
