"use client";
import { Button, cn } from "@vim/ui/styles";
import { label } from "./campos";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import { BASE_TIENDA, errorDeDireccion } from "../lib/tienda-reglas";

const ayuda = "mt-1 text-12 text-ink-3";
const DESCRIPCION_MAX = 200;

export type DatosTienda = { direccion: string; color: string; descripcion: string };

/** Bloque 2: cómo se llama la tienda en internet y cómo se ve. */
export function TiendaDatos({
  valores,
  logoUrl,
  guardando,
  ocupado,
  soloLectura,
  mensaje,
  onCambio,
  onGuardar,
}: {
  valores: DatosTienda;
  logoUrl: string | null;
  guardando: boolean;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onCambio: (cambio: Partial<DatosTienda>) => void;
  onGuardar: () => void;
}) {
  // Vacía todavía no es un error: es un campo sin llenar. Guardar queda apagado igual.
  const errorDireccion = valores.direccion === "" ? null : errorDeDireccion(valores.direccion);
  const sinDireccion = errorDeDireccion(valores.direccion) !== null;

  return (
    <Tarjeta titulo="Tu tienda">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className={label} htmlFor="tie-direccion">Dirección</label>
          <div
            className={cn(
              "flex h-11 items-center rounded border focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)]",
              errorDireccion ? "border-danger" : "border-line-strong focus-within:border-ink",
            )}
          >
            <span className="flex-shrink-0 pl-3 text-14 text-ink-3" aria-hidden="true">{BASE_TIENDA}/</span>
            <input
              id="tie-direccion"
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none disabled:opacity-50"
              value={valores.direccion}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="tu-negocio"
              disabled={soloLectura}
              aria-invalid={errorDireccion ? true : undefined}
              aria-describedby="tie-direccion-ayuda"
              onChange={(e) => onCambio({ direccion: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
            />
          </div>
          <p id="tie-direccion-ayuda" className={cn("mt-1 text-12", errorDireccion ? "font-medium text-danger" : "text-ink-3")} role={errorDireccion ? "alert" : undefined}>
            {errorDireccion ?? `Tus clientes entran a ${BASE_TIENDA}/ seguido de lo que escribas aquí.`}
          </p>
        </div>

        {/* Task 7: logo */}
        <div>
          <span className={label}>Logo</span>
          <div className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- imagen del almacén público
              <img src={logoUrl} alt="Logo de tu tienda" className="h-16 w-16 flex-shrink-0 rounded border border-line bg-hover object-contain" />
            )}
            <p className="text-13 text-ink-3">El logo se sube en el siguiente paso.</p>
          </div>
        </div>

        <div>
          <label className={label} htmlFor="tie-color">Color</label>
          <div className="flex items-center gap-3">
            <input
              id="tie-color"
              type="color"
              className="h-11 w-16 flex-shrink-0 cursor-pointer rounded border border-line-strong bg-surface p-1 disabled:cursor-default disabled:opacity-50"
              value={valores.color}
              disabled={soloLectura}
              aria-describedby="tie-color-valor"
              onChange={(e) => onCambio({ color: e.target.value })}
            />
            <span id="tie-color-valor" className="font-mono text-14 uppercase tabular-nums text-ink">{valores.color}</span>
          </div>
          <p className={ayuda}>El color principal de tu tienda.</p>
        </div>

        <div>
          <label className={label} htmlFor="tie-descripcion">Descripción</label>
          <textarea
            id="tie-descripcion"
            className="min-h-[72px] w-full rounded border border-line-strong px-3 py-2.5 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)] disabled:opacity-50"
            value={valores.descripcion}
            maxLength={DESCRIPCION_MAX}
            disabled={soloLectura}
            aria-describedby="tie-descripcion-ayuda"
            onChange={(e) => onCambio({ descripcion: e.target.value })}
          />
          <p id="tie-descripcion-ayuda" className={cn(ayuda, "flex justify-between gap-3")}>
            <span>Una frase corta sobre tu negocio.</span>
            <span className="flex-shrink-0 tabular-nums">{valores.descripcion.length} de {DESCRIPCION_MAX}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line pt-4">
        <LineaMensaje mensaje={mensaje} />
        <Button onClick={onGuardar} disabled={ocupado || soloLectura || sinDireccion}>{guardando ? "Guardando…" : "Guardar"}</Button>
      </div>
    </Tarjeta>
  );
}
