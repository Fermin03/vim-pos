"use client";
import { Icono, type NombreIcono } from "@vim/ui/styles";
import type { SeccionTienda } from "../lib/tienda";

const DESTINOS: { seccion: SeccionTienda; etiqueta: string; icono: NombreIcono }[] = [
  { seccion: "panel", etiqueta: "Panel", icono: "caja" },
  { seccion: "inventario", etiqueta: "Inventario", icono: "etiqueta" },
  { seccion: "transacciones", etiqueta: "Transacciones", icono: "recibo" },
  { seccion: "notificaciones", etiqueta: "Notificaciones", icono: "megafono" },
  { seccion: "configuracion", etiqueta: "Configuración", icono: "engrane" },
];

/**
 * Barra inferior de la caja de tienda (pos-retail.md, «Versión 2»): reemplaza al inicio de
 * mosaicos, al «Menú» y al `Volver`. Sin animación al cambiar: se toca decenas de veces al día.
 * `bloqueada` (un cobro o un diálogo encima) la deja sin responder.
 */
export function BarraTienda({ seccion, onCambiar, pendientes, bloqueada }: {
  seccion: SeccionTienda;
  onCambiar: (s: SeccionTienda) => void;
  /** Avisos sin ver: el globo de Notificaciones. */
  pendientes: number;
  bloqueada: boolean;
}) {
  return (
    <nav aria-label="Secciones de la caja" className="flex flex-shrink-0 border-t border-line bg-surface">
      {DESTINOS.map((d) => {
        const elegido = d.seccion === seccion;
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
              {d.seccion === "notificaciones" && pendientes > 0 && (
                <span className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-12 font-bold tabular-nums leading-none text-white">
                  {pendientes > 99 ? "99+" : pendientes}
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
