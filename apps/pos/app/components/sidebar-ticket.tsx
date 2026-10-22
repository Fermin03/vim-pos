"use client";
import { Button, Icono } from "@vim/ui/styles";
import { useEffect, useState } from "react";
import type { EstadoCarrito, LineaCarrito } from "../lib/carrito";
import { etiquetaModo } from "@vim/db/modos-servicio";
import { calcularTotalesDisplay, totalLinea } from "../lib/carrito";
import { setPreciosVisibles, usePreciosVisibles } from "../lib/precios-visibles";
import { fmtMxn } from "../lib/turno";
import type { FranjaLealtad } from "../lib/lealtad-reglas";
import { RenglonItem } from "./renglon-item";
import { useEscape } from "../lib/use-escape";
import { aGranel, contarProductos } from "../lib/unidades";

/* ── helpers ─────────────────────────────────────────────────── */
/* ── Íconos SVG inline (del mockup P-066) ────────────────────── */
function IconoTicket() {
  return (
    <Icono nombre="recibo" className="h-[46px] w-[46px] text-line-strong" />
  );
}

/* ── Botones del renglón ──────────────────────────────────────── */
// 44px de alto: el mínimo táctil del doc de diseño. Eran de 36 y de 26 ("Nota", "Quitar"), y en
// hora pico se tocaba el de al lado. Solo se anima el apachurrón (transform) y el fondo.
const BOTON_STEPPER =
  "flex h-11 w-11 items-center justify-center rounded-md text-20 font-semibold leading-none text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97] disabled:cursor-default disabled:text-ink-3 disabled:opacity-50 disabled:hover:bg-transparent";
const BOTON_RENGLON =
  "h-11 flex-shrink-0 rounded-md px-2.5 text-14 font-semibold transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.97]";
// La acción principal del pie (Cobrar, o Enviar a cocina en las cuentas que se cobran después):
// 60px fijos, no un padding que cambia con la letra. Es el botón que cierra cada venta.
const BOTON_PRINCIPAL =
  "flex h-[60px] w-full items-center justify-center gap-[10px] rounded-lg bg-accent px-5 font-display text-20 font-bold text-white shadow-[0_1px_3px_rgb(var(--accent)/0.3)] transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none disabled:active:scale-100";
// Fila secundaria (Precios, Descuento, En espera): tres en 256px útiles a 1024, así que sin icono.
// `flex-auto` y no `flex-1`: cada botón parte del ancho de su palabra y se reparte el resto; a
// tercios iguales "Descuento" no cabía y se cortaba a "Descuen…".
const BOTON_SECUNDARIO =
  "flex h-11 min-w-0 flex-auto items-center justify-center rounded-md border px-2 text-14 font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.98] disabled:cursor-default disabled:active:scale-100";
// Botones del pie que no son Cobrar: mismo alto (44px), mismo peso.
const BOTON_PIE =
  "flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-14 font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.98] disabled:cursor-default disabled:active:scale-100";

/* ── Componente principal ─────────────────────────────────────── */
/** Panel de la tienda: «Quitar» saca UNA pieza de un renglón con varias. Una pesada se quita completa. */
export const quitaUna = (l: LineaCarrito, simple: boolean): boolean => simple && l.cantidad > 1 && !aGranel(l.producto.tipoVenta);

