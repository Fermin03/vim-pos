"use client";
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
export type PedidosTienda = { aceptacion: "MANUAL" | "AUTO"; minutos: string; pagoEfectivo: boolean; pagoTarjeta: boolean };

/** Bloque 3: cómo entran los pedidos y cómo se pagan al recibir. */
export function TiendaPedidos({
  valores,
  hayDireccion,
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
  guardando: boolean;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onCambio: (cambio: Partial<PedidosTienda>) => void;
  onGuardar: () => void;
}) {
  const n = Number(valores.minutos);
  const minutosMal = valores.minutos !== "" && (n < 3 || n > 15);
  // No se pueden desmarcar las dos: la única marcada queda fija.
  const soloEfectivo = valores.pagoEfectivo && !valores.pagoTarjeta;
  const soloTarjeta = valores.pagoTarjeta && !valores.pagoEfectivo;

  return (
    <Tarjeta titulo="Pedidos">
      <div className="grid grid-cols-1 gap-5">
        <div>
          <span className={label}>Aceptación</span>
          <Segmentos
            etiqueta="Aceptación"
            opciones={ACEPTACION}
            valor={valores.aceptacion}
            onCambiar={(v) => { if (!soloLectura) onCambio({ aceptacion: v }); }}
            className={cn(soloLectura && "pointer-events-none opacity-50")}
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
              disabled={soloLectura}
              aria-invalid={minutosMal ? true : undefined}
              aria-describedby="tie-minutos-ayuda"
              onChange={(e) => onCambio({ minutos: e.target.value.replace(/\D/g, "") })}
            />
            <p id="tie-minutos-ayuda" className={ayuda}>
              De 3 a 15. Si nadie responde en ese tiempo, el pedido se cancela solo y el cliente se entera.
            </p>
          </div>
        )}

        <fieldset>
          <legend className={label}>Formas de pago al recibir</legend>
          <label className={casilla}>
            <input
              type="checkbox"
              className="h-5 w-5 flex-shrink-0 accent-ink"
              checked={valores.pagoEfectivo}
              disabled={soloLectura || soloEfectivo}
              onChange={(e) => onCambio({ pagoEfectivo: e.target.checked })}
            />
            Efectivo
          </label>
          <label className={casilla}>
            <input
              type="checkbox"
              className="h-5 w-5 flex-shrink-0 accent-ink"
              checked={valores.pagoTarjeta}
              disabled={soloLectura || soloTarjeta}
              onChange={(e) => onCambio({ pagoTarjeta: e.target.checked })}
            />
            Tarjeta (con terminal al entregar)
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
