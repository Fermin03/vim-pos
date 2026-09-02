"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button } from "@vim/ui/styles";
import {
  listarCategoriasPos,
  listarProductosPos,
  type Categoria,
  type Producto,
} from "../lib/catalogo";
import { fmtMxn, contarCuentasAbiertasPorModo, type CuentasAbiertasPorModo, type DatosCaja, type Turno } from "../lib/turno";
import { useReloj } from "./topbar-pos";
import { type Empleado } from "../lib/supabase";
import {
  reducerCarrito,
  estadoInicial,
  nuevoClientId,
  type ModificadorSel,
} from "../lib/carrito";
import { obtenerGruposDeProducto, type GrupoModificadores } from "../lib/modificadores";
import { persistirTicket, leerTotales, type TotalesTicket } from "../lib/cobro";
import { SidebarTicket } from "./sidebar-ticket";
import { ModalModificadores } from "./modal-modificadores";
import { ModalCobro } from "./modal-cobro";
import { ModalDescuento } from "./modal-descuento";
import { obtenerImpresora, obtenerImpresoraDeEstacion } from "../lib/print/adapter";
import { estacionParaArea, hayEstacionDeCocinaDedicada } from "../lib/print/config";
import { ModalConfigImpresora } from "./modal-config-impresora";
import { ModalClienteDomicilio } from "./modal-cliente-domicilio";
import { ModalNombreCuenta } from "./modal-nombre-cuenta";
import { ModalCambiarPin } from "./modal-cambiar-pin";
import { ModalMisPropinas } from "./modal-mis-propinas";
import { leerAreasDeItems, leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { construirTicketJob, debeImprimirTicketAlCobrar } from "../lib/print/ticket-builder";
import { rasterizarImagen } from "../lib/print/rasterizar";
import { agruparComandaPorArea, construirComandaJob, debeImprimirComandaAlCobrar, type DatosComanda, type LineaConArea } from "../lib/print/comanda-builder";
import { ReciboPreview } from "./recibo-preview";
import { PantallaCierre } from "./pantalla-cierre";
import { PantallaKds } from "@vim/kds-core";
import { PantallaMesas } from "./pantalla-mesas";
import { PantallaReservaciones } from "./pantalla-reservaciones";
import { PantallaConsultaCuentas } from "./pantalla-consulta-cuentas";
import { PantallaDevoluciones } from "./pantalla-devoluciones";
import { PantallaPedidosApps } from "./pantalla-pedidos-apps";
import { leerPedidosApps } from "../lib/pedidos-apps";
import { ModalCancelarItem } from "./modal-cancelar-item";
import { ModalDescuentoItem } from "./modal-descuento-item";
import { ModalCancelarTicket } from "./modal-cancelar-ticket";
import { ModalMovimientoCaja } from "./modal-movimiento-caja";
import { ModalAbrirCaja } from "./modal-abrir-caja";
import { fijarContextoErrores, reportarErrorSinEsperar } from "../lib/reportar-error";
import { BotonVolver } from "./boton-volver";
import { CatalogoProductos } from "./catalogo-productos";
import { ModalAgregarProductos } from "./modal-agregar-productos";
import { ModalNumeroMesa } from "./modal-numero-mesa";
import { MenuGeneral } from "./menu-general";
import { PantallaInicio } from "./pantalla-inicio";
import { PantallaCuentasModo } from "./pantalla-cuentas-modo";
import { PantallaMonitorVentas } from "./pantalla-monitor-ventas";
import { listarTicketsEnEspera, ponerTicketEnEspera, retomarTicketEnEspera } from "../lib/espera";
import { ModalEtiquetaEspera, ModalListaEspera } from "./modal-espera";
import { leerItemsPersistidos, type ItemTicket } from "../lib/cancelacion";
import { abrirCuentaEnMesa, agregarItemAlTicket, reconstruirCarrito } from "../lib/cuenta-mesa";
import { atribuirMesero, contarPendientesCocina, enviarACocina, yaEnviadoACocina } from "../lib/mesero";
import { useConexion } from "../lib/conexion";
import { cacheGet, cachePut, contarPendientes } from "../lib/outbox";
import { sincronizar } from "../lib/sync";
import { notificarEventoCritico } from "../lib/push-eventos";
import type { DatosTicketImpresion } from "../lib/print/tipos";
import { useEscape } from "../lib/use-escape";
import { ModalSalidaDomicilio } from "./modal-salida-domicilio";
import type { LineaCancelada } from "./modal-cancelar-items";
import { cerrarRepartoAlCobrar } from "../lib/delivery";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";




/** Pantalla desde la que se entró a capturar; a esa regresa el botón "Volver". */
type Origen = "inicio" | "mesas" | "pickup" | "domicilio";

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
  // Confirmación previa al cierre. "Cerrar turno" vive en el menú general, a un dedo de
  // opciones inofensivas como "Abrir cajón" o "Cambiar mi PIN", y arrancaba el corte de
  // inmediato. Un toque accidental a media comida mandaba al cajero a una pantalla de arqueo
  // que no pidió, con la fila esperando.
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  /**
   * Salida pendiente de la pantalla de captura cuando la cuenta ya está guardada en la base.
   *
   * "Para llevar" no tiene lista de cuentas: si el cliente se arrepiente a media captura y el
   * cajero presiona Volver, el ticket ya persistido se queda vivo y NINGUNA pantalla lo muestra.
   * Aparece días después, trabando el corte, y hay que ir a leer la base de datos para hallarlo.
   * Pasó dos veces en el piloto.
   *
   * Se pregunta en el momento del abandono, que es cuando el cajero sabe qué pasó y puede
   * decidir en un segundo. Después ya nadie se acuerda.
   */
  const [salidaPendiente, setSalidaPendiente] = useState<null | "atras" | "inicio">(null);
  /** Pedido de domicilio que está por salir: se pregunta quién se lo lleva antes de marcarlo. */
  const [saliendoDomicilio, setSaliendoDomicilio] = useState<
    null | { ticketId: string; folio: string | null; total: number; recargar: () => void }
  >(null);
  const [enKds, setEnKds] = useState(false);
  // El POS arranca en la pantalla de inicio: el cajero elige primero a qué viene.
  const [enInicio, setEnInicio] = useState(true);
  const [enMonitor, setEnMonitor] = useState(false);
  const [cuentasAbiertas, setCuentasAbiertas] = useState<CuentasAbiertasPorModo>({ comedor: 0, pickup: 0, domicilio: 0 });
  const [enMesas, setEnMesas] = useState(false);
  const [enDelivery, setEnDelivery] = useState(false);
  const [enPickup, setEnPickup] = useState(false);
  const [enConsultaCuentas, setEnConsultaCuentas] = useState(false);
  // Pantalla desde la que se entró a capturar. "Volver" regresa AHÍ, no al inicio: si el
  // cajero venía de la lista de domicilios, mandarlo al inicio le cuesta dos toques extra
  // para seguir atendiendo la misma lista.
  const [volverA, setVolverA] = useState<Origen>("inicio");
  const [enDevoluciones, setEnDevoluciones] = useState(false);
  // ADR 0011 — pedidos de apps de delivery: pantalla, badge del inicio y sonido al llegar uno nuevo.
  const [enPedidosApps, setEnPedidosApps] = useState(false);
  const [nPedidosApps, setNPedidosApps] = useState(0);
  const idsAppsVistos = useRef<Set<string> | null>(null);
  // F16 — estado de conexión (avisa al cajero si se cae la red).
  const { online } = useConexion(SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/health` : undefined);
  // Fase 3 — outbox offline: pendientes por sincronizar + auto-sync al reconectar.
  const [pendientesSync, setPendientesSync] = useState(0);
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
  const [carrito, dispatch] = useReducer(reducerCarrito, estadoInicial);
  const [modGrupos, setModGrupos] = useState<{ producto: Producto; grupos: GrupoModificadores[] } | null>(null);
  const [totalesCobro, setTotalesCobro] = useState<TotalesTicket | null>(null);
  // Al cobrar desde la lista ya no se navega, así que la lista no se remonta sola y seguiría
  // mostrando la cuenta recién pagada. Este contador la fuerza a releerse.
  const [cuentasVersion, setCuentasVersion] = useState(0);
  // Agregar productos a una cuenta abierta es su propio modal: la pantalla de venta tiene el
  // botón Cobrar como acción dominante, y no es lo que se quiere al anotar una segunda tanda.
  const [agregandoA, setAgregandoA] = useState<string | null>(null);
  // Comedor: se escribe el número de mesa en vez de buscarla en el mapa. El mapa queda como
  // consulta opcional desde el propio modal.
  const [pidiendoMesa, setPidiendoMesa] = useState(false);
  const [viendoMapaMesas, setViendoMapaMesas] = useState(false);
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
  const [nombreCuentaAbierto, setNombreCuentaAbierto] = useState(false);
  const [cambiarPinAbierto, setCambiarPinAbierto] = useState(false);
  const [cocinaEnviada, setCocinaEnviada] = useState(false);
  const [enviandoCocina, setEnviandoCocina] = useState(false);
  const [misPropinasAbierto, setMisPropinasAbierto] = useState(false);
  const [descuentoAbierto, setDescuentoAbierto] = useState(false);
  // Agenda de reservaciones, abierta desde el mapa de Comedor.
  const [viendoReservaciones, setViendoReservaciones] = useState(false);
  // F6.1 — items persistidos del ticketBd (para mapear clientId ↔ ticket_item_id real al cancelar).
  const [itemsPersistidos, setItemsPersistidos] = useState<ItemTicket[]>([]);
  const [cancelandoItem, setCancelandoItem] = useState<ItemTicket | null>(null);
  // F6.5 — descuento/override por ítem.
  const [descuentoItem, setDescuentoItem] = useState<ItemTicket | null>(null);
  // F6.2 — modal de cancelar ticket completo.
  const [cancelandoTicket, setCancelandoTicket] = useState(false);
  // F7 — modal de movimiento de caja.
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [movimientoToast, setMovimientoToast] = useState<{ folio: string; etiqueta: string; monto: number } | null>(null);
  const [abrirCajaAbierto, setAbrirCajaAbierto] = useState(false);
  // El menú se abre también desde el inicio; su estado vive aquí porque ambas pantallas lo usan.
  const [menuGeneralAbierto, setMenuGeneralAbierto] = useState(false);
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
          return;
        }
        setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      activo = false;
    };
  }, [token]);


  // T2 — re-lee el ticket de mesa y reconstruye el carrito tras un agregado incremental.
  // Navegación: definidas aquí arriba a propósito. Los callbacks de "enviar a cocina"
  // las listan en sus dependencias, y esas se evalúan durante el render — con la
  // definición más abajo, la referencia caía en la zona muerta temporal del const.
  // Bitácora de errores: se registra quién opera para que los boundaries de React —que no
  // reciben props— puedan reportar con tenant y caja. Se capturan además los errores que NO
  // pasan por React (promesas sin catch, fallos en handlers del navegador): en una caja esos
  // son justo los que dejan la pantalla congelada sin que nadie se entere.
  useEffect(() => {
    fijarContextoErrores({
      token,
      tenantId: caja.tenant_id,
      sucursalId: caja.sucursal_id,
      cajaId: turno.caja_id,
      usuarioId: empleado.id,
    });
    const onRechazo = (e: PromiseRejectionEvent) =>
      reportarErrorSinEsperar(e.reason, { origen: "unhandledrejection" });
    const onError = (e: ErrorEvent) =>
      reportarErrorSinEsperar(e.error ?? e.message, { origen: "window.onerror", archivo: e.filename ?? null, linea: e.lineno ?? null });
    window.addEventListener("unhandledrejection", onRechazo);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRechazo);
      window.removeEventListener("error", onError);
      fijarContextoErrores(null);
    };
  }, [token, caja.tenant_id, caja.sucursal_id, turno.caja_id, empleado.id]);

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
      setCocinaEnviada(false);
      dispatch({ tipo: "limpiar" });
    }
  }, [cerrarRecibo, enModoMesa]);

  /** Sale de la captura y regresa a la pantalla de la que se vino (no al inicio). */
  const volverAtras = useCallback(() => {
    salirNavegacion();
    setEnMesas(volverA === "mesas");
    setEnPickup(volverA === "pickup");
    setEnDelivery(volverA === "domicilio");
    setEnInicio(volverA === "inicio");
  }, [salirNavegacion, volverA]);

  /** Vuelve a la pantalla de inicio dejando la caja limpia (sale de la cuenta de mesa si la hubiera). */
  const volverAlInicio = useCallback(() => {
    salirNavegacion();
    setEnMesas(false);
    setEnPickup(false);
    setEnDelivery(false);
    setEnConsultaCuentas(false);
    setEnDevoluciones(false);
    setEnPedidosApps(false);
    setEnMonitor(false);
    setEnInicio(true);
  }, [salirNavegacion]);

  /** Ejecuta la salida que quedó en pausa mientras se decidía qué hacer con la cuenta. */
  const consumirSalidaPendiente = useCallback(() => {
    setSalidaPendiente((d) => {
      if (d === "atras") volverAtras();
      else if (d === "inicio") volverAlInicio();
      return null;
    });
  }, [volverAtras, volverAlInicio]);

  /**
   * Salir de la captura.
   *
   * Si hay un ticket guardado que NUNCA se mandó a cocina, se pregunta antes de irse. Es la
   * cuenta que existe solo porque se abrió el cobro (o un descuento) y el cliente se arrepintió:
   * ya tiene folio, y si se abandona queda ABIERTA en el corte como si fuera una venta real.
   *
   * Aplica a TODOS los modos, no solo a "Para llevar" como antes. Es cierto que en pick-up o
   * domicilio la cuenta abandonada se vería en su lista — pero se vería como un pedido real, y
   * el cajero acaba de decir que no lo es. Lo que se protege es el corte, no la visibilidad.
   *
   * La que SÍ se mandó a cocina no pregunta: esa es una cuenta legítima que se cobra después
   * desde su lista, y preguntar en cada salida de una mesa sería insoportable.
   *
   * Si no se puede consultar (sin red), se pregunta igual: el costo de preguntar de más es un
   * toque; el de no preguntar es un folio fantasma.
   */
  const intentarSalirDeCaptura = useCallback(async (destino: "atras" | "inicio") => {
    if (ticketBd !== null) {
      let enviada = false;
      try { enviada = await yaEnviadoACocina(token, ticketBd.ticketId); } catch { enviada = false; }
      if (!enviada) { setSalidaPendiente(destino); return; }
    }
    if (destino === "atras") volverAtras(); else volverAlInicio();
  }, [ticketBd, token, volverAtras, volverAlInicio]);

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
      // Un renglón agregado después del primer envío deja el botón habilitado otra vez: si no,
      // lo nuevo se queda sin mandar y la cocina nunca se entera.
      contarPendientesCocina(token, tId).then((n) => setCocinaEnviada(n === 0)).catch(() => {});
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
  const entrarCuenta = useCallback(async (ticketId: string, origen: Origen = "inicio") => {
    // Se arranca en "no enviado" y la consulta de abajo lo corrige. Dejar el valor de la cuenta
    // anterior hacía que una cuenta nueva apareciera como ya enviada, con el botón inutilizable.
    setCocinaEnviada(false);
    try {
      const [bd, recon, items] = await Promise.all([
        leerTotales(token, ticketId),
        reconstruirCarrito(token, ticketId, productos ?? []),
        leerItemsPersistidos(token, ticketId).catch(() => [] as ItemTicket[]),
      ]);
      dispatch({ tipo: "cargar", estado: { modoServicio: recon.modoServicio, lineas: recon.lineas } });
      setVolverA(origen);
      setTicketBd(bd);
      setItemsPersistidos(items);
      setEnModoMesa(true);
      setEnMesas(false);
      setEnPickup(false);
      setEnDelivery(false);
      // B1 — saber si la mesa ya fue enviada a cocina (para el botón).
      contarPendientesCocina(token, ticketId).then((n) => setCocinaEnviada(n === 0)).catch(() => {});
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
      await entrarCuenta(ticketId, "mesas");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la cuenta");
    }
  }, [token, caja.sucursal_id, turno.caja_id, turno.id, empleado.id, entrarCuenta]);

  /**
   * Manda la comanda a la estación de cocina al enviar el pedido.
   *
   * Antes la comanda solo salía al COBRAR, que en mesas, Pick-up y domicilio ocurre mucho
   * después —o nunca, si el cliente no llega—: la cocina se enteraba solo por el KDS y sin
   * papel para acompañar el platillo. Aquí se imprime en el momento en que el pedido entra.
   *
   * A diferencia del cobro NO se exige estación dedicada: allá el filtro evita duplicar el
   * ticket que acaba de salir por la misma impresora; aquí no hay nada que duplicar, y en un
   * local de una sola impresora la comanda debe salir igual.
   */
  /**
   * Imprime la comanda repartida por estación de preparación.
   *
   * Las bebidas salían en el mismo papel que la comida, así que la barra tenía que leer la comanda
   * entera para encontrar lo suyo. Ahora cada estación recibe solo sus renglones, en su impresora.
   *
   * Se imprime en SERIE, no en paralelo: son dos impresoras de red y lanzarlas a la vez multiplica
   * los tiempos de espera cuando una no responde. Un fallo no cancela las demás — que la barra se
   * quede sin papel no es razón para que la cocina tampoco lo reciba.
   *
   * Devuelve los nombres de las estaciones cuyo papel NO salió, para avisarle al cajero cuál falta.
   */
  const imprimirComandaPorAreas = useCallback(async (dc: DatosComanda, lineas: LineaConArea[]): Promise<string[]> => {
    const fallidas: string[] = [];
    for (const g of agruparComandaPorArea(lineas)) {
      const job = construirComandaJob({ ...dc, area: g.areaNombre, lineas: g.lineas });
      // onMostrar vacío: si la estación no está configurada (adaptador de preview) no se abre
      // ningún diálogo encima del cajero; simplemente no hay papel.
      const imp = obtenerImpresoraDeEstacion(estacionParaArea(g.areaId), { onMostrar: () => {} });
      try {
        const r = await imp.imprimir(job);
        if (!r.ok) fallidas.push(g.areaNombre ?? "cocina");
      } catch {
        fallidas.push(g.areaNombre ?? "cocina");
      }
    }
    return fallidas;
  }, []);

  const imprimirComandaCocina = useCallback(async (ticketId: string, soloItems: string[], esAgregado: boolean) => {
    if (soloItems.length === 0) return; // nada nuevo que mandar: no se gasta papel
    try {
      const datos = await leerTicketParaImpresion(ticketId, {
        token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre,
      });
      const dc: DatosComanda = {
        folio: datos.meta.folio,
        modoServicio: datos.meta.modoServicio,
        cajero: datos.meta.cajero,
        caja: datos.meta.caja,
        fechaIso: datos.meta.fechaIso,
        cliente: datos.entrega?.cliente ?? datos.meta.nombreCliente ?? null,
        esAgregado,
        lineas: datos.lineas
          .filter((l) => soloItems.includes(l.id))
          .map((l) => ({
            cantidad: l.cantidad, nombre: l.nombre, modificadores: l.modificadores, notaCocina: l.notaCocina,
          })),
        ancho: 80,
      };
      const fallidas = await imprimirComandaPorAreas(dc, datos.lineas.filter((l) => soloItems.includes(l.id)));
      // El pedido YA está en cocina (KDS): un fallo de papel no debe deshacer nada ni bloquear.
      // Pero tampoco se calla: si nadie avisa, la cocina se queda sin comanda y nadie se entera.
      if (fallidas.length > 0) {
        setError(`El pedido se envió a cocina, pero no se pudo imprimir la comanda de ${fallidas.join(" y ")}.`);
      }
    } catch {
      setError("El pedido se envió a cocina, pero no se pudo imprimir la comanda.");
    }
  }, [token, empleado.nombre, caja.nombre]);

  /**
   * Avisa a cocina de productos CANCELADOS.
   *
   * Sin este papel, cocina sigue preparando lo que el cliente ya canceló: el KDS puede mostrarlo,
   * pero en un local donde la cocina trabaja con la comanda impresa nadie mira una pantalla a
   * media plancha. El desperdicio es de comida y de tiempo, y se descubre al entregar.
   *
   * Va a la estación de cocina aunque sea la misma impresora de caja: aquí no hay riesgo de
   * duplicar un ticket —es un papel que no existía— y el aviso es más importante que el papel.
   */
  const imprimirComandaCancelacion = useCallback(async (ticketId: string, lineas: LineaCancelada[]) => {
    if (lineas.length === 0) return;
    try {
      const datos = await leerTicketParaImpresion(ticketId, {
        token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre,
      });
      const dc: DatosComanda = {
        folio: datos.meta.folio,
        modoServicio: datos.meta.modoServicio,
        cajero: datos.meta.cajero,
        caja: datos.meta.caja,
        fechaIso: new Date().toISOString(), // la hora de la CANCELACIÓN, no la de la orden
        cliente: datos.entrega?.cliente ?? datos.meta.nombreCliente ?? null,
        esCancelacion: true,
        lineas,
        ancho: 80,
      };
      // El aviso va a la MISMA estación donde salió el original: si una bebida se preparó en la
      // barra y la cancelación se imprime en cocina, la barra la sigue preparando.
      const areas = await leerAreasDeItems(token, lineas.map((l) => l.ticketItemId));
      const conArea: LineaConArea[] = lineas.map((l) => ({ ...l, ...(areas.get(l.ticketItemId) ?? {}) }));
      const fallidas = await imprimirComandaPorAreas(dc, conArea);
      if (fallidas.length > 0) {
        setError(`Los productos se cancelaron, pero NO se pudo avisar a ${fallidas.join(" y ")}. Avísales a mano.`);
      }
    } catch {
      setError("Los productos se cancelaron, pero NO se pudo avisar a cocina. Avísales a mano.");
    }
  }, [token, empleado.nombre, caja.nombre, imprimirComandaPorAreas]);

  /** B1 — envía la mesa a cocina (KDS) antes de cobrar. */
  const onEnviarCocina = useCallback(async () => {
    if (!ticketBd) return;
    setEnviandoCocina(true);
    setError(null);
    try {
      const yaEstaba = cocinaEnviada;
      const enviados = await enviarACocina(token, ticketBd.ticketId);
      setCocinaEnviada(true);
      await imprimirComandaCocina(ticketBd.ticketId, enviados, yaEstaba);
      // El pedido ya está en cocina: quedarse en el catálogo obliga a buscar la salida a mano y
      // se presta a seguir agregando productos a una comanda que ya salió. Se vuelve a la
      // pantalla de la que se vino (mesas, pick-up o domicilio).
      volverAtras();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
    } finally {
      setEnviandoCocina(false);
    }
  }, [token, ticketBd, cocinaEnviada, imprimirComandaCocina, volverAtras]);

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
          carrito.nombreCuenta ?? null,
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
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id, imprimirComandaCocina]);

  /**
   * Abre el cajón al empezar el cobro.
   *
   * Antes se abría al final, con el pago ya aplicado, y el cajero terminaba esperando al cajón
   * con el cliente enfrente y el billete en la mano. Contar el cambio empieza al abrir la
   * gaveta, no al cerrar la venta.
   *
   * Se abre SIEMPRE, sin saber todavía el método de pago: es lo que se pidió desde la caja, y a
   * cambio expone el efectivo también en los cobros con tarjeta. Vale la pena tenerlo presente
   * si el cajón queda a la vista del público.
   */
  const abrirCajonParaCobrar = useCallback(() => {
    obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().catch(() => {});
  }, []);

  const iniciarCobro = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
    abrirCajonParaCobrar();
    // Si el ticket ya se persistió (flujo de descuento), reusarlo: nada de re-abrir.
    if (ticketBd) {
      setTotalesCobro(ticketBd);
      return;
    }
    // Remediación Fase 3 — el cobro offline por outbox web quedó CONGELADO: el escritorio es el
    // único camino de operación y siempre habla con su gateway local. El cobro usa siempre la ruta
    // online (persistirTicket + aplicarPago). Ver cobro-offline.ts / modal-cobro-offline.tsx (@deprecated).
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
        carrito.nombreCuenta ?? null,
      );
      /* EL TICKET YA EXISTE, CON FOLIO. La pantalla tiene que saberlo desde este instante.

         Antes solo se guardaba en `totalesCobro` (para el modal), y `ticketBd` se quedaba en
         null. Si el cajero cerraba el cobro sin pagar —el cliente se arrepintió, era para la
         otra sucursal—, la pantalla creía que no había nada guardado y "Volver" se iba sin
         preguntar. El ticket quedaba ABIERTO en la base; en "Para llevar", que no tiene lista
         de cuentas, era invisible en todas partes y reaparecía días después trabando el corte.
         Y la guarda de salida, que existe justo para eso, miraba `ticketBd`... en null. */
      setTicketBd(totales);
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
          carrito.nombreCuenta ?? null,
        );
      }
      await ponerTicketEnEspera(token, bd.ticketId, etiqueta);
      // La caja queda libre para la siguiente venta; el pedido vive en BD.
      dispatch({ tipo: "limpiar" });
      setTicketBd(null);
      setItemsPersistidos([]);
      setEsperaPidiendoEtiqueta(false);
      refrescarEspera();
      consumirSalidaPendiente();
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
          carrito.nombreCuenta ?? null,
        );
        // Desde aquí el ticket es real. Si lo de abajo falla —la impresora, la red— el error se
        // muestra y el cajero sigue en la pantalla; sin esto la pantalla no sabía que el ticket
        // existía y "Volver" lo abandonaba sin preguntar.
        setTicketBd(bd);
      }
      const enviados = await enviarACocina(token, bd.ticketId);
      await imprimirComandaCocina(bd.ticketId, enviados, cocinaEnviada);
      dispatch({ tipo: "limpiar" });
      setTicketBd(null);
      setItemsPersistidos([]);
      setCocinaEnviada(false);
      // Vuelve a la lista de cuentas del modo, que es donde el cajero sigue trabajando.
      volverAtras();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cocina");
    } finally {
      setProcesandoCobro(false);
    }
  }, [carrito, ticketBd, token, caja.sucursal_id, turno.caja_id, turno.id, cocinaEnviada, imprimirComandaCocina, volverAtras]);

  /** Logo del negocio listo para la térmica. Se rasteriza al vuelo (es rápido y evita
   *  guardar estado que se desincronice si cambian el logo desde el panel). Si no hay logo
   *  o la imagen falla, devuelve null y el ticket sale sin él. */
  const logoParaTicket = useCallback(async (ancho: 58 | 80) => {
    if (!caja.logoUrl) return null;
    return rasterizarImagen(caja.logoUrl, ancho);
  }, [caja.logoUrl]);

  /**
   * Imprime el ticket de una cuenta (botón "Imprimir ticket" y Consulta de cuentas).
   *
   * El envío se ESPERA. Antes se disparaba sin `await`: la promesa se resolvía al instante, la
   * pantalla daba el ticket por impreso aunque la impresora estuviera apagada o sin papel, y el
   * botón pasaba a "Reimprimir" —que pide PIN de supervisor—. El cajero se quedaba sin poder
   * imprimir un ticket que nunca salió, y en plena hora pico eso es la caja detenida.
   *
   * Si falla, la excepción sube a quien llamó: ahí se avisa y NO se marca como impreso.
   */
  const reimprimirCuenta = useCallback(async (ticketId: string) => {
    const datos = await leerTicketParaImpresion(ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
    const imp = obtenerImpresora("CAJA", { onMostrar: () => window.print() });
    await imp.imprimir(construirTicketJob(datos, await logoParaTicket(datos.ancho)));
  }, [token, empleado.nombre, caja.nombre]);

  /** Retoma un pedido en espera: lo carga al carrito como cuenta editable (misma maquinaria de mesas). */
  const retomarEspera = useCallback(async (ticketId: string) => {
    // Retomar SUSTITUYE el carrito. Mientras la lista solo se abría desde el inicio esto daba
    // igual, porque ahí el carrito siempre está vacío; con el botón en la barra de captura, un
    // cajero a media comanda podía perder lo capturado sin un solo aviso. Se avisa en vez de
    // sustituir: lo que está a medias es trabajo que nadie más puede rehacer.
    if (carrito.lineas.length > 0) {
      setEsperaError("Tienes un pedido a medias. Cóbralo o déjalo en espera antes de retomar otro.");
      return;
    }
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
  }, [carrito.lineas.length, token, entrarCuenta, refrescarEspera]);

  /** Descarta el overlay de confirmación/recibo (sin tocar el carrito en curso).
   *  Se llama al navegar por el topbar para que un recibo viejo no reaparezca apilado. */
  // Badges del inicio: sólo se refrescan mientras el inicio está a la vista, para no consultar
  // la BD cada 15 s mientras el cajero está capturando una venta.
  useEffect(() => {
    if (!enInicio) return;
    let vivo = true;
    const cargar = () => {
      contarCuentasAbiertasPorModo(token, turno.id)
        .then((c) => { if (vivo) setCuentasAbiertas(c); })
        .catch(() => { /* el badge es informativo; su fallo no debe romper el inicio */ });
    };
    cargar();
    const id = setInterval(cargar, 15000);
    return () => { vivo = false; clearInterval(id); };
  }, [enInicio, token, turno.id]);

  // ADR 0011 — pedidos de apps: se consultan SIEMPRE (no solo en el inicio) porque un pedido de
  // Uber tiene minutos para aceptarse y el cajero puede estar en medio de una venta. Una consulta
  // ligera cada 10 s; el sonido suena una vez por pedido nuevo pendiente.
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      leerPedidosApps(token, caja.sucursal_id)
        .then((ps) => {
          if (!vivo) return;
          const pendientes = ps.filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR");
          setNPedidosApps(pendientes.length);
          const vistos = idsAppsVistos.current;
          if (vistos === null) {
            // Primera carga: lo que ya estaba no suena, solo lo que llegue a partir de ahora.
            idsAppsVistos.current = new Set(ps.map((p) => p.id));
            return;
          }
          const nuevos = ps.filter((p) => !vistos.has(p.id));
          ps.forEach((p) => vistos.add(p.id));
          if (nuevos.length > 0) {
            try { void new Audio("/sonidos/pedido-app.wav").play().catch(() => {}); } catch { /* sin audio: el badge basta */ }
          }
        })
        .catch(() => { /* informativo: sin red la caja sigue vendiendo */ });
    };
    cargar();
    const id = setInterval(cargar, 10000);
    return () => { vivo = false; clearInterval(id); };
  }, [token, caja.sucursal_id]);

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

  /**
   * Escape = cerrar lo que esté encima, o volver si no hay nada abierto.
   *
   * Centralizado en vez de repetido en cada modal: así la PRECEDENCIA se lee de un vistazo y no
   * hay dos capas cerrándose con la misma tecla. El orden es del más interno al más externo, que
   * es lo que espera cualquiera que haya usado un teclado.
   *
   * No cierra nada mientras un cobro está en curso: interrumpir a media aplicación de pago es
   * justo lo que no debe poder hacerse por reflejo.
   */
  const alEscapar = useMemo(() => {
    const capas: [boolean, () => void][] = [
      [cancelandoItem != null, () => setCancelandoItem(null)],
      [descuentoItem != null, () => setDescuentoItem(null)],
      [cancelandoTicket, () => setCancelandoTicket(false)],
      [mostrarRecibo, () => setMostrarRecibo(false)],
      [confirmacion != null, nuevoTicket],
      [totalesCobro != null && !procesandoCobro, () => setTotalesCobro(null)],
      [agregandoA != null, () => setAgregandoA(null)],
      [viendoMapaMesas, () => { setViendoMapaMesas(false); setPidiendoMesa(true); }],
      [pidiendoMesa, () => setPidiendoMesa(false)],
      [nombreCuentaAbierto, () => setNombreCuentaAbierto(false)],
      [clienteDomAbierto, () => setClienteDomAbierto(false)],
      [esperaPidiendoEtiqueta, () => setEsperaPidiendoEtiqueta(false)],
      [esperaListaAbierta, () => setEsperaListaAbierta(false)],
      [movimientoAbierto, () => setMovimientoAbierto(false)],
      [abrirCajaAbierto, () => setAbrirCajaAbierto(false)],
      [cambiarPinAbierto, () => setCambiarPinAbierto(false)],
      [misPropinasAbierto, () => setMisPropinasAbierto(false)],
      [configImpresoraAbierto, () => setConfigImpresoraAbierto(false)],
      [salidaPendiente != null, () => setSalidaPendiente(null)],
      [confirmandoCierre, () => setConfirmandoCierre(false)],
      [menuGeneralAbierto, () => setMenuGeneralAbierto(false)],
      [cerrando, () => setCerrando(false)],
      // Nada abierto: Escape equivale al botón Volver de la pantalla de captura.
      [!enInicio && !enKds && !enMonitor && !enConsultaCuentas && !enDevoluciones && !enPedidosApps
        && !enDelivery && !enPickup && !enMesas, () => intentarSalirDeCaptura("atras")],
    ];
    return capas.find(([visible]) => visible)?.[1] ?? null;
  }, [cancelandoItem, descuentoItem, cancelandoTicket, mostrarRecibo, confirmacion, totalesCobro,
      procesandoCobro, agregandoA, viendoMapaMesas, pidiendoMesa, nombreCuentaAbierto,
      clienteDomAbierto, esperaPidiendoEtiqueta, esperaListaAbierta, movimientoAbierto,
      abrirCajaAbierto, cambiarPinAbierto, misPropinasAbierto, configImpresoraAbierto,
      salidaPendiente, confirmandoCierre, menuGeneralAbierto, cerrando, enInicio, enKds, enMonitor,
      enConsultaCuentas, enDevoluciones, enPedidosApps, enDelivery, enPickup, enMesas, nuevoTicket,
      intentarSalirDeCaptura]);
  useEscape(alEscapar);

  if (cerrando) {
    return (
      <PantallaCierre
        token={token}
        empleado={empleado}
        caja={caja}
        turno={turno}
        onCancelar={() => setCerrando(false)}
        onCerrado={onCerrarTurno}
        // Sale del cierre y abre la cuenta que lo bloquea. Sin esto, saber CUÁL es solo cambia
        // dónde empieza la búsqueda: modos como "Para llevar" no tienen lista donde encontrarla.
        onIrACuenta={async (ticketId) => { setCerrando(false); await entrarCuenta(ticketId, "inicio"); }}
      />
    );
  }

  /**
   * Modales que se abren desde el menú general y desde la captura. Se definen una vez porque el
   * componente tiene un `return` por pantalla: si vivieran dentro del JSX del catálogo —donde
   * estaban— abrirlos desde el inicio no mostraría nada.
   */
  /**
   * Cobro, confirmación y recibo. Se definen aquí, fuera del JSX de la pantalla de captura,
   * porque el cobro se dispara TAMBIÉN desde la lista de cuentas. Antes vivían dentro de ese
   * return y por eso cobrar desde la lista obligaba a cargar la cuenta y saltar al catálogo
   * —el cajero terminaba en la pantalla de tomar productos sin haberla pedido—. El modal no
   * necesita el carrito: le basta el ticket y sus totales.
   */
  const modalesCobro = (
    <>
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
            setCocinaEnviada(false);
            dispatch({ tipo: "limpiar" });
            setCuentasVersion((v) => v + 1); // la cuenta pagada ya no va en la lista
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
              // Solo "Para llevar": es el único modo que va del carrito al cobro sin pasar por la
              // lista de cuentas, así que no hay un momento anterior para imprimirlo. La regla y su
              // historia están en `debeImprimirTicketAlCobrar`.
              if (debeImprimirTicketAlCobrar(datos.meta.modo)) {
                try {
                  const job = construirTicketJob(datos, await logoParaTicket(datos.ancho));
                  await obtenerImpresora("CAJA", { onMostrar: () => setMostrarRecibo(true) }).imprimir(job);
                } catch {
                  // Un fallo de la impresora no puede llevarse por delante lo que viene después:
                  // la comanda, el cajón y la liquidación del reparto van detrás.
                  setEstadoTicket("error");
                }
              }
              // Comanda automática a la estación de cocina.
              //
              // SOLO en "Para llevar". Es el único modo donde el pedido va del carrito al cobro sin
              // pasar por "Enviar a cocina": si no saliera aquí, la cocina no se enteraría nunca.
              //
              // En comedor, Pick-up y Domicilio la comanda YA salió al enviar el pedido, y volver a
              // imprimirla al cobrar hacía que la cocina recibiera dos veces lo mismo —con el riesgo
              // real de que alguien prepare el pedido otra vez, además del papel de más. Al cobrar,
              // esos modos imprimen únicamente el ticket del cliente.
              //
              // Y solo si la estación de cocina es una impresora distinta de la de caja: con una
              // sola impresora, el ticket que acaba de salir ya es el papel.
              if (debeImprimirComandaAlCobrar(datos.meta.modo, hayEstacionDeCocinaDedicada())) {
                // También repartida: en Para llevar la bebida va a la barra igual que en el resto.
                imprimirComandaPorAreas(datosCom, datos.lineas).catch(() => {});
              }
              // Reparto a domicilio: se cierra con lo que de verdad entró. Best-effort — la venta
              // ya quedó cobrada y un fallo aquí no debe deshacerla.
              if (datos.meta.modo === "DELIVERY_PROPIO") {
                const efectivo = datos.pagos.filter((p) => p.metodo === "Efectivo").reduce((a, p) => a + p.montoMxn, 0);
                const otros = datos.pagos.filter((p) => p.metodo !== "Efectivo").reduce((a, p) => a + p.montoMxn, 0);
                const r = await cerrarRepartoAlCobrar(token, {
                  ticketId, efectivo, tarjeta: otros, liquidadoPorId: empleado.id,
                });
                if (!r.liquidada && r.motivo && r.motivo !== "sin asignación") {
                  setError(`La venta se cobró, pero no se pudo liquidar al repartidor: ${r.motivo}`);
                }
              }
              // El cajón NO se abre aquí. Ya se abrió al presionar "Cobrar" (`abrirCajonParaCobrar`),
              // que es lo que la caja pidió: contar el cambio empieza al abrir la gaveta, no al
              // cerrar la venta. Esta segunda apertura es de cuando era la única, y desde la 0.4.36
              // convivían las dos: el cajón se abría, el cajero lo cerraba, y al imprimirse el
              // ticket se volvía a abrir solo.
              //
              // Los dos caminos que llegan al cobro —capturar y cobrar, o cobrar desde la lista de
              // cuentas— abren el cajón antes, así que quitarlo de aquí no deja ningún flujo sin
              // apertura.
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
            // Con Epson/genérica manda ESC/POS; con Preview, window.print() imprime el recibo visible.
            if (vista === "cocina" && datosComanda) {
              obtenerImpresora("COCINA", { onMostrar: () => window.print() }).imprimir(construirComandaJob(datosComanda));
            } else {
              logoParaTicket(datosTicket.ancho).then((logo) =>
                obtenerImpresora("CAJA", { onMostrar: () => window.print() }).imprimir(construirTicketJob(datosTicket, logo)),
              );
            }
          }}
          onCerrar={() => setMostrarRecibo(false)}
          onNuevoTicket={nuevoTicket}
        />
      )}
    </>
  );

  const modalesCompartidos = (
    <>
      {/* Cuenta guardada que se está abandonando. Sin esto quedaba viva en la base y sin ninguna
          pantalla que la mostrara: "Para llevar" no tiene lista de cuentas, así que reaparecía
          días después trabando el corte. Se pregunta aquí, que es cuando el cajero sabe qué pasó. */}
      {salidaPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="font-display text-[19px] font-semibold">Esta cuenta ya tiene folio</div>
            <p className="mt-2 text-[13.5px] leading-snug text-ink-2">
              {ticketBd?.folio ? <><span className="font-semibold">{ticketBd.folio}</span> · </> : null}
              {fmtMxn(ticketBd?.total ?? 0)}.{" "}
              {carrito.modoServicio === "PARA_LLEVAR"
                ? "Si sales sin resolverla, queda abierta y no vas a poder verla en ninguna pantalla — solo aparecería al cerrar el turno, trabándolo."
                : "Si sales sin resolverla, queda abierta en la lista como si fuera un pedido real, y aparece en el corte como cuenta sin cobrar."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {/* En espera solo tiene sentido donde hay lista de espera: "Para llevar". En los
                  demás modos la cuenta en espera desaparece de su lista (filtran en_espera=false)
                  y sería otra forma de perderla. */}
              {carrito.modoServicio === "PARA_LLEVAR" && (
                <Button onClick={() => { setEsperaError(null); setEsperaPidiendoEtiqueta(true); }}>
                  Dejarla en espera
                </Button>
              )}
              <button
                type="button"
                onClick={() => setCancelandoTicket(true)}
                className="h-11 rounded border border-danger/40 text-[14px] font-semibold text-danger transition hover:bg-danger/5"
              >
                Cancelar la cuenta
              </button>
              <button
                type="button"
                onClick={() => setSalidaPendiente(null)}
                className="h-11 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
              >
                Seguir capturando
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmandoCierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div className="font-display text-[19px] font-semibold">¿Cerrar el turno actual?</div>
            <p className="mt-2 text-[13.5px] leading-snug text-ink-2">
              Vas a pasar al arqueo de caja: contar el efectivo, declararlo y generar el corte.
              El turno queda cerrado y hay que abrir uno nuevo para seguir vendiendo.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoCierre(false)}
                className="h-11 flex-1 rounded border border-line-strong text-[14px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
              >
                Cancelar
              </button>
              <Button className="h-11 flex-1" onClick={() => { setConfirmandoCierre(false); setCerrando(true); }}>
                Sí, cerrar turno
              </Button>
            </div>
          </div>
        </div>
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
      {abrirCajaAbierto && (
        <ModalAbrirCaja
          token={token}
          empleado={empleado}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          onCerrar={() => setAbrirCajaAbierto(false)}
        />
      )}
    </>
  );

  if (enKds) {
    return <PantallaKds token={token} caja={caja} onSalir={() => setEnKds(false)} />;
  }

  // Pantalla de inicio: punto de entrada del turno. Desde aquí se elige modo u operación.
  if (enInicio) {
    return (
      <>
        <PantallaInicio
          caja={caja}
          turno={turno}
          empleado={empleado}
          nCuentasComedor={cuentasAbiertas.comedor}
          nCuentasPickup={cuentasAbiertas.pickup}
          nCuentasDomicilio={cuentasAbiertas.domicilio}
          nEnEspera={nEnEspera}
          nPedidosApps={nPedidosApps}
          onPedidosApps={() => { setEnInicio(false); setEnPedidosApps(true); }}
          onComedor={() => { setEnInicio(false); setEnMesas(true); }}
          onPickup={() => { setEnInicio(false); setEnPickup(true); }}
          onDomicilio={() => { setEnInicio(false); setEnDelivery(true); }}
          onParaLlevar={() => {
            // Venta de mostrador: el modo queda fijado y se entra directo a capturar.
            dispatch({ tipo: "modo", modo: "PARA_LLEVAR" });
            setCocinaEnviada(false);
            setVolverA("inicio");
            setEnInicio(false);
          }}
          onMonitorVentas={() => { setEnInicio(false); setEnMonitor(true); }}
          onConsultarCuentas={() => { setEnInicio(false); setEnConsultaCuentas(true); }}
          onMovimientoCaja={() => setMovimientoAbierto(true)}
          onCorteX={() => { setEnInicio(false); setEnMonitor(true); }}
          onAbrirTurno={() => { /* aquí siempre hay turno abierto: el botón no se muestra */ }}
          onCerrarTurno={() => setConfirmandoCierre(true)}
          onMenu={() => setMenuGeneralAbierto(true)}
          online={online}
        />
        {movimientoAbierto && (
          <ModalMovimientoCaja
            token={token}
            empleado={empleado}
            caja={caja}
            turno={turno}
            onRegistrado={(m) => {
              setMovimientoAbierto(false);
              setMovimientoToast({ folio: m.folio, etiqueta: m.etiqueta, monto: m.monto });
              setTimeout(() => setMovimientoToast(null), 4000);
            }}
            onCerrar={() => setMovimientoAbierto(false)}
          />
        )}
        {menuGeneralAbierto && (
          <MenuGeneral
            onCerrar={() => setMenuGeneralAbierto(false)}
            onKds={() => { setMenuGeneralAbierto(false); setEnInicio(false); setEnKds(true); }}
            onDevoluciones={() => { setMenuGeneralAbierto(false); setEnInicio(false); setEnDevoluciones(true); }}
            onEnEspera={() => { setEsperaError(null); setEsperaListaAbierta(true); }}
            onAbrirCajon={() => setAbrirCajaAbierto(true)}
            nEnEspera={nEnEspera}
            onCambiarCajero={onCambiarCajero}
            onBloquear={onBloquear}
            onCambiarPin={() => setCambiarPinAbierto(true)}
            onMisPropinas={() => setMisPropinasAbierto(true)}
            onImpresora={() => setConfigImpresoraAbierto(true)}
            onCerrarTurno={() => setConfirmandoCierre(true)}
          />
        )}
        {configImpresoraAbierto && <ModalConfigImpresora token={token} sucursalId={caja.sucursal_id} onCerrar={() => setConfigImpresoraAbierto(false)} />}
        {modalesCompartidos}
        {cerrando && (
          <PantallaCierre
            token={token}
            empleado={empleado}
            caja={caja}
            turno={turno}
            onCancelar={() => setCerrando(false)}
            onCerrado={onCerrarTurno}
          />
        )}
      </>
    );
  }

  if (enMonitor) {
    return <PantallaMonitorVentas token={token} caja={caja} turno={turno} onSalir={volverAlInicio} />;
  }

  if (enDelivery || enPickup || enMesas) {
    const modo = enPickup ? "DRIVE_THRU" : enMesas ? "COMER_AQUI" : "DELIVERY_PROPIO";
    return (
      <>
        <PantallaCuentasModo
        key={`cuentas-${modo}-${cuentasVersion}`}
        token={token}
        caja={caja}
        turno={turno}
        empleado={empleado}
        modo={modo}
        onSalir={volverAlInicio}
        // Solo Comedor: pick-up y domicilio no apartan mesa, y un botón muerto ahí sería ruido.
        onVerReservaciones={modo === "COMER_AQUI" ? () => setViendoReservaciones(true) : undefined}
        onAbrirCuenta={() => {
          // Cuenta nueva: se fija el modo y se entra al catálogo con el carrito limpio.
          dispatch({ tipo: "limpiar" });
          dispatch({ tipo: "modo", modo });
          setTicketBd(null);
          setItemsPersistidos([]);
          setCocinaEnviada(false);
          setVolverA(modo === "DRIVE_THRU" ? "pickup" : modo === "COMER_AQUI" ? "mesas" : "domicilio");
          // Comedor NO entra al catálogo todavía: primero hay que saber a qué mesa. El modal se
          // encarga y, al resolverla, abre la cuenta y entra.
          if (modo === "COMER_AQUI") { setPidiendoMesa(true); return; }
          setEnPickup(false);
          setEnDelivery(false);
          // Domicilio: lo primero que se pregunta por teléfono es a nombre de quién y a dónde
          // va, antes de anotar qué quiere. Se abre el modal de una vez para no obligar al
          // cajero a acordarse de asignarlo después (y que el pedido salga sin dirección).
          if (modo === "DRIVE_THRU") setNombreCuentaAbierto(true);
          if (modo === "DELIVERY_PROPIO") setClienteDomAbierto(true);
        }}
        onAgregarProductos={(ticketId: string) => setAgregandoA(ticketId)}
        onCobrar={async (ticketId) => {
          abrirCajonParaCobrar();
          // El cobro se abre ENCIMA de la lista, sin cargar la cuenta ni saltar al catálogo:
          // el cajero pidió cobrar, no capturar productos. El modal solo necesita los totales.
          try {
            setTotalesCobro(await leerTotales(token, ticketId));
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo abrir el cobro");
          }
        }}
        onImprimirTicket={reimprimirCuenta}
        onComandaCancelacion={imprimirComandaCancelacion}
        extraPorCuenta={
          enDelivery
            ? (c, recargar) =>
                c.estadoCocina === "LISTO" ? (
                  <button
                    type="button"
                    onClick={() => setSaliendoDomicilio({ ticketId: c.ticketId, folio: c.folio, total: c.total, recargar })}
                    className="flex h-9 flex-shrink-0 items-center rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                  >
                    Marcar salida
                  </button>
                ) : null
            : undefined
        }
        />
        {saliendoDomicilio && (
          <ModalSalidaDomicilio
            token={token}
            ticketId={saliendoDomicilio.ticketId}
            folio={saliendoDomicilio.folio}
            total={saliendoDomicilio.total}
            onListo={() => { const r = saliendoDomicilio.recargar; setSaliendoDomicilio(null); r(); }}
            onCerrar={() => setSaliendoDomicilio(null)}
          />
        )}
        {/* El cobro va aquí también: sin esto, abrirlo desde la lista no mostraría nada, porque
            el componente tiene un return por pantalla. */}
        {modalesCobro}
        {pidiendoMesa && (
          <ModalNumeroMesa
            token={token}
            tenantId={caja.tenant_id}
            sucursalId={caja.sucursal_id}
            onVerMesas={() => { setPidiendoMesa(false); setViendoMapaMesas(true); }}
            onCerrar={() => setPidiendoMesa(false)}
            onMesaElegida={async (mesaId) => {
              setPidiendoMesa(false);
              await onAbrirCuentaMesa(mesaId);
            }}
          />
        )}
        {viendoMapaMesas && (
          // El mapa como CONSULTA opcional, no como paso obligatorio: sirve para ver qué está
          // ocupado cuando no te acuerdas del número.
          <div className="fixed inset-0 z-50 bg-bg">
            <PantallaMesas
              token={token}
              caja={caja}
              onSalir={() => { setViendoMapaMesas(false); setPidiendoMesa(true); }}
              onAbrirCuenta={async (mesaId: string) => { setViendoMapaMesas(false); await onAbrirCuentaMesa(mesaId); }}
              onRetomar={(ticketId: string) => { setViendoMapaMesas(false); entrarCuenta(ticketId, "mesas"); }}
              onVerReservaciones={() => setViendoReservaciones(true)}
            />
          </div>
        )}
        {viendoReservaciones && (
          // Encima del mapa: al cerrar se vuelve a las mesas, que es de donde
          // se entró y donde el mesero sigue trabajando.
          <div className="fixed inset-0 z-[55] bg-bg">
            <PantallaReservaciones token={token} caja={caja} onSalir={() => setViendoReservaciones(false)} />
          </div>
        )}
        {agregandoA && (
          <ModalAgregarProductos
            token={token}
            ticketId={agregandoA}
            modo={modo}
            categorias={categorias}
            productos={productos}
            onCerrar={(huboCambios) => {
              setAgregandoA(null);
              if (huboCambios) setCuentasVersion((v) => v + 1); // totales y conteos cambiaron
            }}
            onEnviarCocina={async (ticketId) => {
              // Se consulta ANTES de mandar: después el ticket ya está EN_COCINA y toda comanda
              // parecería un agregado, incluso la primera.
              const esAgregado = await yaEnviadoACocina(token, ticketId);
              const enviados = await enviarACocina(token, ticketId);
              await imprimirComandaCocina(ticketId, enviados, esAgregado);
            }}
          />
        )}
      </>
    );
  }

  if (enConsultaCuentas) {
    return <PantallaConsultaCuentas token={token} caja={caja} turno={turno} empleado={empleado} onSalir={volverAlInicio} onReimprimir={reimprimirCuenta} />;
  }

  if (enDevoluciones) {
    return <PantallaDevoluciones token={token} caja={caja} turno={turno} empleado={empleado} onSalir={volverAlInicio} />;
  }

  if (enPedidosApps) {
    return <PantallaPedidosApps token={token} caja={caja} onSalir={volverAlInicio} />;
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
      {/* Barra de captura: aquí no van menú, KDS ni cuentas. El cajero está anotando un pedido y
          cada ícono de más es una salida en falso; todo eso vive en el inicio.

          La excepción son los pedidos en espera, y SOLO en "Para llevar". Es el único modo sin
          lista de cuentas propia: lo que se deja en espera ahí no aparece en ninguna otra
          pantalla, y recuperarlo obligaba a volver al inicio y entrar al menú. En mostrador, que
          es donde se atiende de pie y por turnos, ese viaje es justo el que no hay tiempo de
          hacer. Los demás modos ya tienen su lista de cuentas abiertas y no lo necesitan.

          Va a la derecha, opuesto a "Volver": son acciones distintas y pegarlas invitaría a
          pulsar la equivocada con prisa. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <BotonVolver onClick={() => intentarSalirDeCaptura("atras")} />
        {carrito.modoServicio === "PARA_LLEVAR" && (
          <button
            type="button"
            onClick={() => { setEsperaError(null); setEsperaListaAbierta(true); }}
            className="ml-auto flex h-10 flex-shrink-0 items-center gap-2 rounded border border-line-strong px-3 text-[13.5px] font-semibold text-ink transition hover:border-ink hover:bg-hover"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
            Cuentas en espera
            {nEnEspera > 0 && (
              <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-bold tabular-nums text-white">
                {nEnEspera}
              </span>
            )}
          </button>
        )}
      </div>
      {configImpresoraAbierto && <ModalConfigImpresora token={token} sucursalId={caja.sucursal_id} onCerrar={() => setConfigImpresoraAbierto(false)} />}
      {clienteDomAbierto && (
        <ModalClienteDomicilio
          token={token}
          tenantId={caja.tenant_id}
          sucursalId={caja.sucursal_id}
          onSeleccionar={(c) => { dispatch({ tipo: "cliente", cliente: c }); setClienteDomAbierto(false); }}
          onCerrar={() => setClienteDomAbierto(false)}
        />
      )}
      {nombreCuentaAbierto && (
        <ModalNombreCuenta
          onListo={(n) => { dispatch({ tipo: "nombre_cuenta", nombre: n }); setNombreCuentaAbierto(false); }}
          onOmitir={() => setNombreCuentaAbierto(false)}
        />
      )}
      {cambiarPinAbierto && (
        <ModalCambiarPin token={token} onListo={() => setCambiarPinAbierto(false)} onCerrar={() => setCambiarPinAbierto(false)} />
      )}
      {misPropinasAbierto && (
        <ModalMisPropinas token={token} meseroId={empleado.id} meseroNombre={empleado.nombre} onCerrar={() => setMisPropinasAbierto(false)} />
      )}

      <div className="flex min-h-0 flex-1">
          <CatalogoProductos
            categorias={categorias}
            productos={productos}
            bloqueado={menuBloqueado}
            onTapProducto={onTapProducto}
          />
        <SidebarTicket
          estado={carrito}
          onCantidad={(id, c) => dispatch({ tipo: "cantidad", clientId: id, cantidad: c })}
          onQuitar={(id) => dispatch({ tipo: "quitar", clientId: id })}
          onCancelarItemPersistido={ticketBd ? onCancelarItemPersistido : undefined}
          onDescuentoItem={ticketBd ? onDescuentoItemSolicitado : undefined}
          onLimpiar={!ticketBd ? () => dispatch({ tipo: "limpiar" }) : undefined}
          onCancelarTicket={ticketBd ? () => setCancelandoTicket(true) : undefined}
          onEditarCliente={() => setClienteDomAbierto(true)}
          onNotaLinea={(id, nota) => dispatch({ tipo: "nota_linea", clientId: id, nota })}
          onNotaOrden={(nota) => dispatch({ tipo: "nota_orden", nota })}
          onCobrar={iniciarCobro}
          onPonerEnEspera={online ? () => { setEsperaError(null); setEsperaPidiendoEtiqueta(true); } : undefined}
          // Comedor va por la MISMA rama que Pick-up y domicilio: su cuenta también queda
          // abierta y se cobra después desde la lista. Antes entraba por la otra, que pinta
          // "Cobrar" como acción principal y "Enviar a cocina" debajo — invitando a cobrar una
          // mesa que apenas está ordenando, que es justo lo que no se quiere en comedor.
          onEnviarCocina={undefined}
          onEnviarCocinaAbierto={
            enModoMesa && ticketBd
              ? onEnviarCocina
              : !enModoMesa && (carrito.modoServicio === "DRIVE_THRU" || carrito.modoServicio === "DELIVERY_PROPIO")
                ? enviarACocinaAbierto
                : undefined
          }
          folioCuenta={ticketBd?.folio ?? null}
          cocinaEnviada={cocinaEnviada}
          enviandoCocina={enviandoCocina}
          onAplicarDescuento={onAplicarDescuento}
          descuentoMxn={ticketBd?.descuentos ?? 0}
            promocionMxn={ticketBd?.promociones ?? 0}
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
      {modalesCompartidos}
      {modalesCobro}
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
            setMovimientoToast({ folio: m.folio, etiqueta: m.etiqueta, monto: m.monto });
            setTimeout(() => setMovimientoToast(null), 4000);
          }}
          onCerrar={() => setMovimientoAbierto(false)}
        />
      )}
      {movimientoToast && (
        <div className="fixed left-1/2 top-20 z-[80] -translate-x-1/2 rounded-lg bg-ink px-5 py-3 text-[13.5px] font-medium text-white shadow-xl">
          <span className="font-semibold">{movimientoToast.folio}</span> · {movimientoToast.etiqueta} · {fmtMxn(movimientoToast.monto)} registrado
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
            consumirSalidaPendiente();
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
    </div>
  );
}