export function SidebarTicket({
  estado,
  onCantidad,
  onQuitar,
  onCancelarItemPersistido,
  onDescuentoItem,
  onLimpiar,
  onCancelarTicket,
  onEditarCliente,
  onCambiarZona,
  onNotaLinea,
  onNotaOrden,
  onCobrar,
  onEfectivoExacto,
  cambioAnterior = null,
  titulo,
  modoTexto,
  accionSecundaria,
  onEnviarCocinaAbierto,
  onPonerEnEspera,
  folioCuenta,
  onAplicarDescuento,
  descuentoMxn = 0,
  totalConDescuento,
  pendienteMxn,
  promocionMxn = 0,
  lealtad = null,
  lealtadMxn = 0,
  premioClientId = null,
  bloqueado = false,
  procesando,
  onEditar,
  tienda,
  clienteCuenta,
  mostrador = false,
}: {
  estado: EstadoCarrito;
  onCantidad: (clientId: string, cantidad: number) => void;
  onQuitar: (clientId: string) => void;
  /** Cuando el ticket está persistido, "Quitar" llama a este handler (cancela en BD con motivo+autorización). */
  onCancelarItemPersistido?: (clientId: string) => void;
  /** Cuando el ticket está persistido, "%" abre el descuento/override por ítem (F6.5). */
  onDescuentoItem?: (clientId: string) => void;
  /** Tocar un renglón lo reabre en su modal: el de combo (en el resumen) o el de modificadores.
   *  En cuenta de mesa también se pasa: quien llama rechaza (y avisa) lo que ya salió a cocina. */
  onEditar?: (clientId: string) => void;
  /** Limpia el carrito local (sin BD). Habilitado cuando no hay ticket persistido y hay líneas. */
  onLimpiar?: () => void;
  /** Cuando el ticket está persistido, "Limpiar" llama a este handler para cancelar todo el ticket. */
  onCancelarTicket?: () => void;
  /** Abre el modal de cliente para domicilio (solo aplica en modo Domicilio). */
  onEditarCliente?: () => void;
  /** Abre el modal de zona de reparto para cambiar el envío de ESTE pedido (sin tocar la
   *  dirección guardada del cliente). Con el ticket ya persistido, el caller también reescribe
   *  el renglón en BD (`fijarEnvioTicket`) y refresca el total autoritativo — el número grande
   *  y el renglón se mueven juntos. Se ofrece siempre: un domicilio se manda a cocina (y por
   *  tanto se persiste) ANTES de cobrarse, así que "solo mientras no hay ticket" dejaría la
   *  función muerta justo cuando el cajero de verdad necesita corregir la zona. */
  onCambiarZona?: () => void;
  /** Edita la nota de cocina de una línea (carrito local, pre-cobro). */
  onNotaLinea?: (clientId: string, nota: string | null) => void;
  /** Edita la nota de cocina de TODA la orden. */
  onNotaOrden?: (nota: string | null) => void;
  onCobrar?: () => void;
  /** Cobra el total en efectivo exacto, sin pasar por el selector ni el teclado. Mismo camino que
   *  Cobrar (guarda el ticket y abre el cajón); solo se salta los pasos. */
  onEfectivoExacto?: () => void;
  /** Cambio de la venta anterior: se enseña mientras el ticket nuevo está vacío. */
  cambioAnterior?: number | null;
  /** Sustituye el título de la cabecera. Sin esto: "Cuenta <folio>" o "Ticket nuevo". */
  titulo?: string;
  /** Sustituye la etiqueta del modo (p. ej. "Barra", que el carrito trata como comedor). */
  modoTexto?: string;
  /** Botón extra bajo la acción principal del pie (p. ej. "Guardar sin mandar"). */
  accionSecundaria?: { etiqueta: string; onClick: () => void; deshabilitado?: boolean };
  /** Pick-up / Domicilio — envía a cocina y deja la cuenta ABIERTA (sin cobrar); se cobra después
   *  desde "Ver cuentas". Cuando se pasa, es la acción principal del pie. */
  onEnviarCocinaAbierto?: () => void;
  /** D45 §12 — guarda el pedido en espera con etiqueta (flujo QS, sin cuenta de mesa). */
  onPonerEnEspera?: () => void;
  /** Folio de la cuenta que se está editando. Ausente = ticket nuevo. */
  folioCuenta?: string | null;
  onAplicarDescuento?: () => void;
  /** Monto de descuento ya aplicado en BD (autoritativo). 0 = sin descuento. */
  descuentoMxn?: number;
  /** Total autoritativo de la BD cuando el ticket ya está persistido; si falta, se usa el display. */
  totalConDescuento?: number;
  /** Saldo de una cuenta abierta que ya trae pagos (la venta de un cambio, reabierta): «Cobrar»
   *  enseña lo que falta y, en 0, «Cerrar venta». Sin esto, el total. */
  pendienteMxn?: number;
  /** Rebajado por promociones del negocio. Renglón propio: si se sumara al descuento, el
   *  cliente vería bajar el total sin que nada en pantalla diga por qué. */
  promocionMxn?: number;
  /** Canje de lealtad ya aplicado en BD (autoritativo). 0 = sin canje. */
  lealtadMxn?: number;
  /** Renglón que es un premio de lealtad: se muestra en $0.00, que es lo que el cliente paga por
   *  él (el descuento va en el renglón «Lealtad» de los totales). null = no hay premio. */
  premioClientId?: string | null;
  /** Lealtad del cliente de la cuenta (ADR 0030). null = módulo apagado, sin programa o cuenta sin
   *  cliente: no se pinta nada. Sin `onAbrir` la franja informa, pero no canjea. */
  lealtad?: { nombre: string; franja: FranjaLealtad; onAbrir?: () => void } | null;
  /** El ticket ya está comprometido en BD: bloquea edición del carrito para evitar desincronización. */
  bloqueado?: boolean;
  procesando: boolean;
  /** Comida rápida: «Asignar cliente» en un menú «⋯» que reemplaza a «Limpiar» (que pasa adentro). */
  clienteCuenta?: { nombre: string | null; onAsignar: () => void };
  /** Comida rápida (Fermín, 20 oct): sin «Para llevar» arriba —el modo se pregunta al cobrar— y,
   *  donde se cobra aquí, sin Subtotal, Total ni «Efectivo exacto»: el total va en «Cobrar». */
  mostrador?: boolean;
  /** Giro RETAIL: variante y SKU en el renglón, «Sin existencia» y el último agregado marcado. */
  tienda?: {
    /** Nombre del padre y «M · Negra · SKU» de la línea. */
    renglon: (l: LineaCarrito) => { nombre: string; detalle: string | undefined };
    sinExistencia: (l: LineaCarrito) => boolean;
    /** Producto del último agregado; se marca hasta la siguiente acción. */
    ultimoProductoId: string | null;
    /** Con el ticket vacío llega quien viene a cambiar algo: el botón va grande ahí mismo. */
    onCambioTalla?: () => void;
    /** Panel de la tienda (pos-retail.md, «Versión 2»): sin «Precios», «En espera» ni botones
     *  arriba del ticket; nota, descuentos, cliente y Limpiar viven en el menú «⋯». */
    simple?: boolean;
    /** Abre el cliente de la cuenta (la lealtad lo necesita). Sin esto no se ofrece. */
    onAsignarCliente?: () => void;
    /** Nombre del cliente asignado; null = sin cliente. */
    cliente?: string | null;
    /** Descuento de un renglón; quien llama guarda la cuenta antes si hace falta. */
    onDescuentoProducto?: (clientId: string) => void;
    /** «Guardar como cotización»: solo lo pasa quien tiene el módulo, renglones y un carrito suelto (`puedeCotizar`). */
    onGuardarCotizacion?: () => void;
    /** Con la opción a la vista pero apagada: por qué (extras o combos). */
    motivoSinCotizacion?: string | null;
    /** Belleza: quién hizo el renglón («Diego R.») o `falta` si es un servicio sin nadie (no se cobra así). */
    colaborador?: (l: LineaCarrito) => { texto: string; falta: boolean };
    /** Belleza: elegir quién lo hizo. Sin esto (venta ya guardada) el nombre solo se lee. */
    onColaborador?: (clientId: string) => void;
    /** Ticket vacío: lo que invita a empezar. Sin esto, el de la tienda. */
    textoVacio?: string;
  };
}) {
  const totales = calcularTotalesDisplay(estado.lineas, 16, estado.envio?.costoMxn ?? 0);
  const vacio = estado.lineas.length === 0;
  const ultimoEnTicket = tienda?.ultimoProductoId ?? null;
  const totalProductos = contarProductos(estado.lineas.map((l) => ({ cantidad: l.cantidad, tipo: l.producto.tipoVenta })));
  // Notas de cocina: qué línea se está editando + si el input de nota de orden está abierto.
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  const [notaOrdenAbierta, setNotaOrdenAbierta] = useState(false);
  const hayDescuento = descuentoMxn > 0;
  const hayPromocion = promocionMxn > 0;
  const hayLealtad = lealtadMxn > 0;
  const totalFinal = totalConDescuento ?? totales.total;
  /**
   * Cuenta que NO se cobra aquí: Pick-up y Domicilio mandan a cocina y se cobran después,
   * desde su pantalla de cuentas. En ese flujo la caja solo captura, así que se ocultan
   * Cobrar y Descuento — el descuento se aplica al cobrar, y tenerlo aquí invita a "cobrar ahora"
   * una orden que todavía no sale de cocina. El interruptor de precios sí se queda: un cliente
   * pregunta cuánto cuesta algo en cualquiera de los cuatro modos.
   */
  const seCobraDespues = onEnviarCocinaAbierto != null;
  // Pick-up y Domicilio no tienen «Cobrar $…»: ahí el Total se queda.
  const sinTotales = mostrador && !seCobraDespues;
  const sinEtiquetaModo = mostrador && estado.modoServicio === "PARA_LLEVAR";
  // No depende de `bloqueado`: en cuenta de mesa los renglones que no han salido a cocina sí se
  // editan (0119). Quien pasa `onEditar` decide qué renglón se abre y avisa del que no.
  const editable = onEditar != null && !procesando;
  const simple = tienda?.simple === true;
  // Menú «⋯» del Panel de la tienda: nota, descuentos, cliente y Limpiar (Fermín, 18 oct).
  const [menuAbierto, setMenuAbierto] = useState(false);
  useEscape(() => setMenuAbierto(false), menuAbierto);
  // «Descuento por producto» con varios renglones: el siguiente toque en el ticket elige cuál.
  const [eligiendoDescuento, setEligiendoDescuento] = useState(false);
  useEscape(() => setEligiendoDescuento(false), eligiendoDescuento);
  // El ticket se cobró, se canceló o se vació: la elección no pasa al siguiente.
  useEffect(() => { if (vacio) setEligiendoDescuento(false); }, [vacio]);
  const descuentoProducto = tienda?.onDescuentoProducto;
  const opcionCliente = clienteCuenta
    ? { texto: `${clienteCuenta.nombre ? "Cambiar" : "Asignar"} cliente`, hacer: clienteCuenta.onAsignar, activa: true }
    : { texto: tienda?.cliente ? "Cambiar cliente" : "Asignar cliente", hacer: () => tienda?.onAsignarCliente?.(), activa: !!tienda?.onAsignarCliente };
  const opcionesTienda = [
    { texto: estado.notaOrden ? "Editar nota" : "Nota", hacer: () => setNotaOrdenAbierta(true), activa: !!onNotaOrden && !bloqueado },
    ...(seCobraDespues ? [] : [
      {
        texto: "Descuento por producto",
        hacer: () => (estado.lineas.length === 1 ? descuentoProducto?.(estado.lineas[0]!.clientId) : setEligiendoDescuento(true)),
        activa: !vacio && !procesando && !!descuentoProducto,
      },
      { texto: "Descuento general", hacer: () => onAplicarDescuento?.(), activa: !vacio && !hayDescuento && !procesando && !!onAplicarDescuento },
    ]),
    opcionCliente,
    ...(tienda?.onGuardarCotizacion
      ? [{ texto: "Guardar como cotización", hacer: tienda.onGuardarCotizacion, activa: !procesando && !tienda.motivoSinCotizacion, detalle: tienda.motivoSinCotizacion ?? undefined }]
      : []),
    // Sin el botón de arriba, esta es la única salida de una cuenta guardada que no se va a cobrar.
    {
      texto: bloqueado && onCancelarTicket ? "Cancelar cuenta" : "Limpiar",
      hacer: () => (bloqueado && onCancelarTicket ? onCancelarTicket() : onLimpiar?.()),
      activa: !procesando && (bloqueado ? !!onCancelarTicket : !vacio && !!onLimpiar),
      peligro: true,
    },
  ];
  // Fuera del Panel de la tienda la nota y los descuentos ya tienen su botón: el menú lleva cliente y Limpiar.
  const opcionesMenu = simple ? opcionesTienda : [opcionCliente, opcionesTienda.at(-1)!];
  const menuTienda = (
    <div className="relative -mr-2.5 flex-shrink-0">
      <button
        type="button"
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={menuAbierto}
        onClick={() => setMenuAbierto((v) => !v)}
        className={`h-11 w-11 rounded-md font-display text-20 font-bold leading-none text-ink-2 transition-colors hover:bg-hover hover:text-ink ${menuAbierto ? "bg-hover text-ink" : ""}`}
      >
        ⋯
      </button>
      {menuAbierto && (
        <>
          {/* Tocar fuera cierra, como Escape. */}
          <button type="button" aria-label="Cerrar opciones" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuAbierto(false)} />
          <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-max rounded-lg border border-line bg-surface p-1 shadow-lg">
            {opcionesMenu.map((o) => (
              <button
                key={o.texto}
                type="button"
                role="menuitem"
                disabled={!o.activa}
                onClick={() => { setMenuAbierto(false); o.hacer(); }}
                className={`flex min-h-[44px] w-full flex-col items-start justify-center whitespace-nowrap rounded-md px-3 text-left text-15 font-semibold transition-colors disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent ${"peligro" in o ? "mt-1 text-danger hover:bg-danger-soft" : "text-ink hover:bg-hover"}`}
              >
                {o.texto}
                {"detalle" in o && o.detalle && <span className="text-12 font-medium text-ink-3">{o.detalle}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
  /* Dos botones en uno: con la cuenta ya guardada en BD esto CANCELA la cuenta; con un
     carrito suelto solo lo vacía. Se dice cuál de los dos es, porque no se deshacen igual.

     El `vacio` solo aplica al carrito suelto. Antes deshabilitaba también el otro caso, y
     eso dejaba sin salida justo a la mesa que más la necesita: la que se abrió por error y
     no tiene ni un producto. Su ticket ya existe (BORRADOR) y tiene la mesa ocupada; si el
     único botón que la cancela está gris, la mesa se queda ocupada para siempre.

     Rojo desde el principio, no solo al pasar el mouse: en una pantalla táctil no hay
     mouse, y era gris hasta el momento de tocarlo. Gris solo cuando no hace nada. */
  const botonLimpiar = (
    <button
      type="button"
      disabled={procesando || (bloqueado ? !onCancelarTicket : vacio || !onLimpiar)}
      onClick={() => (bloqueado && onCancelarTicket ? onCancelarTicket() : onLimpiar?.())}
      className={`${simple ? "text-13" : "-mr-2.5 text-14"} h-11 flex-shrink-0 rounded-md px-2.5 font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-default disabled:text-ink-3 disabled:opacity-60 disabled:hover:bg-transparent`}
    >
      {bloqueado && onCancelarTicket ? "Cancelar cuenta" : "Limpiar"}
    </button>
  );

  // Ancho del carrito: era fijo en 404px, y en una caja de 1024px se comía el 40% de la pantalla
  // dejando el catálogo apretado. Ahora escala con topes: nunca menos de 288px —por debajo no cabe
  // una línea con cantidad, nombre y precio— ni más de 420px.
  //
  // Bajó de 32vw a 26vw: cada punto porcentual de aquí es ancho que le falta al catálogo, y el
  // catálogo es el que tiene que caber sin scroll. En 1366 le devuelve ~90px —una columna más de
  // productos—; en 1024 es la diferencia entre 3 y 4 columnas.
  return (
    // En el Panel de la tienda, mitad y mitad con el catálogo (Fermín, 18 oct).
    <aside className={`flex ${simple ? "w-1/2" : "w-[clamp(18rem,26vw,26.25rem)]"} flex-shrink-0 flex-col border-l border-line bg-surface`}>

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-line px-4 pb-3 pt-1.5">
        {/* fila superior: título + Limpiar */}
        <div className="flex items-center justify-between gap-2">
          {/* El título decía siempre "Ticket nuevo", incluso editando una cuenta ya abierta:
              el cajero no tenía forma de saber si estaba agregando a un pedido existente o
              capturando uno nuevo, que es justo la diferencia entre mandar a cocina y cobrar. */}
          <span className="truncate font-display text-18 font-semibold leading-tight tracking-[-0.02em]">
            {titulo ?? (folioCuenta ? `Cuenta ${folioCuenta}` : "Ticket nuevo")}
          </span>
          {simple || clienteCuenta ? menuTienda : botonLimpiar}
        </div>
        {/* Modo de servicio — SOLO LECTURA. El modo se elige en la pantalla de inicio (una venta
            no cambia de modo a media captura); aquí se muestra para que el cajero no pierda de
            vista en qué está capturando. Para cambiarlo: volver al inicio y entrar por el otro modo. */}
        <div className="mt-0.5">
          {/* Sin palomita y en gris neutro: con ella parecía una opción marcada que se podía
              desmarcar, y no es un botón. */}
          <div className="flex items-center justify-between gap-2">
            {/* Tienda: en lugar de la etiqueta del modo, el cliente asignado (si hay). */}
            {simple ? <span className="min-w-0 truncate text-13 font-semibold text-ink-2">{tienda?.cliente ?? ""}</span> : sinEtiquetaModo ? null : (
              <span className="inline-flex h-8 min-w-0 items-center rounded-md bg-hover px-2.5 text-14 font-semibold text-ink-2">
                <span className="truncate">{modoTexto ?? etiquetaModo(estado.modoServicio)}</span>
              </span>
            )}
            {!simple && clienteCuenta?.nombre && <span className="min-w-0 flex-1 truncate text-13 font-semibold text-ink-2">{clienteCuenta.nombre}</span>}
            <span className="flex-shrink-0 text-13 font-semibold text-ink-3">
              {totalProductos} {totalProductos === 1 ? "producto" : "productos"}
            </span>
          </div>
          {/* "Cobro completado" se cierra solo; si la cajera todavía está contando el dinero, aquí
              sigue el número. Se va con el primer producto. */}
          {vacio && cambioAnterior != null && cambioAnterior > 0 && (
            <div className="mt-2 flex h-10 items-center justify-between gap-2 rounded-md bg-success-soft px-3 text-success" role="status">
              <span className="text-14 font-semibold">Cambio anterior</span>
              <span className="font-display text-18 font-bold tabular-nums">{fmtMxn(cambioAnterior)}</span>
            </div>
          )}
          {/* Sin handler no se pinta: un boton que no hace nada es peor que no tenerlo. */}
          {estado.modoServicio === "DELIVERY_PROPIO" && onEditarCliente && (
            <button
              type="button"
              disabled={bloqueado}
              onClick={() => onEditarCliente?.()}
              className="mt-2 flex w-full items-start gap-2 rounded-md border border-line-strong bg-sel px-3 py-2 text-left transition hover:border-ink disabled:opacity-60"
            >
              <Icono nombre="pin" className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-3" />
              {estado.clienteDomicilio ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-semibold">{estado.clienteDomicilio.nombre || "Cliente"}</span>
                  <span className="block truncate text-12 text-ink-3">{estado.clienteDomicilio.direccionPreview ?? estado.clienteDomicilio.telefono ?? "Sin domicilio"}</span>
                </span>
              ) : (
                <span className="flex-1 text-13 font-semibold text-accent">Asignar cliente y domicilio</span>
              )}
            </button>
          )}
          {/* Era un texto de 12.5px sin caja: se tocaba a ciegas. */}
          {onNotaOrden && !bloqueado && !simple && (
            <button
              type="button"
              onClick={() => setNotaOrdenAbierta((v) => !v)}
              className={[
                "mt-2 flex h-10 w-full items-center rounded-md border border-dashed px-2.5 text-14 font-medium transition-colors",
                estado.notaOrden ? "border-warning/50 text-warning" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink",
              ].join(" ")}
            >
              <Icono nombre={estado.notaOrden ? "editar" : "mas"} className="mr-1.5 h-4 w-4 flex-shrink-0" />
              Nota de la orden
            </button>
          )}
          {/* Nota de cocina de TODA la orden (va a tickets.nota_general → KDS y comanda) */}
          {notaOrdenAbierta && !bloqueado && (
            <input
              autoFocus
              defaultValue={estado.notaOrden ?? ""}
              maxLength={300}
              placeholder={simple ? "Nota de la venta…" : "Nota para cocina de toda la orden…"}
              className="mt-1.5 h-10 w-full rounded border border-line-strong px-3 text-13 outline-none focus:border-ink"
              onBlur={(e) => { onNotaOrden?.(e.target.value.trim() || null); setNotaOrdenAbierta(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          )}
          {estado.notaOrden && !notaOrdenAbierta && (
            <div className="mt-1.5 rounded border-l-2 border-[#D4A017] bg-warning-soft px-2.5 py-1.5 text-13 font-medium italic text-[#7A5A10]">
              “{estado.notaOrden}”
            </div>
          )}
        </div>
      </div>

      {/* ── Lista de líneas ───────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {vacio ? (
          /* Estado vacío */
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-ink-3">
            <IconoTicket />
            <p className="text-15 font-semibold text-ink-2">
              {tienda ? tienda.textoVacio ?? "Escanea una prenda para empezar" : "Agrega productos para empezar"}
            </p>
            {tienda?.onCambioTalla && (
              <Button variant="ghost" size="lg" onClick={tienda.onCambioTalla} className="mt-2 w-full">Cambio de talla</Button>
            )}
            {!tienda && (
              <span className="text-13">
                Toca un producto del catálogo para iniciar el ticket.
              </span>
            )}
          </div>
        ) : (
          <ul>
            {eligiendoDescuento && (
              <li className="-mx-4 flex items-center justify-between gap-2 bg-sel px-4 py-1.5 text-14 font-semibold text-ink">
                Toca el producto al que le harás descuento
                <button type="button" onClick={() => setEligiendoDescuento(false)} className="h-11 flex-shrink-0 rounded-md px-2.5 text-ink-2 transition-colors hover:bg-hover">
                  Cancelar
                </button>
              </li>
            )}
            {estado.lineas.map((l: LineaCarrito) => {
              // Tocar el renglón lo reabre en su modal de modificadores o de combo (quien llama decide si
              // hay algo que editar); eligiendo descuento, lo elige.
              const alTocar = eligiendoDescuento
                ? () => { setEligiendoDescuento(false); descuentoProducto?.(l.clientId); }
                : editable ? () => onEditar!(l.clientId) : undefined;
              return (
              <li key={l.clientId} className={`border-b border-line py-2.5 ${tienda && l.producto.id === ultimoEnTicket ? "-mx-2 bg-sel px-2" : ""}`}>
                <div
                  role={alTocar ? "button" : undefined}
                  tabIndex={alTocar ? 0 : undefined}
                  aria-label={alTocar ? `${eligiendoDescuento ? "Descuento a" : "Editar"} ${l.producto.nombre}` : undefined}
                  onClick={alTocar}
                  onKeyDown={
                    alTocar
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alTocar(); }
                        }
                      : undefined
                  }
                  className={alTocar ?"-mx-2 -my-1 cursor-pointer rounded-md px-2 py-1 outline-none transition-[transform,background-color] duration-150 ease-vim hover:bg-hover focus-visible:ring-2 focus-visible:ring-ink active:scale-[.99]" : undefined}
                >
                  <RenglonItem
                    cantidad={l.cantidad}
                    unidad={l.producto.tipoVenta}
                    nombre={tienda ? tienda.renglon(l).nombre : l.producto.nombre}
                    detalle={tienda?.renglon(l).detalle}
                    sinExistencia={tienda?.sinExistencia(l)}
                    modificadores={l.modificadores.map((m) => m.opcionNombre)}
                    notaCocina={l.notaCocina}
                    totalMxn={l.clientId === premioClientId ? 0 : totalLinea(l)}
                    hijos={l.combo?.componentes.map((c) => ({
                      slot: c.grupoNombre,
                      nombre: c.producto.nombre,
                      detalle: c.modificadores.length ? c.modificadores.map((m) => m.opcionNombre).join(" · ") : null,
                      extraMxn: c.modificadores.reduce((s, m) => s + m.precioExtra * m.cantidad, 0) * c.cantidad,
                    }))}
                  />
                </div>

                {/* Controles de 44px en TODOS los renglones, no solo en uno "seleccionado" como en la
                    maqueta: tocar el renglón ya abre su modal de modificadores o de combo, así que
                    no queda un toque libre para seleccionar. Sin sangría: a 288px de ancho es la
                    única forma de que quepan stepper, Nota y Quitar a 44px. */}
                <div className="mt-2 flex items-center gap-1.5">
                  {tienda?.colaborador && (() => {
                    const c = tienda.colaborador(l);
                    const tono = c.falta ? "font-semibold text-warning" : "text-ink-2";
                    return tienda.onColaborador ? (
                      <button
                        type="button"
                        onClick={() => tienda.onColaborador?.(l.clientId)}
                        aria-label={`${c.texto}: cambiar quién hizo ${l.producto.nombre}`}
                        className={`-ml-2.5 flex h-11 min-w-0 items-center gap-1 rounded-md px-2.5 text-14 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97] ${tono}`}
                      >
                        <span className="truncate">{c.texto}</span>
                        <Icono nombre="chevron-abajo" className="h-4 w-4 flex-shrink-0" />
                      </button>
                    ) : <span className={`min-w-0 truncate text-14 ${tono}`}>{c.texto}</span>;
                  })()}
                  {/* La tienda no lleva cantidad ni nota por renglón: cada escaneo es una pieza (Fermín, 18 oct). */}
                  {!simple && <span className="inline-flex items-center rounded-md border border-line-strong bg-surface">
                    <button
                      type="button"
                      aria-label="Menos"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad - 1)}
                      className={BOTON_STEPPER}
                    >
                      <Icono nombre="menos" className="h-4 w-4" />
                    </button>
                    <span className="min-w-[28px] text-center font-display text-16 font-bold tabular-nums">
                      {l.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label="Más"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad + 1)}
                      className={BOTON_STEPPER}
                    >
                      <Icono nombre="mas" className="h-4 w-4" />
                    </button>
                  </span>}
                  {bloqueado && onDescuentoItem && !simple && (
                    <button
                      type="button"
                      onClick={() => onDescuentoItem(l.clientId)}
                      title="Descuento / precio del ítem"
                      aria-label="Descuento o precio del producto"
                      className={`${BOTON_RENGLON} border border-line-strong bg-surface text-ink hover:border-ink`}
                    >
                      %
                    </button>
                  )}
                  {!bloqueado && onNotaLinea && !simple && (
                    <button
                      type="button"
                      onClick={() => setEditandoNota(editandoNota === l.clientId ? null : l.clientId)}
                      className={[
                        BOTON_RENGLON,
                        "border bg-surface",
                        l.notaCocina ? "border-warning/50 text-warning" : "border-line-strong text-ink hover:border-ink",
                      ].join(" ")}
                    >
                      Nota
                    </button>
                  )}
                  {/* Al extremo derecho, lejos del "+": es el único de la fila que no se deshace
                      tocando otra vez. Rojo en reposo por la misma razón que "Limpiar". */}
                  <button
                    type="button"
                    disabled={bloqueado && !onCancelarItemPersistido}
                    // Sin «−» en la tienda, dos escaneos de la misma prenda quedan en «2×»: Quitar saca una (una pesada, completa).
                    onClick={() => (bloqueado && onCancelarItemPersistido ? onCancelarItemPersistido(l.clientId)
                      : quitaUna(l, simple) ? onCantidad(l.clientId, l.cantidad - 1) : onQuitar(l.clientId))}
                    className={`${BOTON_RENGLON} -mr-2.5 ml-auto text-danger hover:bg-danger-soft disabled:cursor-default disabled:text-ink-3 disabled:opacity-60 disabled:hover:bg-transparent`}
                  >
                    Quitar
                  </button>
                </div>
                {/* Input inline de nota del ítem */}
                {editandoNota === l.clientId && !bloqueado && (
                  <div className="mt-2">
                    <input
                      autoFocus
                      defaultValue={l.notaCocina ?? ""}
                      maxLength={200}
                      placeholder="Nota para cocina de este producto…"
                      className="h-10 w-full rounded border border-line-strong px-3 text-13 outline-none focus:border-ink"
                      onBlur={(e) => { onNotaLinea?.(l.clientId, e.target.value.trim() || null); setEditandoNota(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                )}
              </li>
            );})}
          </ul>
        )}
      </div>

      {/* ── Totales ───────────────────────────────────────────── */}
      {/* Compactado respecto al mockup P-059 (que usa py-4, filas de 14.5px y TOTAL de 30px): en la
          caja real el alto del pie le comía espacio a la lista de productos, que es lo que el
          cajero necesita ver. Subtotal/IVA son informativos → tipografía menor y filas apretadas;
          el TOTAL sigue siendo el número dominante. */}
      <div className="flex-shrink-0 border-t border-line bg-sel px-4 pb-2.5 pt-3">
        {lealtad && (
          <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-13 font-semibold text-ink">
                {lealtad.nombre} <span className="font-medium tabular-nums text-ink-2">· {lealtad.franja.saldoTexto}</span>
              </div>
              {lealtad.franja.detalle && <div className="truncate text-12 text-ink-2">{lealtad.franja.detalle}</div>}
            </div>
            {lealtad.onAbrir && (
              <button
                type="button"
                disabled={!lealtad.franja.puedeAbrir || procesando}
                onClick={lealtad.onAbrir}
                className={`${BOTON_RENGLON} border border-line-strong bg-surface text-ink hover:border-ink disabled:cursor-default disabled:opacity-[.45] disabled:hover:border-line-strong disabled:active:scale-100`}
              >
                {lealtad.franja.boton}
              </button>
            )}
          </div>
        )}
        {/* Renglón de envío: tocable SIEMPRE, también con el ticket ya persistido — un domicilio
            se manda a cocina (y por tanto se persiste) antes de cobrarse, así que apagar esto al
            bloquear dejaría la función muerta justo cuando más se necesita. El caller reescribe
            la BD (fijarEnvioTicket) y refresca el total autoritativo cuando corresponde. */}
        {estado.envio && (
          <button
            type="button"
            onClick={onCambiarZona}
            className="mb-1 flex w-full items-center justify-between text-13 text-ink-2 hover:text-ink"
          >
            <span>{estado.envio.nombre}</span>
            <span className="tabular-nums font-medium text-ink">{fmtMxn(estado.envio.costoMxn)}</span>
          </button>
        )}
        {!sinTotales && (
          <div className="mb-1 flex justify-between text-13 text-ink-2">
            <span>Subtotal</span>
            <span className="tabular-nums font-medium text-ink">{fmtMxn(totales.subtotal)}</span>
          </div>
        )}
        <div className="mb-1 flex justify-between text-13 text-ink-2">
          <span>IVA (16%)</span>
          <span className="tabular-nums font-medium text-ink">{fmtMxn(totales.iva)}</span>
        </div>
        {hayPromocion && (
          <div className="mb-1 flex justify-between text-13 font-medium text-success">
            <span>Promoción</span>
            <span className="tabular-nums">−{fmtMxn(promocionMxn)}</span>
          </div>
        )}
        {hayLealtad && (
          <div className="mb-1 flex justify-between text-13 font-medium text-success">
            <span>Lealtad</span>
            <span className="tabular-nums">−{fmtMxn(lealtadMxn)}</span>
          </div>
        )}
        {hayDescuento && (
          <div className="mb-1 flex justify-between text-13 font-medium text-danger">
            <span>Descuento</span>
            <span className="tabular-nums">−{fmtMxn(descuentoMxn)}</span>
          </div>
        )}
        {!sinTotales && (
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-15 font-bold uppercase tracking-[0.04em] text-ink">
              Total
            </span>
            <span className="font-display text-28 font-bold leading-none tabular-nums tracking-[-0.02em] text-ink">
              {fmtMxn(totalFinal)}
            </span>
          </div>
        )}
      </div>

      {/* ── Acciones secundarias ──────────────────────────────── */}
      {/* Donde estaba "Nota": ese botón nació `disabled` con un "F5.2b — diferido" y nunca se
          implementó, mientras la nota de la orden SÍ funciona desde el encabezado del ticket
          ("+ Nota de la orden"). Ocupaba la mitad del renglón para no hacer nada. */}
      {/* "En espera" subió aquí desde el pie: su lugar bajo Cobrar es ahora "Efectivo exacto", que se
          usa en casi cada venta. Tres botones iguales; a 288px no cabe un icono más. */}
      {!simple && (
      <div className="flex flex-shrink-0 gap-1.5 px-4 pt-2.5">
        <InterruptorPrecios />
        {!seCobraDespues && (
        <button
          type="button"
          disabled={vacio || hayDescuento || procesando || !onAplicarDescuento}
          onClick={() => onAplicarDescuento?.()}
          className={[
            BOTON_SECUNDARIO,
            hayDescuento ? "border-success/40 bg-success-soft text-success disabled:opacity-100" : "border-line-strong bg-surface text-ink hover:border-ink disabled:opacity-[.45] disabled:hover:border-line-strong",
          ].join(" ")}
        >
          <span className="truncate">Descuento</span>
        </button>
        )}
        {/* "En espera" solo existe en el pie de Cobrar, igual que Descuento. */}
        {!seCobraDespues && (
          <button
            type="button"
            disabled={vacio || procesando || !onPonerEnEspera}
            onClick={onPonerEnEspera}
            aria-label="Poner pedido en espera"
            className={`${BOTON_SECUNDARIO} border-line-strong bg-surface text-ink hover:border-ink disabled:opacity-[.45] disabled:hover:border-line-strong`}
          >
            <span className="truncate">En espera</span>
          </button>
        )}
      </div>
      )}

      {/* ── Pie: Cobrar + Efectivo exacto ─────────────────────── */}
      {/* Pie compactado (mockup: pt-4 pb-5, Cobrar py-18px). "Cobrar" conserva un alto cómodo para
          usar con el dedo; lo que se recorta es el aire alrededor y los botones secundarios. */}
      <div className="flex flex-shrink-0 flex-col gap-1.5 px-4 pb-3 pt-2.5">
        {onEnviarCocinaAbierto ? (
          /* Pick-up / Domicilio — la orden va a cocina y queda ABIERTA; se cobra al recoger o al
             regresar el repartidor (desde "Ver cuentas"). Acción principal = enviar a cocina. */
          <>
            <button
              type="button"
              disabled={vacio || procesando}
              onClick={onEnviarCocinaAbierto}
              className={BOTON_PRINCIPAL}
            >
              {procesando ? "Enviando…" : (
                <><Icono nombre="enviar" className="h-5 w-5" /> Enviar a cocina</>
              )}
            </button>
            {accionSecundaria && (
              <button
                type="button"
                disabled={accionSecundaria.deshabilitado || procesando}
                onClick={accionSecundaria.onClick}
                className={`${BOTON_PIE} border-line-strong bg-surface text-ink hover:border-ink disabled:opacity-[.45] disabled:hover:border-line-strong`}
              >
                {accionSecundaria.etiqueta}
              </button>
            )}
          </>
        ) : (
        <>
        <button
          type="button"
          disabled={vacio || procesando || !onCobrar}
          onClick={() => onCobrar?.()}
          className={BOTON_PRINCIPAL}
        >
          {procesando ? (
            "Procesando…"
          ) : pendienteMxn != null && pendienteMxn <= 0 ? (
            "Cerrar venta"
          ) : (
            <>
              Cobrar{" "}
              <span className="font-display tabular-nums">{fmtMxn(pendienteMxn ?? totalFinal)}</span>
            </>
          )}
        </button>
        {/* Efectivo exacto: un toque en vez de cinco (Cobrar → Efectivo → Pago exacto → Cobrar).
            Es el cobro más común de mostrador. Borde de tinta: es la segunda acción del pie, no
            una más de las grises. En la tienda no va: Fermín prefirió el espacio para los renglones. */}
        {!simple && !sinTotales && <button
          type="button"
          disabled={vacio || procesando || !onEfectivoExacto}
          onClick={() => onEfectivoExacto?.()}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-ink bg-surface text-16 font-bold text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.98] disabled:cursor-default disabled:border-line-strong disabled:opacity-[.45] disabled:active:scale-100"
        >
          Efectivo exacto
        </button>}
        </>
        )}
      </div>
    </aside>
  );
}

/**
 * Interruptor de "Mostrar precios".
 *
 * La cuadrícula del catálogo enseña solo el nombre del producto: así el nombre cabe más grande en
 * la misma celda, y el precio no le dice nada al cajero que ya se sabe el menú. Este interruptor
 * los enciende en todas las celdas para cuando un cliente pregunta cuánto cuesta algo.
 *
 * Se queda como lo dejes, también al reabrir la caja.
 */
function InterruptorPrecios() {
  const visibles = usePreciosVisibles();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visibles}
      // "Precios" y no "Mostrar precios": con el sidebar en su ancho mínimo (288px) la etiqueta
      // larga se cortaba a "Mostrar…", que es peor que corta. El interruptor ya dice que enciende
      // algo; el texto completo queda para lectores de pantalla.
      aria-label="Mostrar precios en el catálogo"
      onClick={() => setPreciosVisibles(!visibles)}
      // Sin el interruptor dibujado: en un tercio de 288px no cabía junto a la palabra. Encendido se
      // pinta como la categoría elegida (negro), que ya se lee como "activo" en esta pantalla.
      className={[
        BOTON_SECUNDARIO,
        visibles ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
      ].join(" ")}
    >
      <span className="truncate">Precios</span>
    </button>
  );
}
