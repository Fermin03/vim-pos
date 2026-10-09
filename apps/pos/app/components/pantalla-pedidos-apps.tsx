"use client";
// «Pedidos en línea»: lo que llega de Uber Eats / DiDi / Rappi (ADR 0011) y de la tienda propia
// (canal TIENDA). Polling cada 10 s como el resto del POS. Cada tarjeta muestra de dónde viene, el
// folio, el cliente, los ítems y un contador hasta que el pedido se cancele por falta de respuesta.
// La tarjeta se bifurca por `canal`: un pedido de la tienda nunca pinta acciones de las apps.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatosCaja } from "../lib/turno";
import { fmtMxn } from "../lib/turno";
import {
  accionPedidoApp, cambiarPrepUber, etiquetaAlergia, etiquetaApp, etiquetaEstado, etiquetaModificadores, etiquetaTienda, leerPedidosApps,
  leerTiendaUber, marcarExpiradosVistos, mensajeErrorTienda, OPCIONES_PAUSA, ordenarPedidos, pausarTiendaUber, pedidoConAlergia,
  reanudarTiendaUber, segundosRestantes, type DuracionPausa, type EstadoTiendaApp, type PedidoApp, type PedidoAppItem,
} from "../lib/pedidos-apps";
import {
  avisoDeTienda, ErrorEnLinea, etiquetaEntrega, etiquetaEstadoEnLinea, etiquetaOrigen, etiquetaPago, faltaComanda, leerEstadoEnLinea,
  mensajeErrorEnLinea, pausarEnLinea, reanudarEnLinea, soloInformativo, type EstadoEnLinea,
} from "../lib/pedidos-en-linea";
import { esEscritorio } from "../lib/actualizacion";
import { BotonVolver } from "./boton-volver";
import { useEscape } from "../lib/use-escape";

const REFRESCO_MS = 10_000;
const REFRESCO_TIENDA_MS = 60_000;
/** Margen antes de avisar que falta la comanda: la automática sale en el siguiente sondeo (10 s) y
 *  el sello de la base llega un poco después del papel. Sin él, el aviso parpadearía en cada pedido. */
const MARGEN_COMANDA_MS = 20_000;
type MotivoRechazo = "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO";
const MOTIVOS: { codigo: MotivoRechazo; label: string }[] = [
  { codigo: "AGOTADO", label: "Producto agotado" },
  { codigo: "SATURADO", label: "Cocina saturada" },
  { codigo: "CERRADO", label: "Ya cerramos" },
  { codigo: "OTRO", label: "Otro motivo" },
];
/** Pausa de la tienda propia (decisión 6). */
const PAUSAS_EN_LINEA: { codigo: "30m" | "1h" | "indefinida"; label: string }[] = [
  { codigo: "30m", label: "30 minutos" },
  { codigo: "1h", label: "1 hora" },
  { codigo: "indefinida", label: "Hasta que la reanude" },
];
/** Estado de un pedido de la tienda ya cerrado, en palabras de quien cobra. */
const CERRADO_TIENDA: Partial<Record<PedidoApp["estado"], string>> = {
  ENTREGADO: "Entregado", RECHAZADO: "Rechazado", CANCELADO: "Cancelado", EXPIRADO: "Se venció sin aceptar",
};

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

