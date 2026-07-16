"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button } from "@vim/ui/styles";
import {
  ICONOS_POS,
  colorCategoria,
  listarCategoriasPos,
  listarProductosPos,
  type Categoria,
  type Producto,
} from "../lib/catalogo";
import { fmtMxn, type DatosCaja, type Turno } from "../lib/turno";
import { buscarActualizacion, esEscritorio } from "../lib/actualizacion";
import { useReloj } from "./topbar-pos";
import { type Empleado } from "../lib/supabase";
import {
  reducerCarrito,
  estadoInicial,
  nuevoClientId,
  type ModoServicio,
  type ModificadorSel,
} from "../lib/carrito";
import { obtenerGruposDeProducto, type GrupoModificadores } from "../lib/modificadores";
import { persistirTicket, leerTotales, type TotalesTicket } from "../lib/cobro";
import { SidebarTicket } from "./sidebar-ticket";
import { ModalModificadores } from "./modal-modificadores";
import { ModalCobro } from "./modal-cobro";
import { ModalDescuento } from "./modal-descuento";
import { obtenerImpresora } from "../lib/print/adapter";
import { ModalConfigImpresora } from "./modal-config-impresora";
import { ModalClienteDomicilio } from "./modal-cliente-domicilio";
import { ModalCambiarPin } from "./modal-cambiar-pin";
import { ModalMisPropinas } from "./modal-mis-propinas";
import { ModalCobroOffline } from "./modal-cobro-offline";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { construirTicketJob } from "../lib/print/ticket-builder";
import { construirComandaJob, type DatosComanda } from "../lib/print/comanda-builder";
import { ReciboPreview } from "./recibo-preview";
import { PantallaCierre } from "./pantalla-cierre";
import { PantallaKds } from "@vim/kds-core";
import { PantallaMesas } from "./pantalla-mesas";
import { PantallaPickup } from "./pantalla-pickup";
import { PantallaConsultaCuentas } from "./pantalla-consulta-cuentas";
import { PantallaDomicilioCuentas } from "./pantalla-domicilio-cuentas";
import { PantallaDevoluciones } from "./pantalla-devoluciones";
import { ModalCancelarItem } from "./modal-cancelar-item";
import { ModalDescuentoItem } from "./modal-descuento-item";
import { ModalCancelarTicket } from "./modal-cancelar-ticket";
import { ModalMovimientoCaja } from "./modal-movimiento-caja";
import { listarTicketsEnEspera, ponerTicketEnEspera, retomarTicketEnEspera } from "../lib/espera";
import { ModalEtiquetaEspera, ModalListaEspera } from "./modal-espera";
import { leerItemsPersistidos, type ItemTicket } from "../lib/cancelacion";
import { abrirCuentaEnMesa, agregarItemAlTicket, reconstruirCarrito } from "../lib/cuenta-mesa";
import { atribuirMesero, enviarACocina, leerEstadoCocina } from "../lib/mesero";
import { useConexion } from "../lib/conexion";
import { cacheGet, cachePut, contarPendientes } from "../lib/outbox";
import { sincronizar } from "../lib/sync";
import { notificarEventoCritico } from "../lib/push-eventos";
import type { DatosTicketImpresion } from "../lib/print/tipos";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Tarjeta grande del menú de pantalla completa: icono grande minimalista + etiqueta, borde
 *  ligeramente redondeado. */
