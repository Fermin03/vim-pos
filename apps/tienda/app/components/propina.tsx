"use client";
// La propina al pagar en línea: «Sin propina», 10, 15 o 20 % (cada una con su importe) y, debajo y a
// todo el ancho, «Otro monto», que abre un campo para escribirlo. Se pinta de dos maneras:
//  · `elegir`    — en «¿Cómo pagas?»: el selector de «Para recoger / A domicilio»; lo elegido queda marcado;
//  · `preguntar` — en «¿Gustas dejar una propina?»: botones secundarios; un toque en un porcentaje
//                  contesta y sigue. (Ahí «Sin propina» es el «Ahora no» del pie.)
// Las reglas del monto están en lib/pago.ts (`leerOtroMonto`); aquí solo se pinta.
//
// TEXTOS PROVISIONALES: los revisa James.
import { botonClases, cn } from "@vim/ui/styles";
import { formatoMxn } from "../lib/dinero";
import { PROPINAS, type Propina, type PropinaElegida } from "../lib/pago";
import { CampoDeTexto } from "./campo";

const SEGMENTO = cn(
  "flex items-center justify-center rounded px-1 text-center leading-tight text-ink-2 transition-colors duration-150",
  "peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm",
  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
);
const SECUNDARIO = botonClases({ variant: "ghost" });

export function Propina({ id, modo, propina, alElegir, montoDe, otro, alCambiarOtro, alSalirDeOtro, errorDeOtro, tope, deshabilitado }: {
  /** El campo del monto es `${id}-otro`: quien usa esto le manda el foco. */
  id: string; modo: "elegir" | "preguntar";
  propina: PropinaElegida; alElegir: (p: Propina | "otro") => void;
  /** El importe de un porcentaje, o null si todavía no hay sobre qué calcularlo. */
  montoDe: (pct: Propina) => string | null;
  otro: string; alCambiarOtro: (v: string) => void; alSalirDeOtro: () => void; errorDeOtro?: string;
  /** Lo más que puede ser el monto (el subtotal de los productos), para decirlo junto al campo. */
  tope: string | null;
  deshabilitado: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", deshabilitado && "pointer-events-none opacity-60")}>
      {modo === "elegir" ? (
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-hover p-1">
          {PROPINAS.map((pct) => {
            const monto = pct > 0 ? montoDe(pct) : null;
            return (
              <label key={pct} className="cursor-pointer">
                <input type="radio" name={`${id}-propina`} checked={propina === pct} onChange={() => alElegir(pct)} disabled={deshabilitado} className="peer sr-only" />
                <span className={cn(SEGMENTO, "h-14 flex-col")}>
                  <span className="text-14 font-semibold">{pct === 0 ? "Sin propina" : `${pct} %`}</span>
                  {monto && <span className="mt-0.5 text-13 tabular-nums">{formatoMxn(monto)}</span>}
                </span>
              </label>
            );
          })}
          <label className="col-span-4 cursor-pointer">
            <input type="radio" name={`${id}-propina`} checked={propina === "otro"} onChange={() => alElegir("otro")} disabled={deshabilitado} className="peer sr-only" />
            <span className={cn(SEGMENTO, "h-11 text-14 font-semibold")}>Otro monto</span>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {PROPINAS.filter((pct) => pct > 0).map((pct) => {
            const monto = montoDe(pct);
            return (
              <button key={pct} type="button" onClick={() => alElegir(pct)} disabled={deshabilitado} className={cn(SECUNDARIO, "h-14 flex-col px-1")}>
                <span>{pct} %</span>
                {monto && <span className="font-sans text-13 font-normal tabular-nums text-ink-2">{formatoMxn(monto)}</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => alElegir("otro")} disabled={deshabilitado} aria-expanded={propina === "otro"}
            className={cn(SECUNDARIO, "col-span-3 h-12", propina === "otro" && "border-ink")}>
            Otro monto
          </button>
        </div>
      )}
      {propina === "otro" && (
        <CampoDeTexto id={`${id}-otro`} etiqueta="¿Cuánto quieres dejar?" value={otro} error={errorDeOtro} maxLength={9}
          inputMode="decimal" autoComplete="off" placeholder="0.00" disabled={deshabilitado}
          ayuda={tope ? `En pesos. Hasta ${formatoMxn(tope)}.` : "En pesos."}
          alCambiar={alCambiarOtro} alSalir={alSalirDeOtro} />
      )}
    </div>
  );
}