function ListaItems({ items }: { items: PedidoAppItem[] }) {
  return (
    <ul className="text-14 text-ink">
      {items.map((it, i) => (
        <li key={i} className={it.mapeado ? "" : "text-danger"}>
          {it.cantidad} × {it.nombreApp}{it.mapeado ? "" : " (no está en el catálogo)"}
          {it.modificadores.length > 0 && (
            <span className="text-ink-3"> · {etiquetaModificadores(it.modificadores)}</span>
          )}
          {it.nota && <span className="text-ink-3"> · “{it.nota}”</span>}
          {etiquetaAlergia(it) && (
            <span className="mt-0.5 block rounded border border-danger bg-danger-soft px-1.5 py-0.5 text-13 font-semibold text-danger">{etiquetaAlergia(it)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Cuerpo de la tarjeta de un pedido de la tienda propia. Sin «Marcar listo» (decisión 2): el
 *  estado avanza solo cuando el cajero imprime, asigna repartidor o cobra desde la cuenta. */
function CuerpoTienda({ p, seg, urgente, informativo, sinComanda, ocupado, onImprimirComanda }: {
  p: PedidoApp; seg: number | null; urgente: boolean;
  /** En la caja instalada, un pedido que se atiende desde el POS web: aquí solo se ve. */
  informativo: boolean;
  /** Aceptado, con ticket, y la comanda lleva rato sin salir. */
  sinComanda: boolean; ocupado: boolean; onImprimirComanda: () => void;
}) {
  const aDomicilio = p.app === "DELIVERY_PROPIO";
  const aceptado = p.estado === "ACEPTADO" || p.estado === "EN_PREPARACION" || p.estado === "LISTO";
  const pago = etiquetaPago(p);
  const aviso = avisoDeTienda(p);
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-13 font-semibold text-ink-2">{etiquetaOrigen(p)} · {etiquetaEntrega(p)}</span>
        <span className="text-28 font-bold leading-none text-ink">{p.folioCorto ?? p.idExterno.slice(-6)}</span>
      </div>
      <div className="flex items-center justify-between text-14">
        <span className="font-semibold text-ink">
          {aceptado ? "Aceptado" : CERRADO_TIENDA[p.estado] ?? "Por aceptar"}{p.ticketFolio && p.estado !== "RECIBIDO" ? ` · Ticket ${p.ticketFolio}` : ""}
        </span>
        {seg !== null && (
          <span className={`font-mono text-15 ${urgente ? "font-bold text-danger" : "text-ink-2"}`} aria-label="tiempo para aceptar">
            {mmss(seg)}
          </span>
        )}
      </div>
      {informativo
        ? (aceptado || p.estado === "RECIBIDO" || p.estado === "ERROR") && (
          <p className="rounded bg-sel px-2 py-1.5 text-13 text-ink-2">Se atiende desde el POS web.</p>
        )
        : aceptado && p.ticketId && (
          <p className="rounded bg-sel px-2 py-1.5 text-13 text-ink-2">Cóbralo desde {aDomicilio ? "Domicilio" : "Pick-up"}.</p>
        )}
      {sinComanda && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded border border-danger bg-danger-soft px-2 py-1.5">
          <p className="flex-1 text-13 font-semibold text-danger">La comanda no se imprimió. Revisa la impresora.</p>
          <button type="button" disabled={ocupado} onClick={onImprimirComanda}
            className="h-11 rounded border border-danger bg-surface px-3 text-14 font-semibold text-danger transition active:scale-[.97] disabled:opacity-50">
            Imprimir comanda
          </button>
        </div>
      )}
      {aviso && <p className="text-13 font-semibold text-danger">{aviso}</p>}
      {(p.clienteNombre || p.clienteTelefono) && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-14 text-ink">
          {p.clienteNombre && <span className="font-semibold">{p.clienteNombre}</span>}
          {/* Dentro de la caja instalada un enlace `tel:` no abre nada: va como texto. */}
          {p.clienteTelefono && (esEscritorio()
            ? <span className="font-semibold tabular-nums">{p.clienteTelefono}</span>
            : <a href={`tel:${p.clienteTelefono}`} className="inline-flex min-h-11 items-center font-semibold tabular-nums text-info underline-offset-2 hover:underline">{p.clienteTelefono}</a>
          )}
        </p>
      )}
      {p.direccion && (
        <div className="text-13 leading-snug">
          <p className="text-ink-2">{p.direccion.texto}</p>
          {p.direccion.referencias && <p className="text-ink-3">Referencias: {p.direccion.referencias}</p>}
        </div>
      )}
      <ListaItems items={p.items} />
      {p.notaCliente && <p className="text-13 italic text-ink-2">“{p.notaCliente}”</p>}
      <dl className="mt-auto border-t border-line pt-2 text-13 text-ink-2">
        {p.envio !== null && p.envio > 0 && (
          <div className="flex justify-between"><dt>Envío</dt><dd className="font-display font-bold tabular-nums text-ink">{fmtMxn(p.envio)}</dd></div>
        )}
        {p.totalCliente !== null && (
          <div className="flex items-baseline justify-between text-ink">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-18 font-bold tabular-nums">{fmtMxn(p.totalCliente)}</dd>
          </div>
        )}
        {pago && <div className="flex justify-between"><dt>Forma de pago</dt><dd className="font-semibold text-ink">{pago}</dd></div>}
      </dl>
    </>
  );
}

export function PantallaPedidosApps({ token, caja, hayApps, hayTienda, cajaSinActualizar = false, onCambio, onImprimirComanda, onSalir }: {
  token: string; caja: DatosCaja;
  /** POS web: la caja instalada de la sucursal aún no atiende la tienda; la barra lo dice. */
  cajaSinActualizar?: boolean;
  /** Módulo de apps de delivery encendido: pinta la barra de Uber. */
  hayApps: boolean;
  /** Módulo de tienda en línea encendido: pinta la barra de la tienda propia. */
  hayTienda: boolean;
  /** Se aceptó o rechazó algo: quien sondea desde fuera (timbre, comandas) relee ya. */
  onCambio?: () => void;
  /** Imprime desde este dispositivo la comanda completa del pedido; dice si salió el papel. */
  onImprimirComanda: (p: PedidoApp) => Promise<boolean>;
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
  /** Desde cuándo se ve cada pedido aceptado sin comanda (para el margen del aviso). */
  const sinComandaDesde = useRef(new Map<string, number>());

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
      const lista = ordenarPedidos(await leerPedidosApps(token, caja.sucursal_id));
      const desde = sinComandaDesde.current;
      const faltan = new Set(lista.filter(faltaComanda).map((p) => p.id));
      for (const id of desde.keys()) if (!faltan.has(id)) desde.delete(id);
      for (const id of faltan) if (!desde.has(id)) desde.set(id, Date.now());
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
    // Un pedido de la tienda no tiene «listo» (la nube responde ACCION_INVALIDA): ni se intenta.
    if (p.canal === "TIENDA" && a === "listo") return;
    setOcupado(p.id); setError(null);
    const r = await accionPedidoApp(token, { pedidoId: p.id, accion: a, motivo });
    if (!montado.current) return;
    setOcupado(null);
    setRechazando(null);
    if (!r.ok) setError(p.canal === "TIENDA" ? mensajeErrorEnLinea(r.error) : mensajeError(r.error, r.detalle));
    // Con éxito o con error se relee: el pedido pudo cambiar por su cuenta (venció, lo tomó otra caja).
    await recargar();
    onCambio?.();
  };

  const imprimirComanda = async (p: PedidoApp) => {
    setOcupado(p.id); setError(null);
    const salio = await onImprimirComanda(p);
    if (!montado.current) return;
    setOcupado(null);
    // Con papel, el sello de la base tarda un instante: el margen empieza de nuevo para no avisar en falso.
    if (salio) sinComandaDesde.current.set(p.id, Date.now());
    else setError("No se pudo imprimir la comanda. Revisa la impresora e inténtalo de nuevo.");
    await recargar();
  };

  const enCaja = esEscritorio();
  const pendientes = useMemo(() => (pedidos ?? []).filter((p) => (p.estado === "RECIBIDO" || p.estado === "ERROR") && !soloInformativo(p, enCaja)), [pedidos, enCaja]);
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

      {hayTienda && !sinTiendaPropia && (
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

      {pedidos === null ? (
        <p className="m-auto text-14 text-ink-3">Cargando…</p>
      ) : pedidos.length === 0 ? (
        <p className="m-auto text-center text-15 text-ink-3">
          Sin pedidos en línea por ahora.<br />Aquí aparecen solos cuando llegan.
        </p>
      ) : (
        <ul className="grid flex-1 auto-rows-min grid-cols-1 content-start gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.map((p) => {
            const seg = p.estado === "RECIBIDO" ? segundosRestantes(p.venceAceptacion, ahora) : null;
            const urgente = seg !== null && seg < 120;
            // En la caja, lo que se atiende desde el POS web no se acepta ni se rechaza aquí.
            const informativo = soloInformativo(p, enCaja);
            const pendiente = (p.estado === "RECIBIDO" || p.estado === "ERROR") && !informativo;
            const alergia = pedidoConAlergia(p);
            const deTienda = p.canal === "TIENDA";
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-2 rounded border-2 bg-surface p-3 ${pendiente ? (urgente || alergia ? "border-danger" : "border-accent") : "border-line"}`}
              >
                {alergia && (
                  <p className="rounded bg-danger px-2 py-1 text-13 font-bold uppercase tracking-wide text-white">⚠ Pedido con alergia: revisa cada ítem</p>
                )}
                {deTienda ? (
                  <CuerpoTienda p={p} seg={seg} urgente={urgente} informativo={informativo} ocupado={ocupado === p.id} onImprimirComanda={() => imprimirComanda(p)}
                    sinComanda={!informativo && faltaComanda(p) && ahora.getTime() - (sinComandaDesde.current.get(p.id) ?? Infinity) > MARGEN_COMANDA_MS} />
                ) : (
                  <>
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
                  </>
                )}
                <div className={`flex gap-2 pt-1 ${deTienda ? "" : "mt-auto"}`}>
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
                  {!deTienda && (p.estado === "ACEPTADO" || p.estado === "EN_PREPARACION") && (
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
            <div className="flex flex-col gap-2">
              {MOTIVOS.map((m) => (
                <button key={m.codigo} type="button" disabled={ocupado === rechazando.id} onClick={() => accion(rechazando, "rechazar", m.codigo)}
                  className="h-11 rounded border border-line-strong px-3 text-left text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover disabled:opacity-50">
                  {m.label}
                </button>
              ))}
              <button type="button" onClick={() => setRechazando(null)} className="mt-1 h-10 text-14 text-ink-3">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
