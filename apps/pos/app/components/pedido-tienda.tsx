"use client";
// Un pedido de la tienda en línea, tal como lo ve quien cobra: su detalle (lo usan la lista de
// Pick-up / Domicilio y el aviso grande), los motivos para rechazarlo y el aviso que aparece encima
// de cualquier pantalla cuando llega uno. Aquí solo se pinta: qué pedido se puede atender, la fila
// del aviso y los textos salen de lib/pedidos-en-linea.ts.
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { esEscritorio } from "../lib/actualizacion";
import { etiquetaAlergia, etiquetaModificadores, pedidoConAlergia, segundosRestantes, type PedidoApp, type PedidoAppItem } from "../lib/pedidos-apps";
import { colaDeAvisos, etiquetaEntrega, etiquetaPago } from "../lib/pedidos-en-linea";
import { fmtMxn } from "../lib/turno";

export type MotivoRechazo = "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO";
/** Lista cerrada: el cliente ve el motivo en su seguimiento, así que no hay texto libre. */
export const MOTIVOS_RECHAZO: { codigo: MotivoRechazo; label: string }[] = [
  { codigo: "AGOTADO", label: "Producto agotado" },
  { codigo: "SATURADO", label: "Cocina saturada" },
  { codigo: "CERRADO", label: "Ya cerramos" },
  { codigo: "OTRO", label: "Otro motivo" },
];

/**
 * Lo que hace ESTE dispositivo con un pedido de la tienda. `mensaje` ya viene en palabras de caja.
 * `enCanal`: el fallo ya quedó escrito en la franja de avisos de su canal (el pedido se canceló al
 * intentar aceptarlo): quien esté pintando esa lista no necesita repetirlo.
 */
export type AccionTienda = (p: PedidoApp, accion: "aceptar" | "rechazar", motivo?: MotivoRechazo) => Promise<{ ok: true; ticketId?: string } | { ok: false; mensaje: string; enCanal?: boolean }>;

