"use client";
import { useState } from "react";
import { Button, cn } from "@vim/ui/styles";
import { label } from "./campos";
import { Segmentos } from "./controles";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";

// Campo angosto: `input` de campos.ts trae w-full, y `cn` solo une clases, no resuelve el choque.
const campoCorto =
  "h-11 w-28 rounded border px-3 text-sm tabular-nums outline-none focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)] disabled:opacity-50";
const ayuda = "mt-1 text-12 text-ink-3";
const casilla = "flex min-h-[44px] cursor-pointer items-center gap-3 text-14 text-ink";

const ACEPTACION = [
  { v: "MANUAL", l: "A mano" },
  { v: "AUTO", l: "Automática" },
] as const;

/** `minutos` va como texto: un campo a medio escribir no se convierte en 0. */
export type PedidosTienda = { aceptacion: "MANUAL" | "AUTO"; minutos: string; pagoEfectivo: boolean; pagoTarjeta: boolean; pagoEnLinea: boolean };

/** Bloque 3: cómo entran los pedidos y cómo se pagan. TEXTOS PROVISIONALES de las formas de pago: los revisa James. */
export function TiendaPedidos({
  valores,
  hayDireccion,
  hayCuentaActiva,
  guardando,
  ocupado,
  soloLectura,
  mensaje,
  onCambio,
  onGuardar,
}: {
  valores: PedidosTienda;
  /** Sin dirección guardada todavía no existe la tienda: no hay dónde guardar esto. */
  hayDireccion: boolean;
  /** Hay una cuenta de Mercado Pago activa: sin ella no se puede ofrecer el pago en línea. */
  hayCuentaActiva: boolean;
  guardando: boolean;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onCambio: (cambio: Partial<PedidosTienda>) => void;
  onGuardar: () => void;
}) {
  const n = Number(valores.minutos);
  // El error sale al dejar el campo, no a media tecla: «1» camino de «12» no es un error.
  const [minutosVisto, setMinutosVisto] = useState(false);
  const minutosMal = minutosVisto && (valores.minutos === "" || n < 3 || n > 15);
  // No se pueden desmarcar todas: la única marcada queda fija.
  // Ya encendido y sin cuenta, lo que hay que hacer lo dice el aviso de arriba de la página.
  const sinCuenta = !hayCuentaActiva && !valores.pagoEnLinea;
  const unica = [valores.pagoEnLinea, valores.pagoEfectivo, valores.pagoTarjeta].filter(Boolean).length === 1;
  // Sin dirección guardada no hay fila: lo que se eligiera aquí no se guardaría con «Tu tienda»
  // (la fila nace con lo guardado) y la pantalla enseñaría algo que la base no tiene.
  const quieto = soloLectura || !hayDireccion;

  return (
    <Tarjeta titulo="Pedidos">
      <div className="grid grid-cols-1 gap-5">
        <div>
          <span className={label}>Aceptación</span>
          <Segmentos
            etiqueta="Aceptación"
            opciones={ACEPTACION}
            valor={valores.aceptacion}
            onCambiar={(v) => onCambio({ aceptacion: v })}
            deshabilitado={quieto}
          />
          <p className={ayuda} aria-live="polite">
            {valores.aceptacion === "MANUAL"
              ? "Cada pedido suena en la caja y alguien lo acepta o lo rechaza."
              : "Los pedidos entran directo a cocina."}
          </p>
        </div>

        {valores.aceptacion === "MANUAL" && (
          <div>
            <label className={label} htmlFor="tie-minutos">Minutos de espera</label>
            <input
              id="tie-minutos"
              className={cn(campoCorto, minutosMal ? "border-danger" : "border-line-strong focus:border-ink")}
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={valores.minutos}
              disabled={quieto}
              aria-invalid={minutosMal ? true : undefined}
              aria-describedby={minutosMal ? "tie-minutos-error tie-minutos-ayuda" : "tie-minutos-ayuda"}
              onBlur={() => setMinutosVisto(true)}
              onChange={(e) => onCambio({ minutos: e.target.value.replace(/\D/g, "") })}
            />
            {minutosMal && <p id="tie-minutos-error" role="alert" className="mt-1 text-12 font-medium text-danger">Los minutos para aceptar van de 3 a 15.</p>}
            <p id="tie-minutos-ayuda" className={ayuda}>
              De 3 a 15. Si nadie responde en ese tiempo, el pedido se cancela solo y el cliente se entera.
            </p>
          </div>
        )}

        <fieldset>
          <legend className={label}>Formas de pago</legend>
          <label className={cn(casilla, sinCuenta && "cursor-default text-ink-3")}>
            <input
              type="checkbox"
              className="h-5 w-5 flex-shrink-0 accent-ink"
              checked={valores.pagoEnLinea}
              // Sin cuenta activa no se puede encender; apagarlo siempre se puede (salvo que sea la única).
              disabled={quieto || (valores.pagoEnLinea ? unica : !hayCuentaActiva)}
              aria-describedby={sinCuenta ? "tie-pago-linea-ayuda" : undefined}
              onChange={(e) => onCambio({ pagoEnLinea: e.target.checked })}
            />
            Pago en línea
          </label>
          {sinCuenta && (
            <p id="tie-pago-linea-ayuda" className="-mt-1 mb-1 pl-8 text-12 text-ink-3">
              Para ofrecerlo, conecta tu cuenta de Mercado Pago abajo, en «Pago en línea».
            </p>
          )}
          <label className={casilla}>
            <input
              type="checkbox"
              className="h-5 w-5 flex-shrink-0 accent-ink"
              checked={valores.pagoEfectivo}
              disabled={quieto || (valores.pagoEfectivo && unica)}
              onChange={(e) => onCambio({ pagoEfectivo: e.target.checked })}
            />
            Efectivo al recibir
          </label>
          <label className={casilla}>
            <input
              type="checkbox"
              className="h-5 w-5 flex-shrink-0 accent-ink"
              checked={valores.pagoTarjeta}
              disabled={quieto || (valores.pagoTarjeta && unica)}
              onChange={(e) => onCambio({ pagoTarjeta: e.target.checked })}
            />
            Tarjeta al recibir
          </label>
          <p className={ayuda}>Deja activa al menos una forma de pago.</p>
        </fieldset>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line pt-4">
        {hayDireccion
          ? <LineaMensaje mensaje={mensaje} />
          : <p className="text-13 text-ink-2">Primero guarda la dirección de tu tienda.</p>}
        <Button onClick={onGuardar} disabled={ocupado || soloLectura || !hayDireccion}>{guardando ? "Guardando…" : "Guardar"}</Button>
      </div>
    </Tarjeta>
  );
}
