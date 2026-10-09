"use client";
import { useState } from "react";
import { Button, cn } from "@vim/ui/styles";
import { label } from "./campos";
import { CampoImagen } from "./campo-imagen";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import { normalizarDireccion } from "../lib/tienda-pagina";
import { BASE_TIENDA, errorDeDireccion } from "../lib/tienda-reglas";

const ayuda = "mt-1 text-12 text-ink-3";
const DESCRIPCION_MAX = 200;

export type DatosTienda = { direccion: string; color: string; descripcion: string };

/** Bloque 2: cómo se llama la tienda en internet y cómo se ve. */
export function TiendaDatos({
  valores,
  logoUrl,
  hayDireccion,
  logoOcupado,
  mensajeLogo,
  guardando,
  ocupado,
  soloLectura,
  mensaje,
  onCambio,
  onGuardar,
  onSubirLogo,
  onQuitarLogo,
}: {
  valores: DatosTienda;
  logoUrl: string | null;
  /** El logo se guarda en la fila de la tienda, que solo existe cuando ya hay dirección guardada. */
  hayDireccion: boolean;
  /** Se está subiendo o quitando el logo. */
  logoOcupado: boolean;
  mensajeLogo: MensajeTienda | null;
  guardando: boolean;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onCambio: (cambio: Partial<DatosTienda>) => void;
  onGuardar: () => void;
  /** El logo se sube al momento, aparte del «Guardar» de este bloque. */
  onSubirLogo: (archivo: File) => void;
  onQuitarLogo: () => void;
}) {
  // Mientras se escribe no se corrige ni se regaña: el cursor no brinca y «mi tienda» no sale en rojo
  // por el espacio. Al salir del campo se normaliza (minúsculas, guiones) y entonces sí se valida.
  const [direccionVista, setDireccionVista] = useState(false);
  const normal = normalizarDireccion(valores.direccion);
  // Vacía todavía no es un error: es un campo sin llenar. Guardar queda apagado igual.
  const errorDireccion = direccionVista && normal !== "" ? errorDeDireccion(normal) : null;
  const sinDireccion = errorDeDireccion(normal) !== null;

  return (
    <Tarjeta titulo="Tu tienda">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className={label} htmlFor="tie-direccion">Dirección</label>
          {/* En celular el prefijo va arriba y el campo ocupa todo el ancho; desde `sm`, en un renglón. */}
          <div
            className={cn(
              "flex flex-col rounded border focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)] sm:h-11 sm:flex-row sm:items-center",
              errorDireccion ? "border-danger" : "border-line-strong focus-within:border-ink",
            )}
          >
            <span className="flex-shrink-0 px-3 pt-2 text-16 text-ink-3 sm:pr-0 sm:pt-0 lg:text-14" aria-hidden="true">{BASE_TIENDA}/</span>
            <input
              id="tie-direccion"
              className="h-11 w-full min-w-0 bg-transparent px-3 text-sm lowercase outline-none disabled:opacity-50 sm:h-full sm:flex-1 sm:pl-0"
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
              onChange={(e) => { setDireccionVista(false); onCambio({ direccion: e.target.value }); }}
              onBlur={() => { setDireccionVista(true); if (normal !== valores.direccion) onCambio({ direccion: normal }); }}
            />
          </div>
          <p id="tie-direccion-ayuda" className={cn("mt-1 text-12", errorDireccion ? "font-medium text-danger" : "text-ink-3")} role={errorDireccion ? "alert" : undefined}>
            {errorDireccion ?? `Tus clientes entran a ${BASE_TIENDA}/ seguido de lo que escribas aquí.`}
          </p>
        </div>

        <CampoImagen
          titulo="Logo"
          url={logoUrl}
          alt="Logo de tu tienda"
          ajuste="contain"
          textoSubir="Subir logo"
          textoVacio="Sin logo"
          ayuda="Se ve arriba de tu tienda. Mejor si es cuadrado y con fondo transparente."
          claseAyuda={ayuda}
          bloqueo={hayDireccion ? undefined : "Primero guarda la dirección de tu tienda."}
          trabajando={logoOcupado}
          apagado={ocupado || soloLectura}
          quitar={{ titulo: "¿Quitar el logo?", mensaje: "Tu tienda se queda sin logo." }}
          mensaje={<LineaMensaje mensaje={mensajeLogo} className="mt-2" />}
          onSubir={onSubirLogo}
          onQuitar={onQuitarLogo}
        />

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
