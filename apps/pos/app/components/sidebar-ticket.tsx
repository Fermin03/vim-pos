"use client";
import { useState } from "react";
import type { EstadoCarrito, LineaCarrito } from "../lib/carrito";
import { etiquetaModo } from "@vim/db/modos-servicio";
import { calcularTotalesDisplay, totalLinea } from "../lib/carrito";
import { setPreciosVisibles, usePreciosVisibles } from "../lib/precios-visibles";
import { fmtMxn } from "../lib/turno";
import { RenglonItem } from "./renglon-item";

/* ── helpers ─────────────────────────────────────────────────── */
/* ── Íconos SVG inline (del mockup P-066) ────────────────────── */
function IconoTicket() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[46px] w-[46px] text-line-strong"
    >
      <path d="M4 4h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M8 4v14M16 4v14" />
    </svg>
  );
}

/* ── Botones del renglón ──────────────────────────────────────── */
// 44px de alto: el mínimo táctil del doc de diseño. Eran de 36 y de 26 ("Nota", "Quitar"), y en
// hora pico se tocaba el de al lado. Solo se anima el apachurrón (transform) y el fondo.
const BOTON_STEPPER =
  "flex h-11 w-11 items-center justify-center rounded-md text-[20px] font-semibold leading-none text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97] disabled:cursor-default disabled:text-ink-3 disabled:opacity-50 disabled:hover:bg-transparent";
const BOTON_RENGLON =
  "h-11 flex-shrink-0 rounded-md px-2.5 text-[14px] font-semibold transition-[transform,background-color,border-color] duration-150 ease-vim active:scale-[.97]";
// La acción principal del pie (Cobrar, o Enviar a cocina en las cuentas que se cobran después):
// 60px fijos, no un padding que cambia con la letra. Es el botón que cierra cada venta.
const BOTON_PRINCIPAL =
  "flex h-[60px] w-full items-center justify-center gap-[10px] rounded-lg bg-accent px-5 font-display text-[19px] font-bold text-white shadow-[0_1px_3px_rgb(var(--accent)/0.3)] transition-[transform,background-color] duration-150 ease-vim hover:bg-accent-hover active:scale-[.98] disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none disabled:active:scale-100";
// Fila secundaria (Precios, Descuento, En espera): tres en 256px útiles a 1024, así que sin icono.
// `flex-auto` y no `flex-1`: cada botón parte del ancho de su palabra y se reparte el resto; a
// tercios iguales "Descuento" no cabía y se cortaba a "Descuen…".
const BOTON_SECUNDARIO =
  "flex h-11 min-w-0 flex-auto items-center justify-center rounded-md border px-2 text-[14px] font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.98] disabled:cursor-default disabled:active:scale-100";
// Botones del pie que no son Cobrar: mismo alto (44px), mismo peso.
const BOTON_PIE =
  "flex h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-[14px] font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.98] disabled:cursor-default disabled:active:scale-100";

