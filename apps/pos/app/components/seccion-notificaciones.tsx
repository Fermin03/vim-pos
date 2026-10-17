"use client";
import { useState } from "react";
import { Modal } from "@vim/ui/styles";
import type { Notificacion } from "../lib/notificaciones-tienda";

const ESTILO = {
  danger: { chip: "bg-danger-soft text-danger", etiqueta: "Agotada" },
  warning: { chip: "bg-warning-soft text-warning", etiqueta: "Pocas" },
  info: { chip: "bg-info-soft text-info", etiqueta: "Aviso de VIM" },
} as const;

/**
 * Notificaciones de la tienda (pos-retail.md, «Versión 2»): las alertas de existencias de esta
 * sucursal y los avisos de VIM, para releerlos. Tocar una existencia abre Inventario con esa prenda;
 * tocar un aviso lo abre completo (texto plano, nunca HTML).
 */
export function SeccionNotificaciones({ notificaciones, onAbrirProducto }: {
  notificaciones: Notificacion[];
  onAbrirProducto: (productoId: string) => void;
}) {
  const [aviso, setAviso] = useState<Notificacion | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-shrink-0 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-display text-20 font-semibold tracking-tight">Notificaciones</h1>
      </div>
      {notificaciones.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-8 text-center text-15 text-ink-2">
          Todo en orden. Aquí verás lo que se agote y los avisos de VIM.
        </p>
      ) : (
        <ul className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-2 overflow-y-auto p-4">
          {notificaciones.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => (n.tipo === "existencia" && n.productoId ? onAbrirProducto(n.productoId) : setAviso(n))}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15 font-semibold text-ink">{n.titulo}</span>
                  <span className="block truncate text-13 text-ink-2">{n.tipo === "aviso" ? n.detalle.split("\n")[0] : n.detalle}</span>
                </span>
                <span className={["flex-shrink-0 rounded px-2 py-1 text-12 font-semibold", ESTILO[n.nivel].chip].join(" ")}>
                  {n.tipo === "existencia" ? n.detalle.split(":")[0] : ESTILO[n.nivel].etiqueta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && (
        <Modal open onClose={() => setAviso(null)} title={aviso.titulo} className="flex max-h-[calc(100vh-32px)] w-full max-w-lg flex-col rounded-lg bg-surface shadow-xl">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className={["inline-block rounded px-2 py-1 text-12 font-semibold", ESTILO[aviso.nivel].chip].join(" ")}>{ESTILO[aviso.nivel].etiqueta}</div>
            <h2 className="mt-2 font-display text-20 font-bold tracking-tight">{aviso.titulo}</h2>
            <p className="mt-3 whitespace-pre-wrap text-15 leading-relaxed text-ink-2">{aviso.detalle}</p>
          </div>
          <div className="flex-shrink-0 border-t border-line px-6 py-4 text-right">
            <button type="button" onClick={() => setAviso(null)} className="h-12 min-w-[140px] rounded bg-ink px-6 text-15 font-semibold text-white transition active:scale-[.98]">
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