export function mmss(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

/** Menos de dos minutos para aceptar: el tiempo se pinta en rojo. */
const URGENTE_SEG = 120;
export const esUrgente = (seg: number | null): boolean => seg !== null && seg < URGENTE_SEG;

/** `max`: cuántos renglones enseñar antes de resumir («y 3 productos más»). Sin él, todos. */
export function ListaItems({ items, max }: { items: PedidoAppItem[]; max?: number }) {
  const visibles = max !== undefined && items.length > max ? items.slice(0, max) : items;
  const resto = items.length - visibles.length;
  return (
    <ul className="text-14 text-ink">
      {visibles.map((it, i) => (
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
      {resto > 0 && <li className="mt-1 font-semibold text-ink-2">y {resto} {resto === 1 ? "producto más" : "productos más"}</li>}
    </ul>
  );
}

/** Los cuatro motivos, uno por botón. El marco (diálogo, título) lo pone quien lo usa. */
export function MotivosRechazo({ ocupado, onElegir, onCancelar }: { ocupado: boolean; onElegir: (m: MotivoRechazo) => void; onCancelar: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      {MOTIVOS_RECHAZO.map((m) => (
        <button key={m.codigo} type="button" disabled={ocupado} onClick={() => onElegir(m.codigo)}
          className="h-11 rounded border border-line-strong px-3 text-left text-14 font-semibold text-ink transition hover:border-ink hover:bg-hover active:scale-[.97] disabled:opacity-50">
          {m.label}
        </button>
      ))}
      <button type="button" onClick={onCancelar} className="mt-1 h-11 text-14 text-ink-3">Cancelar</button>
    </div>
  );
}

/**
 * Lo que trae el pedido: a quién y a dónde, qué pidió, cuánto es y cómo paga. Sin encabezado ni
 * botones: eso cambia entre la lista del canal y el aviso.
 */
export function DetallePedidoTienda({ p, maxItems }: { p: PedidoApp; maxItems?: number }) {
  const pago = etiquetaPago(p);
  return (
    <div className="flex flex-col gap-3">
      {pedidoConAlergia(p) && (
        <p className="rounded bg-danger px-2 py-1 text-13 font-bold text-white">Pedido con alergia: revisa cada producto</p>
      )}
      {(p.clienteNombre || p.clienteTelefono) && (
        <p className="flex flex-wrap items-baseline gap-x-3 text-15 text-ink">
          {p.clienteNombre && <span className="font-semibold">{p.clienteNombre}</span>}
          {/* Dentro de la caja instalada un enlace `tel:` no abre nada: va como texto. */}
          {p.clienteTelefono && (esEscritorio()
            ? <span className="font-semibold tabular-nums">{p.clienteTelefono}</span>
            : <a href={`tel:${p.clienteTelefono}`} className="inline-flex min-h-11 items-center font-semibold tabular-nums text-info underline-offset-2 hover:underline">{p.clienteTelefono}</a>
          )}
        </p>
      )}
      {p.direccion && (
        <div className="text-14 leading-snug">
          <p className="text-ink-2">{p.direccion.texto}</p>
          {p.direccion.referencias && <p className="text-ink-3">Referencias: {p.direccion.referencias}</p>}
        </div>
      )}
      <ListaItems items={p.items} max={maxItems} />
      {p.notaCliente && (
        <p className="rounded border border-warning-line bg-warning-soft px-2 py-1.5 text-14 leading-snug text-ink">
          <span className="font-semibold">Nota del cliente:</span> {p.notaCliente}
        </p>
      )}
      <dl className="border-t border-line pt-2 text-14 text-ink-2">
        {p.envio !== null && p.envio > 0 && (
          <div className="flex justify-between"><dt>Envío</dt><dd className="font-display font-bold tabular-nums text-ink">{fmtMxn(p.envio)}</dd></div>
        )}
        {p.totalCliente !== null && (
          <div className="flex items-baseline justify-between text-ink">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-24 font-bold tabular-nums">{fmtMxn(p.totalCliente)}</dd>
          </div>
        )}
        {pago && <div className="flex justify-between"><dt>Forma de pago</dt><dd className="font-semibold text-ink">{pago}</dd></div>}
      </dl>
    </div>
  );
}

/** Renglones que caben en el aviso sin que tape media pantalla; el resto se resume. */
const ITEMS_EN_AVISO = 5;

/**
 * El aviso grande: se pinta encima de lo que haya (el inicio, la venta, un cobro) sin cerrarlo.
 *
 * El foco va a la ×, nunca a Aceptar ni a Rechazar: el cajero puede estar tecleando un importe y un
 * Enter que venía para el cobro no debe aceptar ni rechazar un pedido. Al pasar al siguiente pedido
 * de la fila el foco vuelve a la × por lo mismo. Escape cierra (lo atiende `Modal`, que es quien
 * está más arriba; `home-pos` lo declara como capa que cede).
 *
 * Mientras está abierto, el teclado es SUYO. El teclado numérico del cobro y el del PIN escuchan en
 * `window`: sin esto, con el aviso encima, Enter cobraba por detrás y los dígitos seguían entrando
 * al importe tapado. Un oyente en fase de CAPTURA corta la tecla antes de que llegue a ellos (mismo
 * patrón que `modal-combo.tsx`). Pasan Escape y Tab, que son del `Modal` (cerrar y recorrer los
 * botones). No lleva `preventDefault`: Enter y Espacio siguen activando el botón enfocado.
 */
function AvisoPedidoTienda({ p, posicion, total, ahora, ocupado, onAceptar, onRechazar, onVerOrden, onCerrar }: {
  p: PedidoApp; posicion: number; total: number; ahora: Date; ocupado: boolean;
  onAceptar: () => void; onRechazar: (m: MotivoRechazo) => void; onVerOrden: () => void; onCerrar: () => void;
}) {
  const [rechazando, setRechazando] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);
  // El foco llega solo a la ×: su anillo se enseña hasta que alguien recorre los botones con Tab.
  const [anillo, setAnillo] = useState(false);
  useEffect(() => { setRechazando(false); cerrar.current?.focus(); }, [p.id]);
  useEffect(() => {
    const soloAqui = (e: KeyboardEvent) => { if (e.key === "Tab") setAnillo(true); else if (e.key !== "Escape") e.stopPropagation(); };
    window.addEventListener("keydown", soloAqui, true);
    return () => window.removeEventListener("keydown", soloAqui, true);
  }, []);
  const seg = segundosRestantes(p.venceAceptacion, ahora);
  return (
    <Modal open onClose={rechazando ? () => setRechazando(false) : onCerrar} title="Pedido nuevo de tu tienda en línea" hideTitle
      backdropClassName="z-[90]"
      className="flex max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-2rem))] flex-col rounded-lg border border-line bg-surface shadow-[0_18px_44px_rgba(22,22,26,.18)]">
      <div className="flex flex-shrink-0 items-start gap-3 border-b border-line py-3 pl-5 pr-2">
        {/* La × va primero en el documento (y a la derecha en pantalla): es donde cae el foco al abrir. */}
        <button ref={cerrar} type="button" onClick={onCerrar} aria-label="Cerrar aviso"
          className={`order-last flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition hover:bg-hover hover:text-ink active:scale-[.97] ${anillo ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" : "outline-none"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-13 font-semibold text-ink-2">
            Pedido nuevo de tu tienda en línea{total > 1 && <span className="ml-2 font-normal text-ink-3">{posicion} de {total}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-32 font-bold leading-tight tracking-tight text-ink">{etiquetaEntrega(p)}</span>
            {p.folioCorto && <span className="font-display text-18 font-semibold tabular-nums text-ink-2">{p.folioCorto}</span>}
          </p>
          {seg !== null && (
            <p className={`mt-0.5 text-14 tabular-nums ${esUrgente(seg) ? "font-bold text-danger" : "text-ink-2"}`}>
              Quedan {mmss(seg)} para aceptarlo
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <DetallePedidoTienda p={p} maxItems={ITEMS_EN_AVISO} />
      </div>

      <div className="flex-shrink-0 border-t border-line p-4">
        {rechazando ? (
          <>
            <h3 className="mb-3 text-15 font-semibold text-ink">¿Por qué se rechaza {p.folioCorto ?? "el pedido"}?</h3>
            <MotivosRechazo ocupado={ocupado} onElegir={onRechazar} onCancelar={() => setRechazando(false)} />
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" disabled={ocupado} onClick={() => setRechazando(true)}>Rechazar</Button>
            <Button variant="ghost" disabled={ocupado} onClick={onVerOrden}>Ver orden</Button>
            <Button className="flex-1" disabled={ocupado} onClick={onAceptar}>{ocupado ? "Un momento…" : "Aceptar"}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Lo de la tienda en línea que se ve desde CUALQUIER pantalla del POS: el aviso grande de un pedido
 * por aceptar y el aviso breve (un pedido que entró solo a su canal, o por qué no se pudo atender).
 * Lleva su propio reloj para la cuenta atrás: así `home-pos` no se repinta cada segundo.
 */
export function CapaPedidosTienda({ pedidos, cajaId, aceptacion, cerrados, viendo, breve, onAccion, onVerOrden, onCerrar, onBreve, onVisible }: {
  /** Los pedidos de la tienda que ya leyó el sondeo de `home-pos`. */
  pedidos: PedidoApp[];
  /** La caja del turno: un pedido que tomó otra caja no avisa aquí. */
  cajaId: string;
  aceptacion: "MANUAL" | "AUTO" | null;
  /** Avisos que el cajero ya cerró: no vuelven a salir. */
  cerrados: ReadonlySet<string>;
  /** El pedido abierto con «Ver orden» que el cajero sigue mirando en su canal: mientras siga por
   *  aceptar, el resto de la fila espera. null al salir de ese canal. */
  viendo: string | null;
  breve: string | null;
  onAccion: AccionTienda;
  onVerOrden: (p: PedidoApp) => void;
  onCerrar: (pedidoId: string) => void;
  /** Muestra un aviso breve: por qué no se pudo, o a dónde fue el pedido que se aceptó. */
  onBreve: (texto: string) => void;
  /** Para la pila de Escape: mientras el aviso está a la vista, `home-pos` cede la tecla. */
  onVisible: (visible: boolean) => void;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState(false);
  const cola = colaDeAvisos(pedidos, { cajaId, enEscritorio: esEscritorio(), ahora: ahora.getTime(), aceptacion, viendo }, cerrados);
  const visible = cola.length > 0;
  // El reloj solo corre con un aviso a la vista, o con la fila en espera tras «Ver orden» (el pedido
  // que se está viendo puede vencer, y entonces la fila continúa). Sin eso, basta una pasada por
  // cada lectura del sondeo para notar uno que llegó.
  const enEspera = viendo !== null;
  useEffect(() => {
    setAhora(new Date());
    if (!visible && !enEspera) return;
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible, enEspera, pedidos]);
  useEffect(() => { onVisible(visible); return () => onVisible(false); }, [visible, onVisible]);

  const p = cola[0];
  const atender = async (accion: "aceptar" | "rechazar", motivo?: MotivoRechazo) => {
    if (!p || ocupado) return;
    setOcupado(true);
    const r = await onAccion(p, accion, motivo);
    setOcupado(false);
    if (!r.ok) onBreve(r.mensaje);
    else if (accion === "aceptar") onBreve(`Pedido aceptado. Está en ${p.app === "DELIVERY_PROPIO" ? "Domicilio" : "Pick-up"}.`);
  };

  return (
    <>
      {p && (
        <AvisoPedidoTienda p={p} posicion={1} total={cola.length} ahora={ahora} ocupado={ocupado}
          onAceptar={() => void atender("aceptar")} onRechazar={(m) => void atender("rechazar", m)}
          onVerOrden={() => onVerOrden(p)} onCerrar={() => onCerrar(p.id)} />
      )}
      {breve && (
        <div role="status" className="fixed left-1/2 top-20 z-[95] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-ink px-5 py-3 text-14 font-medium text-white shadow-xl">
          {breve}
        </div>
      )}
    </>
  );
}
