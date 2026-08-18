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
import { obtenerImpresora } from "../lib/print/adapter";
import { hayEstacionDeCocinaDedicada } from "../lib/print/config";
import { ModalConfigImpresora } from "./modal-config-impresora";
import { ModalClienteDomicilio } from "./modal-cliente-domicilio";
import { ModalNombreCuenta } from "./modal-nombre-cuenta";
import { ModalCambiarPin } from "./modal-cambiar-pin";
import { ModalMisPropinas } from "./modal-mis-propinas";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { construirTicketJob } from "../lib/print/ticket-builder";
import { rasterizarImagen } from "../lib/print/rasterizar";
import { construirComandaJob, type DatosComanda } from "../lib/print/comanda-builder";
import { ReciboPreview } from "./recibo-preview";
import { PantallaCierre } from "./pantalla-cierre";
import { PantallaKds } from "@vim/kds-core";
import { PantallaMesas } from "./pantalla-mesas";
import { PantallaConsultaCuentas } from "./pantalla-consulta-cuentas";
import { PantallaDevoluciones } from "./pantalla-devoluciones";
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
import { marcarSalidaDomicilio } from "../lib/cuentas-abiertas";
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
    setEnMonitor(false);
    setEnInicio(true);
  }, [salirNavegacion]);

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
      // onMostrar vacío: si la estación de cocina no está configurada (adaptador de preview) no
      // se abre ningún diálogo encima del cajero; simplemente no hay papel.
      const r = await obtenerImpresora("COCINA", { onMostrar: () => {} }).imprimir(construirComandaJob(dc));
      // El pedido YA está en cocina (KDS): un fallo de papel no debe deshacer nada ni bloquear.
      // Pero tampoco se calla: si nadie avisa, la cocina se queda sin comanda y nadie se entera.
      if (!r.ok) setError("El pedido se envió a cocina, pero no se pudo imprimir la comanda (impresora de cocina sin responder).");
    } catch {
      setError("El pedido se envió a cocina, pero no se pudo imprimir la comanda.");
    }
  }, [token, empleado.nombre, caja.nombre]);

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

  const iniciarCobro = useCallback(async () => {
    if (carrito.lineas.length === 0) return;
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

  /** Reimprime el ticket de una cuenta cerrada (desde la Consulta de cuentas). */
  const reimprimirCuenta = useCallback(async (ticketId: string) => {
    const datos = await leerTicketParaImpresion(ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
    const imp = obtenerImpresora("CAJA", { onMostrar: () => window.print() });
    imp.imprimir(construirTicketJob(datos, await logoParaTicket(datos.ancho)));
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
              // Auto-impresión: el PrintJob es la fuente para el papel (Epson/genérica cuando esté).
              // Hoy con PreviewAdapter solo abre el overlay; el preview se renderiza desde los datos.
              const job = construirTicketJob(datos, await logoParaTicket(datos.ancho));
              await obtenerImpresora("CAJA", { onMostrar: () => setMostrarRecibo(true) }).imprimir(job);
              // Comanda automática a la estación de cocina — solo si hay una estación dedicada
              // distinta de la de caja (si es la misma impresora, ya salió el ticket; no duplicar).
              if (hayEstacionDeCocinaDedicada()) {
                obtenerImpresora("COCINA", { onMostrar: () => {} })
                  .imprimir(construirComandaJob(datosCom))
                  .catch(() => {});
              }
              // Cajón automático: solo si hubo efectivo de por medio (hay cambio que dar o
              // fondo que actualizar). Tarjeta/otros no mueven billetes — abrirlo ahí solo
              // expone el efectivo sin necesidad.
              if (datos.pagos.some((p) => p.metodo === "Efectivo")) {
                obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon();
              }
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
          onCerrarTurno={() => setCerrando(true)}
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
              setMovimientoToast({ folio: m.folio, tipo: m.tipo, monto: m.monto });
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
            onCerrarTurno={() => setCerrando(true)}
          />
        )}
        {configImpresoraAbierto && <ModalConfigImpresora onCerrar={() => setConfigImpresoraAbierto(false)} />}
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
          // El cobro se abre ENCIMA de la lista, sin cargar la cuenta ni saltar al catálogo:
          // el cajero pidió cobrar, no capturar productos. El modal solo necesita los totales.
          try {
            setTotalesCobro(await leerTotales(token, ticketId));
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo abrir el cobro");
          }
        }}
        onImprimirTicket={reimprimirCuenta}
        extraPorCuenta={
          enDelivery
            ? (c, recargar) =>
                c.estadoCocina === "LISTO" ? (
                  <button
                    type="button"
                    onClick={async () => { await marcarSalidaDomicilio(token, c.ticketId); recargar(); }}
                    className="flex h-9 flex-shrink-0 items-center rounded border border-line-strong px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                  >
                    Marcar salida
                  </button>
                ) : null
            : undefined
        }
        />
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
            />
          </div>
        )}
        {agregandoA && (
          <ModalAgregarProductos
            token={token}
            ticketId={agregandoA}
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
      {/* Barra de captura: aquí no van menú, KDS, cuentas ni pedidos en espera. El cajero está
          anotando un pedido y cada ícono de más es una salida en falso; todo eso vive en el
          inicio. Lo único que hace falta es regresar a donde estaba. */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <BotonVolver onClick={volverAtras} />
      </div>
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
          onEnviarCocina={enModoMesa && ticketBd ? onEnviarCocina : undefined}
          onEnviarCocinaAbierto={
            !enModoMesa && (carrito.modoServicio === "DRIVE_THRU" || carrito.modoServicio === "DELIVERY_PROPIO")
              ? enviarACocinaAbierto
              : undefined
          }
          folioCuenta={ticketBd?.folio ?? null}
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
    </div>
  );
}