function TileMenu({ icon, label, onClick, peligro }: { icon: ReactNode; label: string; onClick: () => void; peligro?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex min-h-[140px] flex-col items-center justify-center gap-4 rounded-2xl border p-6 transition ${peligro ? "border-danger/30 text-danger hover:border-danger hover:bg-danger/[0.06]" : "border-line-strong text-ink-2 hover:border-ink hover:bg-hover hover:text-ink"}`}
    >
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <span className="text-center text-[14.5px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

/** Sección con título dentro del menú de pantalla completa. */
function SeccionMenu({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{titulo}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

/** Topbar del POS operativo (mockup P-059): marca + sucursal/turno + reloj + cajero + acciones.
 *  Solo En espera / Mesas / Domicilios quedan a la vista; el resto vive en el menú (☰) para no
 *  saturar la barra. */
function TopbarOperativa({
  caja,
  turno,
  empleado,
  onCambiarCajero,
  onBloquear,
  onCerrarTurno,
  onMovimientoCaja,
  onKds,
  onDevoluciones,
  onImpresora,
  onCambiarPin,
  onMisPropinas,
  onEnEspera,
  onCuentas,
  nEnEspera,
}: {
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  onCambiarCajero: () => void;
  onBloquear: () => void;
  onCerrarTurno: () => void;
  onMovimientoCaja: () => void;
  onKds: () => void;
  onDevoluciones: () => void;
  onImpresora: () => void;
  onCambiarPin: () => void;
  onMisPropinas: () => void;
  /** Abre la Consulta de cuentas (historial de cuentas cerradas/canceladas). */
  onCuentas: () => void;
  /** D45 §12 — abre la lista de pedidos en espera de esta caja. */
  onEnEspera: () => void;
  nEnEspera: number;
}) {
  const ahora = useReloj();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Actualización: solo dentro de la app de escritorio. Se resuelve en un efecto porque el export
  // estático se prerenderiza sin window y la bandera la inyecta Electron al servir el HTML.
  const [enEscritorio, setEnEscritorio] = useState(false);
  const [buscandoUpd, setBuscandoUpd] = useState(false);
  const [avisoUpd, setAvisoUpd] = useState<string | null>(null);
  useEffect(() => { setEnEscritorio(esEscritorio()); }, []);

  const revisarActualizacion = useCallback(async () => {
    setBuscandoUpd(true);
    setAvisoUpd(null);
    const r = await buscarActualizacion();
    setBuscandoUpd(false);
    // Si hay versión nueva, Electron abre su diálogo encima: cerramos el menú para no taparlo.
    if (r.estado === "hay") setMenuAbierto(false);
    else if (r.estado === "al-dia") setAvisoUpd(`Ya tienes la última versión (v${r.version}).`);
    else if (r.estado === "descargando") setAvisoUpd("La actualización ya se está descargando.");
    else setAvisoUpd(r.error);
  }, []);
  useEffect(() => {
    if (!menuAbierto) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuAbierto(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [menuAbierto]);
  const conMenu = (fn: () => void) => () => { setMenuAbierto(false); fn(); };
  return (
    <header className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-6">
      <div className="flex items-center gap-4">
        <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
          <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
          <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight">Knock-Out Burger</div>
          <div className="mt-px text-xs text-ink-3">
            {caja.sucursalNombre} · {caja.nombre} · <span className="text-success">Turno {turno.codigo_turno}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="font-display text-[15px] font-semibold tabular-nums text-ink-2">
          {ahora ? ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
        </div>
        <div className="h-[26px] w-px bg-line-strong" />
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover font-display text-[13px] font-semibold text-ink-2">
            {empleado.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight">{empleado.nombre}</div>
            <div className="text-[11px] text-ink-3">{empleado.rol === "CAJERO" ? "Cajero" : empleado.rol}</div>
          </div>
        </div>
        <div className="relative flex items-center gap-1">
          {/* En espera queda a la vista; el acceso a cuentas (Mesas/Pick-up/Domicilios) vive ahora en
              cada pestaña de modo ("Ver cuentas"). */}
          <button
            type="button"
            onClick={onEnEspera}
            className="relative flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
            En espera
            {nEnEspera > 0 && (
              <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{nEnEspera}</span>
            )}
          </button>
          <button
            type="button"
            onClick={onCuentas}
            className="flex h-9 items-center gap-1.5 rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 2h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
            Cuentas
          </button>

          {/* Menú: todo lo demás, agrupado, para no saturar la barra. */}
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            className={`flex h-9 items-center gap-1.5 rounded border px-3 text-[13px] font-semibold transition ${menuAbierto ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            Menú
          </button>

          {menuAbierto && (
            <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Menú">
              {/* Encabezado */}
              <div className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-ink">
                    <span className="font-display text-base font-bold leading-none tracking-tight text-white">V</span>
                    <span className="absolute bottom-1.5 right-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
                  </div>
                  <span className="font-display text-[17px] font-semibold tracking-tight">Menú</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuAbierto(false)}
                  aria-label="Cerrar menú"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              {/* Tarjetas */}
              <div className="flex-1 overflow-y-auto px-8 py-10">
                <div className="mx-auto flex max-w-4xl flex-col gap-9">
                  <SeccionMenu titulo="Operación">
                    <TileMenu label="Cocina" onClick={conMenu(onKds)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>} />
                    <TileMenu label="Devoluciones" onClick={conMenu(onDevoluciones)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 0 1 0 8h-1" /></svg>} />
                    <TileMenu label="Movimientos de caja" onClick={conMenu(onMovimientoCaja)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>} />
                  </SeccionMenu>
                  <SeccionMenu titulo="Cuenta">
                    <TileMenu label="Cambiar cajero" onClick={conMenu(onCambiarCajero)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg>} />
                    <TileMenu label="Bloquear pantalla" onClick={conMenu(onBloquear)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>} />
                    <TileMenu label="Cambiar mi PIN" onClick={conMenu(onCambiarPin)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.5 12.5 8-8" /><path d="m16 7 2 2" /><path d="m19 4 2 2" /></svg>} />
                    <TileMenu label="Mis propinas" onClick={conMenu(onMisPropinas)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5M12 6.5v1M12 16.5v1" /></svg>} />
                  </SeccionMenu>
                  <SeccionMenu titulo="Ajustes">
                    <TileMenu label="Configurar impresora" onClick={conMenu(onImpresora)} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>} />
                    {enEscritorio && (
                      <TileMenu
                        label={buscandoUpd ? "Buscando…" : "Buscar actualizaciones"}
                        onClick={() => { if (!buscandoUpd) revisarActualizacion(); }}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v5h-5" /><path d="M12 8v5" /><path d="m9.5 11 2.5 2.5 2.5-2.5" /></svg>}
                      />
                    )}
                    <TileMenu label="Cerrar turno" onClick={conMenu(onCerrarTurno)} peligro icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
                  </SeccionMenu>
                  {avisoUpd && (
                    <p className="-mt-4 text-[13px] font-medium text-ink-2" role="status">{avisoUpd}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function HomePos({
  empleado,
  caja,
  turno,
  token,
  onBloquear,
  onCambiarCajero,
  onCerrarTurno,
}: {
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  token: string;
  onBloquear: () => void;
  onCambiarCajero: () => void;
  onCerrarTurno: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const [enKds, setEnKds] = useState(false);
  const [enMesas, setEnMesas] = useState(false);
  const [enDelivery, setEnDelivery] = useState(false);
  const [enPickup, setEnPickup] = useState(false);
  const [enConsultaCuentas, setEnConsultaCuentas] = useState(false);
  const [enDevoluciones, setEnDevoluciones] = useState(false);
  // F16 — estado de conexión (avisa al cajero si se cae la red).
  const { online } = useConexion(SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/health` : undefined);
  // Fase 3 — outbox offline: pendientes por sincronizar + auto-sync al reconectar.
  const [pendientesSync, setPendientesSync] = useState(0);
  const [cobroOfflineAbierto, setCobroOfflineAbierto] = useState(false);
  const sincronizando = useRef(false);

  // Empuja el outbox cuando hay red. Idempotente; se reintenta al volver online.
  useEffect(() => {
    let vivo = true;
    async function tick() {
      if (!vivo) return;
      const n = await contarPendientes();
      if (vivo) setPendientesSync(n);
      if (online && n > 0 && !sincronizando.current) {
        sincronizando.current = true;
        try {
          const r = await sincronizar(token, `caja-${turno.caja_id}`, caja.nombre);
          if (vivo) setPendientesSync(await contarPendientes());
          // Evento crítico: el sync detectó conflictos → avisar a los dispositivos del dueño.
          if (r.conflictos > 0) {
            notificarEventoCritico(
              token,
              "⚠️ Conflictos de sincronización",
              `${r.conflictos} operación${r.conflictos === 1 ? "" : "es"} de ${caja.nombre} chocaron con el servidor. Resuélvelo en Configuración → Sincronización.`,
              "/configuracion/sincronizacion",
            );
          }
        } catch { /* se reintenta en el próximo tick / reconexión */ }
        finally { sincronizando.current = false; }
      }
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => { vivo = false; clearInterval(id); };
  }, [online, token, turno.caja_id, caja.nombre]);
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catSel, setCatSel] = useState<string | null>(null);
  const [carrito, dispatch] = useReducer(reducerCarrito, estadoInicial);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [totalesCobro, setTotalesCobro] = useState<TotalesTicket | null>(null);
  const [procesandoCobro, setProcesandoCobro] = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ folio: string | null; cambio: number } | null>(null);
  // Ticket ya persistido en BD por el flujo de descuento. Mientras exista, el carrito
  // queda comprometido (bloqueado) y el cobro reusa este mismo ticket (no re-persiste).
  const [ticketBd, setTicketBd] = useState<TotalesTicket | null>(null);
  // T2 — modo "cuenta por mesa": el carrito refleja un ticket persistido y los taps agregan
  // incrementalmente. Sólo se activa al abrir/retomar una mesa; QS no cambia.
  const [enModoMesa, setEnModoMesa] = useState(false);
  const [configImpresoraAbierto, setConfigImpresoraAbierto] = useState(false);
  const [clienteDomAbierto, setClienteDomAbierto] = useState(false);
  const [cambiarPinAbierto, setCambiarPinAbierto] = useState(false);
  const [cocinaEnviada, setCocinaEnviada] = useState(false);
  const [enviandoCocina, setEnviandoCocina] = useState(false);
  const [misPropinasAbierto, setMisPropinasAbierto] = useState(false);
  const [descuentoAbierto, setDescuentoAbierto] = useState(false);
  // F6.1 — items persistidos del ticketBd (para mapear clientId ↔ ticket_item_id real al cancelar).
  const [itemsPersistidos, setItemsPersistidos] = useState<ItemTicket[]>([]);
  const [cancelandoItem, setCancelandoItem] = useState<ItemTicket | null>(null);
  // F6.5 — descuento/override por ítem.
  const [descuentoItem, setDescuentoItem] = useState<ItemTicket | null>(null);
  // F6.2 — modal de cancelar ticket completo.
  const [cancelandoTicket, setCancelandoTicket] = useState(false);
  // F7 — modal de movimiento de caja.
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [movimientoToast, setMovimientoToast] = useState<{ folio: string; tipo: string; monto: number } | null>(null);
  // F5.3c — Datos crudos del ticket; el preview los renderiza fiel a P-222/P-223.
  const [datosTicket, setDatosTicket] = useState<DatosTicketImpresion | null>(null);
  const [datosComanda, setDatosComanda] = useState<DatosComanda | null>(null);
  const [mostrarRecibo, setMostrarRecibo] = useState(false);
  const [estadoTicket, setEstadoTicket] = useState<"idle" | "lista" | "error">("idle");
  // D45 §12 — pedidos en espera: modal de etiqueta (guardar), lista (retomar) y contador del chip.
  const [esperaPidiendoEtiqueta, setEsperaPidiendoEtiqueta] = useState(false);
  const [esperaListaAbierta, setEsperaListaAbierta] = useState(false);
  const [esperaProcesando, setEsperaProcesando] = useState(false);
  const [esperaError, setEsperaError] = useState<string | null>(null);
  const [nEnEspera, setNEnEspera] = useState(0);

  useEffect(() => {
    let activo = true;
    Promise.all([listarCategoriasPos(token), listarProductosPos(token)])
      .then(([cs, ps]) => {
        if (!activo) return;
        setCategorias(cs);
        setProductos(ps);
        if (cs.length > 0) setCatSel(cs[0]!.id);
        // Fase 3 — cache de lectura: el menú sobrevive sin red (recargas offline).
        cachePut("catalogo", { categorias: cs, productos: ps });
      })
      .catch(async (e) => {
        if (!activo) return;
        // Sin red: servir el catálogo desde el cache local (Dexie).
        const cacheado = await cacheGet<{ categorias: Categoria[]; productos: Producto[] }>("catalogo");
        if (cacheado && activo) {
          setCategorias(cacheado.categorias);
          setProductos(cacheado.productos);
          if (cacheado.categorias.length > 0) setCatSel(cacheado.categorias[0]!.id);
          return;
        }
        setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      activo = false;
    };
  }, [token]);

  const prodsVisibles = useMemo(
    () => (productos ?? []).filter((p) => !catSel || p.categoria_id === catSel),
    [productos, catSel],
  );

  // T2 — re-lee el ticket de mesa y reconstruye el carrito tras un agregado incremental.
  const recargarCuenta = useCallback(async () => {
    if (!ticketBd) return;
    const tId = ticketBd.ticketId;
    try {
      const [bd, recon, items] = await Promise.all([
        leerTotales(token, tId),
        reconstruirCarrito(token, tId, productos ?? []),
        leerItemsPersistidos(token, tId).catch(() => [] as ItemTicket[]),
      ]);
      dispatch({ tipo: "cargar", estado: { modoServicio: recon.modoServicio, lineas: recon.lineas } });
      setTicketBd(bd);
      setItemsPersistidos(items);
      // Aviso si la reconstrucción no cuadra (producto fuera de catálogo): el total es autoritativo.
      if (items.length > recon.lineas.length) {
        setError("Algunos ítems de la cuenta no se muestran (producto fuera de catálogo), pero el total sí los incluye.");
      } else {
        setError(null);
      }
    } catch (e) {
      // El ítem ya pudo insertarse en BD; avisamos para que el cajero recargue, sin romper la UI.
      setError(e instanceof Error ? `Cuenta desincronizada: ${e.message}. Reabre la mesa para ver el estado real.` : "Error al sincronizar la cuenta");
    }
  }, [ticketBd, token, productos]);

  const onTapProducto = useCallback(
    async (p: Producto) => {
      if (p.agotado) return;
      try {
        const grupos = await obtenerGruposDeProducto(token, p.id);
        if (grupos.length === 0) {
          if (ticketBd) {
            // Modo cuenta de mesa: agrega al ticket abierto y re-sincroniza.
            await agregarItemAlTicket(token, { ticketId: ticketBd.ticketId, productoId: p.id, cantidad: 1, modificadores: [], nota: null });
            await recargarCuenta();
          } else {
            dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: p, cantidad: 1, modificadores: [], notaCocina: null } });
          }
        } else {
          setModGrupos({ producto: p, grupos });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar modificadores");
      }
    },
    [token, ticketBd, recargarCuenta],
  );

  const confirmarModificadores = useCallback(
    async (mods: ModificadorSel[], nota: string | null) => {
      if (!modGrupos) return;
      const prod = modGrupos.producto;
      setModGrupos(null);
      if (ticketBd) {
        try {
          await agregarItemAlTicket(token, { ticketId: ticketBd.ticketId, productoId: prod.id, cantidad: 1, modificadores: mods, nota });
          await recargarCuenta();
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo agregar el ítem");
        }
        return;
      }
      dispatch({ tipo: "agregar", linea: { clientId: nuevoClientId(), producto: prod, cantidad: 1, modificadores: mods, notaCocina: nota } });
    },
    [modGrupos, ticketBd, token, recargarCuenta],
  );

  /** Entra en modo cuenta de mesa: carga el ticket persistido al carrito para seguir editando. */
  const entrarCuenta = useCallback(async (ticketId: string) => {
    try {
      const [bd, recon, items] = await Promise.all([
        leerTotales(token, ticketId),
        reconstruirCarrito(token, ticketId, productos ?? []),
        leerItemsPersistidos(token, ticketId).catch(() => [] as ItemTicket[]),
      ]);
      dispatch({ tipo: "cargar", estado: { modoServicio: recon.modoServicio, lineas: recon.lineas } });
      setTicketBd(bd);
      setItemsPersistidos(items);
      setEnModoMesa(true);
      setEnMesas(false);
      setEnPickup(false);
      setEnDelivery(false);
      // B1 — saber si la mesa ya fue enviada a cocina (para el botón).
      leerEstadoCocina(token, ticketId).then((ec) => setCocinaEnviada(ec !== null && ec !== "SIN_ENVIAR")).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la cuenta");
    }
  }, [token, productos]);

  const onAbrirCuentaMesa = useCallback(async (mesaId: string) => {
    try {
      const ticketId = await abrirCuentaEnMesa(token, {
        sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id, mesaId, usuarioId: empleado.id,
      });
      // B1 — atribuir la mesa al mesero que la abre (para reportes y "mis propinas").
      atribuirMesero(token, ticketId, empleado.id).catch(() => {});
      await entrarCuenta(ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la cuenta");
    }
  }, [token, caja.sucursal_id, turno.caja_id, turno.id, empleado.id, entrarCuenta]);

  /** B1 — envía la mesa a cocina (KDS) antes de cobrar. */
  const onEnviarCocina = useCallback(async () => {
    if (!ticketBd) return;
    setEnviandoCocina(true);
    setError(null);
    try {
      await enviarACocina(token, ticketBd.ticketId);
      setCocinaEnviada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
    } finally {
      setEnviandoCocina(false);
    }
  }, [token, ticketBd]);

  /** Persiste el ticket si aún no existe; abre el modal de descuento sobre ese ticket. */
  const onAplicarDescuento = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
    setProcesandoCobro(true);
    setError(null);
    try {
      let bd = ticketBd;
      if (!bd) {
        bd = await persistirTicket(
          { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
          carrito.modoServicio,
          carrito.lineas,
          nuevoClientId(),
          carrito.clienteDomicilio?.clienteId ?? null,
          carrito.clienteDomicilio?.direccionId ?? null,
          carrito.notaOrden ?? null,
        );
        setTicketBd(bd);
      }
      // Cargar items persistidos (mapping clientId ↔ ticket_item_id real para cancelaciones F6).
      try { setItemsPersistidos(await leerItemsPersistidos(token, bd.ticketId)); } catch { /* no bloquear */ }
      setDescuentoAbierto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al preparar el descuento");
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id]);

  const iniciarCobro = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
    // Si el ticket ya se persistió (flujo de descuento), reusarlo: nada de re-abrir.
    if (ticketBd) {
      setTotalesCobro(ticketBd);
      return;
    }
    // Fase 3 — sin conexión: cobro offline (encola en el outbox; sincroniza al reconectar).
    if (!online) {
      setCobroOfflineAbierto(true);
      return;
    }
    setProcesandoCobro(true);
    setError(null);
    try {
      const totales = await persistirTicket(
        { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
        carrito.modoServicio,
        carrito.lineas,
        nuevoClientId(),
        carrito.clienteDomicilio?.clienteId ?? null,
        carrito.clienteDomicilio?.direccionId ?? null,
        carrito.notaOrden ?? null,
      );
      setTotalesCobro(totales);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al abrir el ticket");
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id, online]);

  const bloqueado = ticketBd !== null;
  // En modo cuenta de mesa el ticket está persistido (ticketBd) PERO el menú debe seguir activo
  // para agregar ítems incrementalmente. Solo se bloquea el menú en el flujo QS post-cobro/descuento.
  const menuBloqueado = bloqueado && !enModoMesa;

  // ── D45 §12 — Pedidos en espera ───────────────────────────────────────────
  const refrescarEspera = useCallback(() => {
    listarTicketsEnEspera(token, turno.caja_id).then((ts) => setNEnEspera(ts.length)).catch(() => {});
  }, [token, turno.caja_id]);
  useEffect(() => { refrescarEspera(); }, [refrescarEspera]);

  /** Persiste el carrito (si hace falta) y lo marca en espera con la etiqueta capturada. */
  const confirmarEspera = useCallback(async (etiqueta: string) => {
    setEsperaProcesando(true);
    setEsperaError(null);
    try {
      let bd = ticketBd;
      if (!bd) {
        bd = await persistirTicket(
          { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
          carrito.modoServicio,
          carrito.lineas,
          nuevoClientId(),
          carrito.clienteDomicilio?.clienteId ?? null,
          carrito.clienteDomicilio?.direccionId ?? null,
          carrito.notaOrden ?? null,
        );
      }
      await ponerTicketEnEspera(token, bd.ticketId, etiqueta);
      // La caja queda libre para la siguiente venta; el pedido vive en BD.
      dispatch({ tipo: "limpiar" });
      setTicketBd(null);
      setItemsPersistidos([]);
      setEsperaPidiendoEtiqueta(false);
      refrescarEspera();
    } catch (e) {
      setEsperaError(e instanceof Error ? e.message : "No se pudo poner en espera");
    } finally {
      setEsperaProcesando(false);
    }
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id, refrescarEspera]);

  /** Pick-up / Domicilio — persiste la orden, la envía a cocina y la deja ABIERTA (sin cobrar).
   *  Queda en "Ver cuentas" del modo; se cobra al recoger / al regresar el repartidor. */
  const enviarACocinaAbierto = useCallback(async () => {
    setProcesandoCobro(true);
    setError(null);
    try {
      let bd = ticketBd;
      if (!bd) {
        bd = await persistirTicket(
          { token, sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id },
          carrito.modoServicio,
          carrito.lineas,
          nuevoClientId(),
          carrito.clienteDomicilio?.clienteId ?? null,
          carrito.clienteDomicilio?.direccionId ?? null,
          carrito.notaOrden ?? null,
        );
      }
      await enviarACocina(token, bd.ticketId);
      dispatch({ tipo: "limpiar" });
      setTicketBd(null);
      setItemsPersistidos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id]);

  /** Reimprime el ticket de una cuenta cerrada (desde la Consulta de cuentas). */
  const reimprimirCuenta = useCallback(async (ticketId: string) => {
    const datos = await leerTicketParaImpresion(ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
    const imp = obtenerImpresora({ onMostrar: () => window.print() });
    imp.imprimir(construirTicketJob(datos));
  }, [token, empleado.nombre, caja.nombre]);

  /** Retoma un pedido en espera: lo carga al carrito como cuenta editable (misma maquinaria de mesas). */
  const retomarEspera = useCallback(async (ticketId: string) => {
    setEsperaProcesando(true);
    setEsperaError(null);
    try {
      await retomarTicketEnEspera(token, ticketId);
      await entrarCuenta(ticketId);
      setEsperaListaAbierta(false);
      refrescarEspera();
    } catch (e) {
      setEsperaError(e instanceof Error ? e.message : "No se pudo retomar el pedido");
    } finally {
      setEsperaProcesando(false);
    }
  }, [token, entrarCuenta, refrescarEspera]);

  /** Descarta el overlay de confirmación/recibo (sin tocar el carrito en curso).
   *  Se llama al navegar por el topbar para que un recibo viejo no reaparezca apilado. */
  const cerrarRecibo = useCallback(() => {
    setConfirmacion(null);
    setDatosTicket(null);
    setDatosComanda(null);
    setMostrarRecibo(false);
  }, []);

  /** Navegación por el topbar: descarta el recibo y, si estás en una cuenta de mesa, SALE de
   *  ella (la cuenta queda abierta en la mesa, persistida en BD, y se retoma desde Mesas).
   *  Sin esto, ticketBd quedaba colgado y el POS no volvía a un ticket QS limpio. */
  const salirNavegacion = useCallback(() => {
    cerrarRecibo();
    if (enModoMesa) {
      setEnModoMesa(false);
      setTicketBd(null);
      setItemsPersistidos([]);
      dispatch({ tipo: "limpiar" });
    }
  }, [cerrarRecibo, enModoMesa]);

  /** Cierra la confirmación/recibo y deja la caja lista para la siguiente venta. */
  const nuevoTicket = useCallback(() => {
    setConfirmacion(null);
    setDatosTicket(null);
    setDatosComanda(null);
    setMostrarRecibo(false);
    setEstadoTicket("idle");
    setItemsPersistidos([]);
    setCancelandoItem(null);
  }, []);

  /** F6.1 — solicita cancelar un item ya persistido (abre el modal P-068). */
  const onCancelarItemPersistido = useCallback((clientId: string) => {
    const it = itemsPersistidos.find((x) => x.clientId === clientId);
    if (!it) {
      // Si no encontramos el mapping (no se cargó), no hacemos nada — fallback al quitar local.
      dispatch({ tipo: "quitar", clientId });
      return;
    }
    setCancelandoItem(it);
  }, [itemsPersistidos]);

  const onDescuentoItemSolicitado = useCallback((clientId: string) => {
    const it = itemsPersistidos.find((x) => x.clientId === clientId);
    if (it) setDescuentoItem(it);
  }, [itemsPersistidos]);

  if (cerrando) {
    return (
      <PantallaCierre
        token={token}
        empleado={empleado}
        caja={caja}
        turno={turno}
        onCancelar={() => setCerrando(false)}
        onCerrado={onCerrarTurno}
      />
    );
  }

  if (enKds) {
    return <PantallaKds token={token} caja={caja} onSalir={() => setEnKds(false)} />;
  }

  if (enMesas) {
    return (
      <PantallaMesas
        token={token}
        caja={caja}
        onSalir={() => setEnMesas(false)}
        onAbrirCuenta={onAbrirCuentaMesa}
        onRetomar={entrarCuenta}
      />
    );
  }

  if (enDelivery) {
    return <PantallaDomicilioCuentas token={token} caja={caja} onSalir={() => setEnDelivery(false)} onRetomar={entrarCuenta} />;
  }

  if (enPickup) {
    return <PantallaPickup token={token} caja={caja} onSalir={() => setEnPickup(false)} onRetomar={entrarCuenta} />;
  }

  if (enConsultaCuentas) {
    return <PantallaConsultaCuentas token={token} caja={caja} turno={turno} empleado={empleado} onSalir={() => setEnConsultaCuentas(false)} onReimprimir={reimprimirCuenta} />;
  }

  if (enDevoluciones) {
    return <PantallaDevoluciones token={token} caja={caja} turno={turno} empleado={empleado} onSalir={() => setEnDevoluciones(false)} />;
  }

  return (
    <div className="flex h-screen flex-col">
      {!online && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 bg-[#9A6B12] px-4 py-1.5 text-[12.5px] font-semibold text-white" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" /></svg>
          Sin conexión — modo offline activo: puedes seguir cobrando; las ventas se sincronizan al reconectar.
        </div>
      )}
      {online && pendientesSync > 0 && (
        <div className="flex flex-shrink-0 items-center justify-center gap-2 bg-[#2C5AA0] px-4 py-1.5 text-[12.5px] font-semibold text-white" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          Sincronizando {pendientesSync} operación{pendientesSync === 1 ? "" : "es"} pendiente{pendientesSync === 1 ? "" : "s"}…
        </div>
      )}
      <TopbarOperativa caja={caja} turno={turno} empleado={empleado} onCambiarCajero={onCambiarCajero} onBloquear={onBloquear} onCerrarTurno={() => setCerrando(true)} onMovimientoCaja={() => setMovimientoAbierto(true)} onKds={() => { salirNavegacion(); setEnKds(true); }} onDevoluciones={() => { salirNavegacion(); setEnDevoluciones(true); }} onImpresora={() => setConfigImpresoraAbierto(true)} onCambiarPin={() => setCambiarPinAbierto(true)} onMisPropinas={() => setMisPropinasAbierto(true)} onEnEspera={() => { setEsperaError(null); setEsperaListaAbierta(true); }} onCuentas={() => { salirNavegacion(); setEnConsultaCuentas(true); }} nEnEspera={nEnEspera} />
      {configImpresoraAbierto && <ModalConfigImpresora onCerrar={() => setConfigImpresoraAbierto(false)} />}
      {clienteDomAbierto && (
        <ModalClienteDomicilio
          token={token}
          tenantId={caja.tenant_id}
          sucursalId={caja.sucursal_id}
          onSeleccionar={(c) => { dispatch({ tipo: "cliente", cliente: c }); setClienteDomAbierto(false); }}
          onCerrar={() => setClienteDomAbierto(false)}
        />
      )}
      {cambiarPinAbierto && (
        <ModalCambiarPin token={token} onListo={() => setCambiarPinAbierto(false)} onCerrar={() => setCambiarPinAbierto(false)} />
      )}
      {misPropinasAbierto && (
        <ModalMisPropinas token={token} meseroId={empleado.id} meseroNombre={empleado.nombre} onCerrar={() => setMisPropinasAbierto(false)} />
      )}
      {cobroOfflineAbierto && (
        <ModalCobroOffline
          ctx={{ sucursalId: caja.sucursal_id, cajaId: turno.caja_id, turnoId: turno.id, usuarioId: empleado.id }}
          carrito={carrito}
          onCobrado={() => { setCobroOfflineAbierto(false); dispatch({ tipo: "limpiar" }); }}
          onCerrar={() => setCobroOfflineAbierto(false)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Categorías en pestañas horizontales (.cat-tabs del mockup P-059). Antes eran una barra
              lateral de 200px que el mockup no tiene: en una pantalla de 1024 dejaba el catálogo en
              380px, y las fichas se achicaban hasta desbordar el nombre del producto. */}
          <div className="flex flex-shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface px-5 py-3">
            {categorias === null && <p className="text-sm text-ink-3">Cargando…</p>}
            {categorias?.map((c, i) => {
              const col = colorCategoria(c, i);
              const active = catSel === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCatSel(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "inline-flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg border px-4 py-2.5 text-[14px] transition",
                    active
                      ? "border-ink bg-ink font-bold text-white"
                      : "border-line font-semibold text-ink-2 hover:border-line-strong hover:text-ink",
                  ].join(" ")}
                >
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
                    style={active ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: col.bg, color: col.ink }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path d={ICONOS_POS[c.icono ?? "tag"] ?? ICONOS_POS.tag} />
                    </svg>
                  </span>
                  {c.nombre}
                </button>
              );
            })}
            {categorias?.length === 0 && (
              <p className="text-xs text-ink-3">Sin categorías. Créalas en el admin.</p>
            )}
          </div>

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto bg-bg p-5">
          {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
          {productos === null && <p className="text-sm text-ink-3">Cargando productos…</p>}
          {productos !== null && prodsVisibles.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="font-display text-lg font-semibold">Sin productos en esta categoría</p>
              <p className="max-w-md text-sm text-ink-3">Crea productos en el admin para empezar a vender.</p>
            </div>
          )}
          {prodsVisibles.length > 0 && (
            // Rejilla del mockup P-059: las columnas las decide el ANCHO DEL CATÁLOGO, no el de la
            // ventana. Con cortes por viewport (lg:/xl:) una pantalla de 1024 pedía 4 columnas
            // dentro de una columna de ~380px → fichas de 87px y el nombre desbordado.
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
              {prodsVisibles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.agotado || menuBloqueado}
                  onClick={() => onTapProducto(p)}
                  className={[
                    "group relative flex min-h-[150px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-lg border bg-surface px-3 py-4 text-center transition",
                    p.agotado || menuBloqueado
                      ? "cursor-not-allowed border-line opacity-50"
                      : "border-line hover:border-ink hover:shadow-sm active:scale-[.98]",
                  ].join(" ")}
                >
                  {p.agotado && (
                    <span className="absolute right-2 top-2 rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-danger">
                      Agotado
                    </span>
                  )}
                  <span className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-xl bg-hover">
                    <span className="font-display text-[22px] font-bold text-ink-3">{p.nombre.charAt(0)}</span>
                  </span>
                  {/* break-words: sin esto un nombre largo sin espacios se sale de la ficha. */}
                  <span className="break-words text-[14px] font-semibold leading-tight">{p.nombre}</span>
                  <span className="font-display text-[15px] font-bold tabular-nums">{fmtMxn(p.precio_base_mxn)}</span>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>

        <SidebarTicket
          estado={carrito}
          onCantidad={(id, c) => dispatch({ tipo: "cantidad", clientId: id, cantidad: c })}
          onQuitar={(id) => dispatch({ tipo: "quitar", clientId: id })}
          onCancelarItemPersistido={ticketBd ? onCancelarItemPersistido : undefined}
          onDescuentoItem={ticketBd ? onDescuentoItemSolicitado : undefined}
          onLimpiar={!ticketBd ? () => dispatch({ tipo: "limpiar" }) : undefined}
          onCancelarTicket={ticketBd ? () => setCancelandoTicket(true) : undefined}
          onModo={(m: ModoServicio) => dispatch({ tipo: "modo", modo: m })}
          onVerCuentas={(m) => {
            salirNavegacion();
            if (m === "COMER_AQUI") setEnMesas(true);
            else if (m === "DRIVE_THRU") setEnPickup(true);
            else if (m === "DELIVERY_PROPIO") setEnDelivery(true);
          }}
          onEditarCliente={() => setClienteDomAbierto(true)}
          onNotaLinea={(id, nota) => dispatch({ tipo: "nota_linea", clientId: id, nota })}
          onNotaOrden={(nota) => dispatch({ tipo: "nota_orden", nota })}
          onCobrar={iniciarCobro}
          onPonerEnEspera={online ? () => { setEsperaError(null); setEsperaPidiendoEtiqueta(true); } : undefined}
          onEnviarCocina={enModoMesa && ticketBd ? onEnviarCocina : undefined}
          onEnviarCocinaAbierto={
            !enModoMesa && (carrito.modoServicio === "DRIVE_THRU" || carrito.modoServicio === "DELIVERY_PROPIO")
              ? enviarACocinaAbierto
              : undefined
          }
          cocinaEnviada={cocinaEnviada}
          enviandoCocina={enviandoCocina}
          onAplicarDescuento={onAplicarDescuento}
          descuentoMxn={ticketBd?.descuentos ?? 0}
          totalConDescuento={ticketBd ? ticketBd.total : undefined}
          bloqueado={bloqueado}
          procesando={procesandoCobro}
        />
      </div>

      {esperaPidiendoEtiqueta && (
        <ModalEtiquetaEspera
          onConfirmar={confirmarEspera}
          onCerrar={() => setEsperaPidiendoEtiqueta(false)}
          procesando={esperaProcesando}
          error={esperaError}
        />
      )}
      {esperaListaAbierta && (
        <ModalListaEspera
          token={token}
          cajaId={turno.caja_id}
          onRetomar={retomarEspera}
          onCerrar={() => setEsperaListaAbierta(false)}
          procesando={esperaProcesando}
          error={esperaError}
        />
      )}
      {modGrupos && (
        <ModalModificadores
          producto={modGrupos.producto}
          grupos={modGrupos.grupos}
          onConfirmar={confirmarModificadores}
          onCancelar={() => setModGrupos(null)}
        />
      )}
      {descuentoAbierto && ticketBd && (
        <ModalDescuento
          token={token}
          empleado={empleado}
          ticketId={ticketBd.ticketId}
          totalActual={ticketBd.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onAplicado={async () => {
            try {
              const t = await leerTotales(token, ticketBd.ticketId);
              setTicketBd(t);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error al releer totales");
            }
            setDescuentoAbierto(false);
          }}
          onCerrar={() => setDescuentoAbierto(false)}
        />
      )}
      {movimientoAbierto && (
        <ModalMovimientoCaja
          token={token}
          empleado={empleado}
          caja={caja}
          turno={turno}
          onRegistrado={(m) => {
            setMovimientoAbierto(false);
            setMovimientoToast({ folio: m.folio, tipo: m.tipo, monto: m.monto });
            setTimeout(() => setMovimientoToast(null), 4000);
          }}
          onCerrar={() => setMovimientoAbierto(false)}
        />
      )}
      {movimientoToast && (
        <div className="fixed left-1/2 top-20 z-[80] -translate-x-1/2 rounded-lg bg-ink px-5 py-3 text-[13.5px] font-medium text-white shadow-xl">
          <span className="font-semibold">{movimientoToast.folio}</span> · {movimientoToast.tipo} · {fmtMxn(movimientoToast.monto)} registrado
        </div>
      )}
      {cancelandoTicket && ticketBd && (
        <ModalCancelarTicket
          token={token}
          empleado={empleado}
          ticketId={ticketBd.ticketId}
          folio={ticketBd.folio}
          totalActual={ticketBd.total}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onCancelado={() => {
            // Resetear todo: carrito local, ticketBd, items persistidos.
            dispatch({ tipo: "limpiar" });
            setTicketBd(null);
            setItemsPersistidos([]);
            setEnModoMesa(false);
            setCancelandoTicket(false);
          }}
          onCerrar={() => setCancelandoTicket(false)}
        />
      )}
      {descuentoItem && ticketBd && (
        <ModalDescuentoItem
          token={token}
          empleado={empleado}
          ticketId={ticketBd.ticketId}
          ticketItemId={descuentoItem.id}
          productoNombre={descuentoItem.productoNombre}
          cantidad={descuentoItem.cantidad}
          totalItem={descuentoItem.totalItemMxn}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onAplicado={async () => {
            try {
              const t = await leerTotales(token, ticketBd.ticketId);
              setTicketBd(t);
              setItemsPersistidos(await leerItemsPersistidos(token, ticketBd.ticketId));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error al releer el ticket");
            }
            setDescuentoItem(null);
          }}
          onCerrar={() => setDescuentoItem(null)}
        />
      )}
      {cancelandoItem && ticketBd && (
        <ModalCancelarItem
          token={token}
          empleado={empleado}
          ticketItemId={cancelandoItem.id}
          productoNombre={cancelandoItem.productoNombre}
          cantidad={cancelandoItem.cantidad}
          totalItem={cancelandoItem.totalItemMxn}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          estadoCocina={cancelandoItem.estadoCocina}
          onCancelado={async () => {
            // Reflejar en el carrito local + re-leer totales + items persistidos.
            dispatch({ tipo: "quitar", clientId: cancelandoItem.clientId });
            try {
              const t = await leerTotales(token, ticketBd.ticketId);
              setTicketBd(t);
              const items = await leerItemsPersistidos(token, ticketBd.ticketId);
              setItemsPersistidos(items);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error al re-leer el ticket");
            }
            setCancelandoItem(null);
          }}
          onCerrar={() => setCancelandoItem(null)}
        />
      )}
      {totalesCobro && (
        <ModalCobro
          token={token}
          sucursalId={caja.sucursal_id}
          totalesIniciales={totalesCobro}
          onPagado={async (folio, cambio) => {
            const ticketId = totalesCobro.ticketId;
            setTotalesCobro(null);
            setTicketBd(null);
            setEnModoMesa(false);
            dispatch({ tipo: "limpiar" });
            setConfirmacion({ folio, cambio });
            // Armar el ticket e IMPRIMIR automáticamente. Con PreviewAdapter abre el recibo
            // en pantalla; al activar EpsonEposAdapter, ese mismo llamado imprime en papel.
            try {
              const datos = await leerTicketParaImpresion(ticketId, {
                token,
                cajeroNombre: empleado.nombre,
                cajaNombre: caja.nombre,
              });
              const datosCom: DatosComanda = {
                folio: datos.meta.folio,
                modoServicio: datos.meta.modoServicio,
                cajero: datos.meta.cajero,
                caja: datos.meta.caja,
                fechaIso: datos.meta.fechaIso,
                lineas: datos.lineas.map((l) => ({ cantidad: l.cantidad, nombre: l.nombre, modificadores: l.modificadores, notaCocina: l.notaCocina })),
                ancho: 80,
              };
              setDatosTicket(datos);
              setDatosComanda(datosCom);
              setEstadoTicket("lista");
              // Auto-impresión: el PrintJob es la fuente para el papel (Epson cuando esté).
              // Hoy con PreviewAdapter solo abre el overlay; el preview se renderiza desde los datos.
              const job = construirTicketJob(datos);
              await obtenerImpresora({ onMostrar: () => setMostrarRecibo(true) }).imprimir(job);
            } catch {
              setEstadoTicket("error");
            }
          }}
          onCerrar={() => setTotalesCobro(null)}
        />
      )}
      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-8 w-8"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <div className="font-display text-[22px] font-semibold">Cobro completado</div>
            {confirmacion.folio && <div className="mt-1 text-[13px] text-ink-3">Ticket {confirmacion.folio}</div>}
            {confirmacion.cambio > 0 && (
              <div className="mt-3 rounded-lg border border-line">
                <div className="flex items-center justify-between px-4 py-3 text-success">
                  <span className="text-[14px] font-semibold">Cambio a entregar</span>
                  <span className="font-display text-[20px] font-bold tabular-nums">{fmtMxn(confirmacion.cambio)}</span>
                </div>
              </div>
            )}
            {/* Panel de impresión (1 fila: ticket del cliente) */}
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-left">
              <span className={["flex h-8 w-8 items-center justify-center rounded", estadoTicket === "lista" ? "bg-success/10 text-success" : estadoTicket === "error" ? "bg-danger/10 text-danger" : "bg-hover text-ink-3"].join(" ")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              </span>
              <div className="flex-1">
                <div className="text-[14px] font-semibold">Ticket del cliente</div>
                <div className="text-[12px] text-ink-3">{estadoTicket === "lista" ? "Vista previa lista · 80mm" : estadoTicket === "error" ? "No se pudo armar" : "Preparando…"}</div>
              </div>
              {datosTicket && (
                <button type="button" onClick={() => setMostrarRecibo(true)} className="rounded border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
                  Ver / Imprimir
                </button>
              )}
            </div>
            <Button className="mt-4 w-full" onClick={nuevoTicket}>Nuevo ticket</Button>
          </div>
        </div>
      )}
      {mostrarRecibo && datosTicket && (
        <ReciboPreview
          datosTicket={datosTicket}
          datosComanda={datosComanda ?? undefined}
          onImprimir={(vista) => {
            // Con Epson manda ESC/POS; con Preview, window.print() imprime el recibo visible.
            const imp = obtenerImpresora({ onMostrar: () => window.print() });
            if (vista === "cocina" && datosComanda) imp.imprimir(construirComandaJob(datosComanda));
            else imp.imprimir(construirTicketJob(datosTicket));
          }}
          onCerrar={() => setMostrarRecibo(false)}
          onNuevoTicket={nuevoTicket}
        />
      )}
    </div>
  );
}
