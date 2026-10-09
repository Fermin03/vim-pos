"use client";
// Cómo se recibe el pedido: para recoger o a domicilio y, a domicilio, la zona (nombre y costo; la
// elige el cliente, decisión 5). Con un solo modo no se pregunta (decisión 6): se dice cuál es.
// Va en el encabezado del menú y otra vez en el carrito, que es donde cambia el total.
import { useId } from "react";
import { cn } from "@vim/ui/styles";
import type { Modo, Sucursal } from "../lib/contrato";
import { formatoMxn } from "../lib/dinero";
import { modosDe } from "../lib/pantalla";

const NOMBRE: Record<Modo, string> = { RECOGER: "Para recoger", DOMICILIO: "A domicilio" };

export function Entrega({ sucursal, modo, zonaId, alCambiarModo, alCambiarZona }: {
  sucursal: Sucursal; modo: Modo; zonaId: string | null; alCambiarModo: (m: Modo) => void; alCambiarZona: (id: string | null) => void;
}) {
  const id = useId();
  const modos = modosDe(sucursal);
  if (modos.length === 0) return null;
  const zona = sucursal.zonas.find((z) => z.id === zonaId);
  return (
    <div className="flex flex-col gap-3">
      {modos.length === 1 ? (
        <p className="text-15 font-medium text-ink">{modo === "RECOGER" ? "Pedidos para recoger en la sucursal" : "Pedidos a domicilio"}</p>
      ) : (
        <fieldset role="radiogroup" className="min-w-0">
          <legend className="sr-only">¿Cómo quieres recibir tu pedido?</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-hover p-1">
            {modos.map((m) => (
              <label key={m} className="cursor-pointer">
                <input type="radio" name={id} checked={modo === m} onChange={() => alCambiarModo(m)} className="peer sr-only" />
                <span className={cn(
                  "flex h-11 items-center justify-center rounded text-15 font-semibold text-ink-2 transition-colors duration-150",
                  "peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                )}>{NOMBRE[m]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {modo === "DOMICILIO" && sucursal.zonas.length === 1 && zona && (
        <p className="text-15 text-ink-2 [overflow-wrap:anywhere]">Envío a {zona.nombre}: <span className="font-semibold tabular-nums text-ink">{formatoMxn(zona.costo_mxn)}</span></p>
      )}
      {modo === "DOMICILIO" && sucursal.zonas.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-14 font-medium text-ink-2">Zona de entrega</span>
          <select value={zonaId ?? ""} onChange={(e) => alCambiarZona(e.target.value || null)}
            className="h-12 w-full rounded border border-line-strong bg-surface px-3 text-16 text-ink focus:border-ink focus:outline-none">
            <option value="">Elige tu zona</option>
            {sucursal.zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}: envío {formatoMxn(z.costo_mxn)}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
