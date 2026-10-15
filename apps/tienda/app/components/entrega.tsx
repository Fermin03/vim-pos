"use client";
// Cómo se recibe el pedido: para recoger o a domicilio y, a domicilio, cómo se calcula el envío. La
// zona nunca la elige el cliente (0187 §6): la da su colonia, o el pin si la sucursal cobra por
// distancia. Con un solo modo no se pregunta (decisión 6): se dice cuál es.
// Va en el encabezado del menú y otra vez en el carrito, que es donde cambia el total.
import { useId } from "react";
import { cn } from "@vim/ui/styles";
import type { Modo, Sucursal } from "../lib/contrato";
import { formatoMxn } from "../lib/dinero";
import { modosDe, rangoDeEnvio } from "../lib/pantalla";

const NOMBRE: Record<Modo, string> = { RECOGER: "Para recoger", DOMICILIO: "A domicilio" };

export function Entrega({ sucursal, modo, alCambiarModo }: {
  sucursal: Sucursal; modo: Modo; alCambiarModo: (m: Modo) => void;
}) {
  const id = useId();
  const modos = modosDe(sucursal);
  if (modos.length === 0) return null;
  // Por distancia (0185) el envío sale de la ubicación, en «Tus datos».
  const distancia = sucursal.envio.cobro === "DISTANCIA" ? sucursal.envio : null;
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
      {modo === "DOMICILIO" && distancia && (
        // TEXTO PROVISIONAL (James).
        <p className="text-15 text-ink-2">
          Entregamos hasta {distancia.tramos.at(-1)!.hasta_km.replace(/\.0$/, "")} km.
          {" "}{rangoDeEnvio(distancia.tramos) ?? `Envío ${formatoMxn(distancia.tramos[0]!.costo_mxn)}.`}
        </p>
      )}
      {/* «Por zonas» la zona la da la colonia del catálogo, en «Tus datos». */}
      {modo === "DOMICILIO" && !distancia && (
        // TEXTO PROVISIONAL (James).
        <p className="text-15 text-ink-2">El envío se calcula con tu colonia.</p>
      )}
    </div>
  );
}

