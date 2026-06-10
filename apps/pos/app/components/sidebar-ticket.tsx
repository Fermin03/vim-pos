"use client";
import type { EstadoCarrito, LineaCarrito, ModoServicio } from "../lib/carrito";
import { calcularTotalesDisplay, totalLinea } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";

/* ── helpers ─────────────────────────────────────────────────── */
const MODO_LABELS: Record<ModoServicio, string> = {
  COMER_AQUI: "Comedor",
  PARA_LLEVAR: "Para llevar",
  DRIVE_THRU: "Pick-up",
  DELIVERY_PROPIO: "Domicilio",
};
const MODO_ORDEN: ModoServicio[] = ["COMER_AQUI", "PARA_LLEVAR", "DRIVE_THRU", "DELIVERY_PROPIO"];

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
function IconoNota() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}
function IconoDescuento() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

/* ── Componente principal ─────────────────────────────────────── */
export function SidebarTicket({
  estado,
  onCantidad,
  onQuitar,
  onCancelarItemPersistido,
  onDescuentoItem,
  onLimpiar,
  onCancelarTicket,
  onModo,
  onEditarCliente,
  onCobrar,
  onEnviarCocina,
  cocinaEnviada = false,
  enviandoCocina = false,
  onAplicarDescuento,
  descuentoMxn = 0,
  totalConDescuento,
  bloqueado = false,
  procesando,
}: {
  estado: EstadoCarrito;
  onCantidad: (clientId: string, cantidad: number) => void;
  onQuitar: (clientId: string) => void;
  /** Cuando el ticket está persistido, "Quitar" llama a este handler (cancela en BD con motivo+autorización). */
  onCancelarItemPersistido?: (clientId: string) => void;
  /** Cuando el ticket está persistido, "%" abre el descuento/override por ítem (F6.5). */
  onDescuentoItem?: (clientId: string) => void;
  /** Limpia el carrito local (sin BD). Habilitado cuando no hay ticket persistido y hay líneas. */
  onLimpiar?: () => void;
  /** Cuando el ticket está persistido, "Limpiar" llama a este handler para cancelar todo el ticket. */
  onCancelarTicket?: () => void;
  onModo: (m: ModoServicio) => void;
  /** Abre el modal de cliente para domicilio (solo aplica en modo Domicilio). */
  onEditarCliente?: () => void;
  onCobrar: () => void;
  /** B1 Full Service — enviar la mesa a cocina antes de cobrar (solo en cuenta de mesa). */
  onEnviarCocina?: () => void;
  cocinaEnviada?: boolean;
  enviandoCocina?: boolean;
  onAplicarDescuento: () => void;
  /** Monto de descuento ya aplicado en BD (autoritativo). 0 = sin descuento. */
  descuentoMxn?: number;
  /** Total autoritativo de la BD cuando el ticket ya está persistido; si falta, se usa el display. */
  totalConDescuento?: number;
  /** El ticket ya está comprometido en BD: bloquea edición del carrito para evitar desincronización. */
  bloqueado?: boolean;
  procesando: boolean;
}) {
  const totales = calcularTotalesDisplay(estado.lineas);
  const vacio = estado.lineas.length === 0;
  const totalProductos = estado.lineas.reduce((s, l) => s + l.cantidad, 0);
  const hayDescuento = descuentoMxn > 0;
  const totalFinal = totalConDescuento ?? totales.total;

  return (
    <aside className="flex w-[404px] flex-shrink-0 flex-col border-l border-line bg-surface">

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-line px-5 pb-3 pt-4">
        {/* fila superior: título + Limpiar */}
        <div className="flex items-center justify-between">
          <span className="font-display text-[18px] font-semibold leading-tight tracking-[-0.02em]">
            Ticket nuevo
          </span>
          <button
            type="button"
            disabled={vacio || procesando || (bloqueado && !onCancelarTicket) || (!bloqueado && !onLimpiar)}
            onClick={() => (bloqueado && onCancelarTicket ? onCancelarTicket() : onLimpiar?.())}
            className="rounded px-2 py-[5px] text-[13.5px] font-semibold text-ink-3 transition-colors hover:bg-hover hover:text-danger disabled:cursor-default disabled:opacity-40"
          >
            Limpiar
          </button>
        </div>
        {/* Modo de servicio — fila tocable directa (sin ciclar) */}
        <div className="mt-3">
          <div className="grid grid-cols-4 gap-1">
            {MODO_ORDEN.map((m) => {
              const activo = estado.modoServicio === m;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => onModo(m)}
                  aria-pressed={activo}
                  className={[
                    "flex min-h-[40px] items-center justify-center rounded-md px-1 py-1.5 text-center text-[11.5px] font-semibold leading-tight transition-colors disabled:cursor-default disabled:opacity-50",
                    activo ? "bg-ink text-white" : "bg-[#ECEEF1] text-[#4A5568] hover:bg-hover",
                  ].join(" ")}
                >
                  {MODO_LABELS[m]}
                </button>
              );
            })}
          </div>
          {estado.modoServicio === "DELIVERY_PROPIO" && (
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
          <div className="mt-1.5 text-right text-[12.5px] font-semibold text-ink-3">
            {totalProductos} {totalProductos === 1 ? "producto" : "productos"}
          </div>
        </div>
      </div>

      {/* ── Lista de líneas ───────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
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
              <li
                key={l.clientId}
                className="-ml-1 cursor-pointer border-b border-line border-l-4 border-l-transparent py-3 pl-3 transition-colors hover:bg-sel"
              >
                {/* Fila principal */}
                <div className="flex items-start gap-3">
                  {/* cantidad× */}
                  <span className="font-display min-w-[28px] text-[16px] font-semibold tabular-nums text-ink-2">
                    {l.cantidad}×
                  </span>
                  {/* nombre + mods */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-semibold leading-tight text-ink">
                      {l.producto.nombre}
                    </div>
                    {l.modificadores.length > 0 && (
                      <div className="mt-[3px] text-[13px] leading-[1.4] text-ink-2">
                        {l.modificadores.map((m) => m.opcionNombre).join(" · ")}
                      </div>
                    )}
                    {l.notaCocina && (
                      <div className="mt-1 text-[12.5px] italic text-ink-3">
                        "{l.notaCocina}"
                      </div>
                    )}
                  </div>
                  {/* precio total de línea */}
                  <span className="font-display whitespace-nowrap text-[15.5px] font-semibold tabular-nums text-ink">
                    {fmtMxn(totalLinea(l))}
                  </span>
                </div>

                {/* Controles: stepper + Quitar */}
                <div className="mt-2 flex items-center gap-3 pl-10">
                  <span className="inline-flex items-center overflow-hidden rounded border border-line-strong">
                    <button
                      type="button"
                      aria-label="Menos"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad - 1)}
                      className="flex h-9 w-9 items-center justify-center bg-surface text-[19px] leading-none text-ink-2 transition-colors hover:bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
                    >
                      −
                    </button>
                    <span className="font-display min-w-[34px] text-center text-[15px] font-semibold tabular-nums">
                      {l.cantidad}
                    </span>
                    <button
                      type="button"
                      aria-label="Más"
                      disabled={bloqueado}
                      onClick={() => onCantidad(l.clientId, l.cantidad + 1)}
                      className="flex h-9 w-9 items-center justify-center bg-surface text-[19px] leading-none text-ink-2 transition-colors hover:bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
                    >
                      +
                    </button>
                  </span>
                  {bloqueado && onDescuentoItem && (
                    <button
                      type="button"
                      onClick={() => onDescuentoItem(l.clientId)}
                      title="Descuento / precio del ítem"
                      className="rounded px-2 py-[5px] text-[13px] font-semibold text-ink-3 transition-all hover:bg-hover hover:text-ink"
                    >
                      %
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={bloqueado && !onCancelarItemPersistido}
                    onClick={() => (bloqueado && onCancelarItemPersistido ? onCancelarItemPersistido(l.clientId) : onQuitar(l.clientId))}
                    className="rounded px-2 py-[5px] text-[13px] font-semibold text-ink-3 transition-all hover:bg-hover hover:text-danger disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-3"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Totales ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-line bg-sel px-5 py-4">
        <div className="mb-[7px] flex justify-between text-[14.5px] text-ink-2">
          <span>Subtotal</span>
          <span className="tabular-nums text-ink font-medium">{fmtMxn(totales.subtotal)}</span>
        </div>
        <div className="mb-[7px] flex justify-between text-[14.5px] text-ink-2">
          <span>IVA (16%)</span>
          <span className="tabular-nums text-ink font-medium">{fmtMxn(totales.iva)}</span>
        </div>
        {hayDescuento && (
          <div className="mb-[7px] flex justify-between text-[14.5px] font-medium text-danger">
            <span>Descuento</span>
            <span className="tabular-nums">−{fmtMxn(descuentoMxn)}</span>
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-[15px] font-bold uppercase tracking-[0.03em] text-ink">
            Total
          </span>
          <span className="font-display text-[30px] font-bold tabular-nums tracking-[-0.02em] text-ink">
            {fmtMxn(totalFinal)}
          </span>
        </div>
      </div>

      {/* ── Acciones secundarias ──────────────────────────────── */}
      <div className="flex flex-shrink-0 gap-2 px-5 pt-3">
        {/* F5.2b — diferido */}
        <button
          type="button"
          disabled
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-[7px] rounded border border-line-strong bg-surface px-[11px] py-[11px] text-[14px] font-semibold text-ink-2 transition-all hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-[.45] disabled:hover:border-line-strong disabled:hover:text-ink-2"
        >
          <IconoNota />
          Nota
        </button>
        <button
          type="button"
          disabled={vacio || hayDescuento || procesando}
          onClick={onAplicarDescuento}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-[7px] rounded border border-line-strong bg-surface px-[11px] py-[11px] text-[14px] font-semibold text-ink-2 transition-all hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-[.45] disabled:hover:border-line-strong disabled:hover:text-ink-2"
        >
          <IconoDescuento />
          {hayDescuento ? "Descuento aplicado" : "Descuento"}
        </button>
      </div>

      {/* ── Pie: Cobrar + En espera ───────────────────────────── */}
      <div className="flex flex-shrink-0 flex-col gap-2 px-5 pb-5 pt-4">
        <button
          type="button"
          disabled={vacio || procesando}
          onClick={onCobrar}
          className="flex w-full items-center justify-center gap-[10px] rounded-lg bg-accent px-5 py-[18px] text-[18px] font-bold text-white shadow-[0_1px_3px_rgba(232,80,46,.3)] transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none"
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
              "flex w-full items-center justify-center gap-2 rounded border px-5 py-[13px] text-[14.5px] font-semibold transition-all disabled:cursor-default",
              cocinaEnviada
                ? "border-success/40 bg-[#EAF3EE] text-success disabled:opacity-100"
                : "border-line-strong text-ink-2 hover:border-ink hover:text-ink disabled:opacity-[.45]",
            ].join(" ")}
          >
            {cocinaEnviada ? (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4"><path d="M20 6 9 17l-5-5" /></svg> Enviado a cocina</>
            ) : enviandoCocina ? "Enviando…" : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg> Enviar a cocina</>
            )}
          </button>
        ) : (
          /* F5.2b — diferido */
          <button
            type="button"
            disabled
            className="w-full rounded border border-line-strong bg-transparent px-5 py-[13px] text-[14.5px] font-semibold text-ink-2 transition-all hover:border-ink hover:text-ink disabled:cursor-default disabled:opacity-[.45]"
          >
            Poner pedido en espera
          </button>
        )}
      </div>
    </aside>
  );
}