/* ── Componente principal ─────────────────────────────────────── */
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
  accionSecundaria,
  onEnviarCocina,
  onEnviarCocinaAbierto,
  onPonerEnEspera,
  folioCuenta,
  cocinaEnviada = false,
  enviandoCocina = false,
  onAplicarDescuento,
  descuentoMxn = 0,
  totalConDescuento,
  promocionMxn = 0,
  bloqueado = false,
  procesando,
  onEditar,
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
  /** Botón extra bajo la acción principal del pie (p. ej. "Guardar sin mandar"). */
  accionSecundaria?: { etiqueta: string; onClick: () => void; deshabilitado?: boolean };
  /** B1 Full Service — enviar la mesa a cocina antes de cobrar (solo en cuenta de mesa). */
  onEnviarCocina?: () => void;
  /** Pick-up / Domicilio — envía a cocina y deja la cuenta ABIERTA (sin cobrar); se cobra después
   *  desde "Ver cuentas". Cuando se pasa, es la acción principal del pie. */
  onEnviarCocinaAbierto?: () => void;
  /** D45 §12 — guarda el pedido en espera con etiqueta (flujo QS, sin cuenta de mesa). */
  onPonerEnEspera?: () => void;
  /** Folio de la cuenta que se está editando. Ausente = ticket nuevo. */
  folioCuenta?: string | null;
  cocinaEnviada?: boolean;
  enviandoCocina?: boolean;
  onAplicarDescuento?: () => void;
  /** Monto de descuento ya aplicado en BD (autoritativo). 0 = sin descuento. */
  descuentoMxn?: number;
  /** Total autoritativo de la BD cuando el ticket ya está persistido; si falta, se usa el display. */
  totalConDescuento?: number;
  /** Rebajado por promociones del negocio. Renglón propio: si se sumara al descuento, el
   *  cliente vería bajar el total sin que nada en pantalla diga por qué. */
  promocionMxn?: number;
  /** El ticket ya está comprometido en BD: bloquea edición del carrito para evitar desincronización. */
  bloqueado?: boolean;
  procesando: boolean;
}) {
  const totales = calcularTotalesDisplay(estado.lineas, 16, estado.envio?.costoMxn ?? 0);
  const vacio = estado.lineas.length === 0;
  const totalProductos = estado.lineas.reduce((s, l) => s + l.cantidad, 0);
  // Notas de cocina: qué línea se está editando + si el input de nota de orden está abierto.
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  const [notaOrdenAbierta, setNotaOrdenAbierta] = useState(false);
  const hayDescuento = descuentoMxn > 0;
  const hayPromocion = promocionMxn > 0;
  const totalFinal = totalConDescuento ?? totales.total;
  /**
   * Cuenta que NO se cobra aquí: Pick-up y Domicilio mandan a cocina y se cobran después,
   * desde su pantalla de cuentas. En ese flujo la caja solo captura, así que se ocultan
   * Cobrar y Descuento — el descuento se aplica al cobrar, y tenerlo aquí invita a "cobrar ahora"
   * una orden que todavía no sale de cocina. El interruptor de precios sí se queda: un cliente
   * pregunta cuánto cuesta algo en cualquiera de los cuatro modos.
   */
  const seCobraDespues = onEnviarCocinaAbierto != null;
  // "En espera" vive en la fila secundaria solo en el pie de Cobrar; en el de mesa (Enviar a
  // cocina) no existe, igual que antes.
  const enEsperaEnFila = !seCobraDespues && !onEnviarCocina;
  // No depende de `bloqueado`: en cuenta de mesa los renglones que no han salido a cocina sí se
  // editan (0119). Quien pasa `onEditar` decide qué renglón se abre y avisa del que no.
  const editable = onEditar != null && !procesando;

  // Ancho del carrito: era fijo en 404px, y en una caja de 1024px se comía el 40% de la pantalla
  // dejando el catálogo apretado. Ahora escala con topes: nunca menos de 288px —por debajo no cabe
  // una línea con cantidad, nombre y precio— ni más de 420px.
  //
  // Bajó de 32vw a 26vw: cada punto porcentual de aquí es ancho que le falta al catálogo, y el
  // catálogo es el que tiene que caber sin scroll. En 1366 le devuelve ~90px —una columna más de
  // productos—; en 1024 es la diferencia entre 3 y 4 columnas.
  return (
    <aside className="flex w-[clamp(18rem,26vw,26.25rem)] flex-shrink-0 flex-col border-l border-line bg-surface">

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-line px-4 pb-3 pt-1.5">
        {/* fila superior: título + Limpiar */}
        <div className="flex items-center justify-between gap-2">
          {/* El título decía siempre "Ticket nuevo", incluso editando una cuenta ya abierta:
              el cajero no tenía forma de saber si estaba agregando a un pedido existente o
              capturando uno nuevo, que es justo la diferencia entre mandar a cocina y cobrar. */}
          <span className="truncate font-display text-[18px] font-semibold leading-tight tracking-[-0.02em]">
            {titulo ?? (folioCuenta ? `Cuenta ${folioCuenta}` : "Ticket nuevo")}
          </span>
          {/* Dos botones en uno: con la cuenta ya guardada en BD esto CANCELA la cuenta; con un
              carrito suelto solo lo vacía. Se dice cuál de los dos es, porque no se deshacen igual.

              El `vacio` solo aplica al carrito suelto. Antes deshabilitaba también el otro caso, y
              eso dejaba sin salida justo a la mesa que más la necesita: la que se abrió por error y
              no tiene ni un producto. Su ticket ya existe (BORRADOR) y tiene la mesa ocupada; si el
              único botón que la cancela está gris, la mesa se queda ocupada para siempre.

              Rojo desde el principio, no solo al pasar el mouse: en una pantalla táctil no hay
              mouse, y era gris hasta el momento de tocarlo. Gris solo cuando no hace nada. */}
          <button
            type="button"
            disabled={procesando || (bloqueado ? !onCancelarTicket : vacio || !onLimpiar)}
            onClick={() => (bloqueado && onCancelarTicket ? onCancelarTicket() : onLimpiar?.())}
            className="-mr-2.5 h-11 flex-shrink-0 rounded-md px-2.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-default disabled:text-ink-3 disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {bloqueado && onCancelarTicket ? "Cancelar cuenta" : "Limpiar"}
          </button>
        </div>
        {/* Modo de servicio — SOLO LECTURA. El modo se elige en la pantalla de inicio (una venta
            no cambia de modo a media captura); aquí se muestra para que el cajero no pierda de
            vista en qué está capturando. Para cambiarlo: volver al inicio y entrar por el otro modo. */}
        <div className="mt-0.5">
          {/* Sin palomita y en gris neutro: con ella parecía una opción marcada que se podía
              desmarcar, y no es un botón. */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex h-8 min-w-0 items-center rounded-md bg-hover px-2.5 text-[14px] font-semibold text-ink-2">
              <span className="truncate">{etiquetaModo(estado.modoServicio)}</span>
            </span>
            <span className="flex-shrink-0 text-[13px] font-semibold text-ink-3">
              {totalProductos} {totalProductos === 1 ? "producto" : "productos"}
            </span>
          </div>
          {/* "Cobro completado" se cierra solo; si la cajera todavía está contando el dinero, aquí
              sigue el número. Se va con el primer producto. */}
          {vacio && cambioAnterior != null && cambioAnterior > 0 && (
            <div className="mt-2 flex h-10 items-center justify-between gap-2 rounded-md bg-success-soft px-3 text-success" role="status">
              <span className="text-[14px] font-semibold">Cambio anterior</span>
              <span className="font-display text-[18px] font-bold tabular-nums">{fmtMxn(cambioAnterior)}</span>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-3"><path d="M12 2a8 8 0 0 0-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 0 0-8-8z" /><circle cx="12" cy="10" r="3" /></svg>
              {estado.clienteDomicilio ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{estado.clienteDomicilio.nombre || "Cliente"}</span>
                  <span className="block truncate text-[11.5px] text-ink-3">{estado.clienteDomicilio.direccionPreview ?? estado.clienteDomicilio.telefono ?? "Sin domicilio"}</span>
                </span>
              ) : (
                <span className="flex-1 text-[13px] font-semibold text-accent">Asignar cliente y domicilio</span>
              )}
            </button>
          )}
          {/* Era un texto de 12.5px sin caja: se tocaba a ciegas. */}
          {onNotaOrden && !bloqueado && (
            <button
              type="button"
              onClick={() => setNotaOrdenAbierta((v) => !v)}
              className={[
                "mt-2 flex h-10 w-full items-center rounded-md border border-dashed px-2.5 text-[14px] font-medium transition-colors",
                estado.notaOrden ? "border-warning/50 text-warning" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink",
              ].join(" ")}
            >
              {estado.notaOrden ? "✎ Nota de la orden" : "+ Nota de la orden"}
            </button>
          )}
          {/* Nota de cocina de TODA la orden (va a tickets.nota_general → KDS y comanda) */}
          {notaOrdenAbierta && !bloqueado && (
            <input
              autoFocus
              defaultValue={estado.notaOrden ?? ""}
              maxLength={300}
              placeholder="Nota para cocina de toda la orden…"
              className="mt-1.5 h-10 w-full rounded border border-line-strong px-3 text-[13px] outline-none focus:border-ink"
              onBlur={(e) => { onNotaOrden?.(e.target.value.trim() || null); setNotaOrdenAbierta(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          )}
          {estado.notaOrden && !notaOrdenAbierta && (
            <div className="mt-1.5 rounded border-l-2 border-[#D4A017] bg-warning-soft px-2.5 py-1.5 text-[12.5px] font-medium italic text-[#7A5A10]">
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
            <p className="text-[15px] font-semibold text-ink-2">
              Agrega productos para empezar
            </p>
            <span className="text-[13px]">
              Toca un producto del catálogo para iniciar el ticket.
            </span>
          </div>
        ) : (
          <ul>
            {estado.lineas.map((l: LineaCarrito) => (
              <li key={l.clientId} className="border-b border-line py-2.5">
                {/* Tocar el renglón lo reabre en su modal de modificadores o de combo. Quien llama
                    decide si hay algo que editar: un producto sin modificadores no abre nada. */}
                <div
                  role={editable ? "button" : undefined}
                  tabIndex={editable ? 0 : undefined}
                  aria-label={editable ? `Editar ${l.producto.nombre}` : undefined}
                  onClick={editable ? () => onEditar!(l.clientId) : undefined}
                  onKeyDown={
                    editable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditar!(l.clientId); }
                        }
                      : undefined
                  }
                  className={editable ? "-mx-2 -my-1 cursor-pointer rounded-md px-2 py-1 outline-none transition-[transform,background-color] duration-150 ease-vim hover:bg-hover focus-visible:ring-2 focus-visible:ring-ink active:scale-[.99]" : undefined}
                >
                  <RenglonItem
                    cantidad={l.cantidad}
                    nombre={l.producto.nombre}
                    modificadores={l.modificadores.map((m) => m.opcionNombre)}
                    notaCocina={l.notaCocina}
                    totalMxn={totalLinea(l)}
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
                  <span className="inline-flex items-center rounded-md border border-line-strong bg-surface">
                    <button
                      type="button"
                      aria-label="Menos"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad - 1)}
                      className={BOTON_STEPPER}
                    >
                      −
                    </button>
                    <span className="min-w-[28px] text-center font-display text-[16px] font-bold tabular-nums">
                      {l.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label="Más"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad + 1)}
                      className={BOTON_STEPPER}
                    >
                      +
                    </button>
                  </span>
                  {bloqueado && onDescuentoItem && (
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
                  {!bloqueado && onNotaLinea && (
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
                    onClick={() => (bloqueado && onCancelarItemPersistido ? onCancelarItemPersistido(l.clientId) : onQuitar(l.clientId))}
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
                      className="h-10 w-full rounded border border-line-strong px-3 text-[13px] outline-none focus:border-ink"
                      onBlur={(e) => { onNotaLinea?.(l.clientId, e.target.value.trim() || null); setEditandoNota(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Totales ───────────────────────────────────────────── */}
      {/* Compactado respecto al mockup P-059 (que usa py-4, filas de 14.5px y TOTAL de 30px): en la
          caja real el alto del pie le comía espacio a la lista de productos, que es lo que el
          cajero necesita ver. Subtotal/IVA son informativos → tipografía menor y filas apretadas;
          el TOTAL sigue siendo el número dominante. */}
      <div className="flex-shrink-0 border-t border-line bg-sel px-4 pb-2.5 pt-3">
        {/* Renglón de envío: tocable SIEMPRE, también con el ticket ya persistido — un domicilio
            se manda a cocina (y por tanto se persiste) antes de cobrarse, así que apagar esto al
            bloquear dejaría la función muerta justo cuando más se necesita. El caller reescribe
            la BD (fijarEnvioTicket) y refresca el total autoritativo cuando corresponde. */}
        {estado.envio && (
          <button
            type="button"
            onClick={onCambiarZona}
            className="mb-1 flex w-full items-center justify-between text-[13px] text-ink-2 hover:text-ink"
          >
            <span>{estado.envio.nombre}</span>
            <span className="tabular-nums font-medium text-ink">{fmtMxn(estado.envio.costoMxn)}</span>
          </button>
        )}
        <div className="mb-1 flex justify-between text-[13px] text-ink-2">
          <span>Subtotal</span>
          <span className="tabular-nums font-medium text-ink">{fmtMxn(totales.subtotal)}</span>
        </div>
        <div className="mb-1 flex justify-between text-[13px] text-ink-2">
          <span>IVA (16%)</span>
          <span className="tabular-nums font-medium text-ink">{fmtMxn(totales.iva)}</span>
        </div>
        {hayPromocion && (
          <div className="mb-1 flex justify-between text-[13px] font-medium text-success">
            <span>Promoción</span>
            <span className="tabular-nums">−{fmtMxn(promocionMxn)}</span>
          </div>
        )}
        {hayDescuento && (
          <div className="mb-1 flex justify-between text-[13px] font-medium text-danger">
            <span>Descuento</span>
            <span className="tabular-nums">−{fmtMxn(descuentoMxn)}</span>
          </div>
        )}
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-bold uppercase tracking-[0.04em] text-ink">
            Total
          </span>
          <span className="font-display text-[28px] font-bold leading-none tabular-nums tracking-[-0.02em] text-ink">
            {fmtMxn(totalFinal)}
          </span>
        </div>
      </div>

      {/* ── Acciones secundarias ──────────────────────────────── */}
      {/* Donde estaba "Nota": ese botón nació `disabled` con un "F5.2b — diferido" y nunca se
          implementó, mientras la nota de la orden SÍ funciona desde el encabezado del ticket
          ("+ Nota de la orden"). Ocupaba la mitad del renglón para no hacer nada. */}
      {/* "En espera" subió aquí desde el pie: su lugar bajo Cobrar es ahora "Efectivo exacto", que se
          usa en casi cada venta. Tres botones iguales; a 288px no cabe un icono más. */}
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
        {enEsperaEnFila && (
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
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg> Enviar a cocina</>
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
          ) : (
            <>
              Cobrar{" "}
              <span className="font-display tabular-nums">{fmtMxn(totalFinal)}</span>
            </>
          )}
        </button>
        {onEnviarCocina ? (
          /* B1 Full Service — enviar la mesa a cocina antes de cobrar */
          <button
            type="button"
            disabled={vacio || enviandoCocina || cocinaEnviada}
            onClick={onEnviarCocina}
            className={[
              BOTON_PIE,
              cocinaEnviada
                ? "border-success/40 bg-success-soft text-success disabled:opacity-100"
                : "border-line-strong bg-surface text-ink hover:border-ink disabled:opacity-[.45]",
            ].join(" ")}
          >
            {cocinaEnviada ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><path d="M20 6 9 17l-5-5" /></svg> Enviado a cocina</>
            ) : enviandoCocina ? "Enviando…" : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg> Enviar a cocina</>
            )}
          </button>
        ) : (
          /* Efectivo exacto: un toque en vez de cinco (Cobrar → Efectivo → Pago exacto → Cobrar).
             Es el cobro más común de mostrador. Borde de tinta: es la segunda acción del pie, no
             una más de las grises. */
          <button
            type="button"
            disabled={vacio || procesando || !onEfectivoExacto}
            onClick={() => onEfectivoExacto?.()}
            className="flex h-12 w-full items-center justify-center rounded-lg border border-ink bg-surface text-[16px] font-bold text-ink transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.98] disabled:cursor-default disabled:border-line-strong disabled:opacity-[.45] disabled:active:scale-100"
          >
            Efectivo exacto
          </button>
        )}
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
