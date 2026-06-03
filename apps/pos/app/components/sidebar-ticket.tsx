"use client";
import { Button } from "@vim/ui/styles";
import type { EstadoCarrito, LineaCarrito, ModoServicio } from "../lib/carrito";
import { calcularTotalesDisplay, precioUnitarioLinea, totalLinea } from "../lib/carrito";
import { fmtMxn } from "../lib/turno";
import { SelectorModoServicio } from "./selector-modo-servicio";

export function SidebarTicket({
  estado,
  onCantidad,
  onQuitar,
  onModo,
  onCobrar,
  procesando,
}: {
  estado: EstadoCarrito;
  onCantidad: (clientId: string, cantidad: number) => void;
  onQuitar: (clientId: string) => void;
  onModo: (m: ModoServicio) => void;
  onCobrar: () => void;
  procesando: boolean;
}) {
  const totales = calcularTotalesDisplay(estado.lineas);
  const vacio = estado.lineas.length === 0;

  return (
    <aside className="flex w-[340px] flex-shrink-0 flex-col border-l border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-3">Ticket actual</div>
        <SelectorModoServicio valor={estado.modoServicio} onCambiar={onModo} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {vacio && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-ink-2">Carrito vacío</p>
            <p className="text-[12.5px] text-ink-3">Tapea un producto para empezar.</p>
          </div>
        )}
        {!vacio && (
          <ul className="divide-y divide-line">
            {estado.lineas.map((l: LineaCarrito) => (
              <li key={l.clientId} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold leading-tight">{l.producto.nombre}</div>
                    {l.modificadores.length > 0 && (
                      <div className="mt-0.5 text-[12px] text-ink-3">
                        {l.modificadores.map((m) => m.opcionNombre).join(", ")}
                      </div>
                    )}
                    {l.notaCocina && <div className="mt-0.5 text-[12px] italic text-ink-3">"{l.notaCocina}"</div>}
                    <div className="mt-1 text-[12px] text-ink-3">{fmtMxn(precioUnitarioLinea(l))} c/u</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-[14px] font-bold tabular-nums">{fmtMxn(totalLinea(l))}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" aria-label="Menos" onClick={() => onCantidad(l.clientId, l.cantidad - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink">−</button>
                  <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.cantidad}</span>
                  <button type="button" aria-label="Más" onClick={() => onCantidad(l.clientId, l.cantidad + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink">+</button>
                  <button type="button" onClick={() => onQuitar(l.clientId)}
                    className="ml-auto text-[12px] font-medium text-danger hover:underline">Quitar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-4">
        <div className="mb-2 flex justify-between text-[13.5px] text-ink-2">
          <span>Subtotal</span><span className="tabular-nums">{fmtMxn(totales.subtotal)}</span>
        </div>
        <div className="mb-3 flex justify-between text-[13.5px] text-ink-3">
          <span>IVA (16%)</span><span className="tabular-nums">{fmtMxn(totales.iva)}</span>
        </div>
        <div className="mb-3 flex justify-between border-t border-line pt-3 font-display text-[18px] font-bold">
          <span>Total</span><span className="tabular-nums">{fmtMxn(totales.total)}</span>
        </div>
        <Button size="lg" className="w-full" disabled={vacio || procesando} onClick={onCobrar}>
          {procesando ? "Procesando…" : `Cobrar ${fmtMxn(totales.total)}`}
        </Button>
      </div>
    </aside>
  );
}
