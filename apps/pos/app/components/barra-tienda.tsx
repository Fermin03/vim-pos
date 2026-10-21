"use client";
import { Icono } from "@vim/ui/styles";
import type { Destino, SeccionTienda } from "../lib/tienda";

/**
 * Barra inferior de la caja de tienda y de la de belleza (pos-retail.md, «Versión 2»): reemplaza al inicio de
 * mosaicos, al «Menú» y al `Volver`. Sin animación al cambiar: se toca decenas de veces al día.
 * `bloqueada` (un cobro o un diálogo encima) la deja sin responder.
 */
export function BarraTienda({ destinos, seccion, onCambiar, pendientes, pendientesPedidos = 0, bloqueada }: {
  /** `destinosDe(caja, agenda, existencias)`: la barra de tienda, la de belleza o la de comida rápida. */
  destinos: Destino[];
  seccion: SeccionTienda;
  onCambiar: (s: SeccionTienda) => void;
  /** Avisos sin ver: el globo de Notificaciones. */
  pendientes: number;
  /** Comida rápida: lo que espera atención en «Pedidos» (`globoPedidos`). */
  pendientesPedidos?: number;
  bloqueada: boolean;
}) {
  return (
    <nav aria-label="Secciones de la caja" className="flex flex-shrink-0 border-t border-line bg-surface">
      {destinos.map((d) => {
        const elegido = d.seccion === seccion;
        const globo = d.seccion === "notificaciones" ? pendientes : d.seccion === "pedidos" ? pendientesPedidos : 0;
        return (
          <button
            key={d.seccion}
            type="button"
            disabled={bloqueada}
            aria-current={elegido ? "page" : undefined}
            onClick={() => { if (!elegido) onCambiar(d.seccion); }}
            className={[
              "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-transform duration-150 ease-vim active:scale-[.97] disabled:cursor-default disabled:opacity-60 disabled:active:scale-100",
              elegido ? "text-accent" : "text-ink-2",
            ].join(" ")}
          >
            <span className="relative">
              <Icono nombre={d.icono} className="h-5 w-5" />
              {globo > 0 && (
                <span className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-12 font-bold tabular-nums leading-none text-white">
                  {globo > 99 ? "99+" : globo}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-1 text-13 font-semibold">{d.etiqueta}</span>
          </button>
        );
      })}
    </nav>
  );
}
