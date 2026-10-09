"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { Button, cn } from "@vim/ui/styles";
import { Interruptor } from "./interruptor";
import { Tarjeta } from "./tarjeta";
import { TiendaHorario } from "./tienda-horario";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import {
  errorDeSucursal, erroresPorDia, hayCambiosDeSucursal, type BorradorSucursal, type SucursalTienda,
} from "../lib/tienda-reglas";

const casilla = "flex min-h-[44px] cursor-pointer items-center gap-3 text-14 text-ink";
const enlace = "whitespace-nowrap font-semibold underline underline-offset-2";

type Guardar = (id: string, datos: BorradorSucursal) => Promise<boolean>;

/** Bloque 4: qué sucursales venden en la tienda, cómo entregan y a qué horas. */
export function TiendaSucursales({
  sucursales,
  guardando,
  ocupado,
  soloLectura,
  mensajeDe,
  onGuardar,
}: {
  sucursales: SucursalTienda[];
  /** La sucursal que se está guardando ahora, si alguna. */
  guardando: string | null;
  /** Algo se está guardando en la página: una escritura a la vez. */
  ocupado: boolean;
  soloLectura: boolean;
  mensajeDe: (id: string) => MensajeTienda | null;
  /** true = se guardó. */
  onGuardar: Guardar;
}) {
  return (
    <Tarjeta titulo="Sucursales">
      {sucursales.length === 0 ? (
        <p className="text-13 text-ink-2">
          Todavía no tienes sucursales.{" "}
          <Link href="/configuracion/sucursales" className={enlace}>Ir a sucursales</Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sucursales.map((s) => (
            // La llave es la sucursal: lo que el dueño tiene a medio escribir en una tarjeta
            // sobrevive a que se guarde otra y la página vuelva a leer.
            <li key={s.id}>
              <TarjetaSucursal
                sucursal={s}
                guardando={guardando === s.id}
                ocupado={ocupado}
                soloLectura={soloLectura}
                mensaje={mensajeDe(s.id)}
                onGuardar={onGuardar}
              />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function TarjetaSucursal({
  sucursal: s,
  guardando,
  ocupado,
  soloLectura,
  mensaje,
  onGuardar,
}: {
  sucursal: SucursalTienda;
  guardando: boolean;
  ocupado: boolean;
  soloLectura: boolean;
  mensaje: MensajeTienda | null;
  onGuardar: Guardar;
}) {
  const id = useId();
  /** null = sin tocar: se pinta lo guardado, y lo que llegue de la base lo reemplaza. */
  const [borrador, setBorrador] = useState<BorradorSucursal | null>(null);
  const valor = borrador ?? s;
  const sinGuardar = borrador !== null && hayCambiosDeSucursal(borrador, s);
  const quieto = ocupado || soloLectura;
  // Una sucursal inactiva no puede empezar a vender; si ya vendía, sí se puede apagar.
  const inactivaSinVender = !s.activa && !valor.participa;
  const abierta = valor.participa && s.activa;

  const errorModalidad = errorDeSucursal(valor);
  const erroresHorario = valor.participa ? erroresPorDia(valor.horario) : {};
  const conError = errorModalidad !== null || Object.keys(erroresHorario).length > 0;

  function cambiar(cambio: Partial<BorradorSucursal>) {
    const nuevo = { participa: valor.participa, recoger: valor.recoger, domicilio: valor.domicilio, horario: valor.horario, ...cambio };
    // Volver a dejarlo como estaba no es un cambio.
    setBorrador(hayCambiosDeSucursal(nuevo, s) ? nuevo : null);
  }

  async function guardar() {
    if (!borrador || !sinGuardar || conError) return;
    // Solo esta tarjeta suelta su borrador, y solo si de verdad se guardó.
    if (await onGuardar(s.id, borrador)) setBorrador(null);
  }

  return (
    <section aria-labelledby={id} className={cn("rounded border border-line p-4", inactivaSinVender && "bg-hover")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={id} className={cn("min-w-0 text-15 font-semibold", inactivaSinVender ? "text-ink-3" : "text-ink")}>{s.nombre}</h3>
        <Interruptor
          etiqueta="Vende en la tienda"
          encendido={valor.participa}
          deshabilitado={quieto || inactivaSinVender}
          onCambiar={(participa) => cambiar({ participa })}
          descripcion={s.activa ? undefined : "Sucursal inactiva"}
        />
      </div>

      {abierta && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4">
          <fieldset>
            <legend className="sr-only">Cómo entrega</legend>
            <label className={casilla}>
              <input
                type="checkbox"
                className="h-5 w-5 flex-shrink-0 accent-ink"
                checked={valor.recoger}
                disabled={quieto}
                onChange={(e) => cambiar({ recoger: e.target.checked })}
              />
              Para recoger
            </label>
            <label className={casilla}>
              <input
                type="checkbox"
                className="h-5 w-5 flex-shrink-0 accent-ink"
                checked={valor.domicilio}
                disabled={quieto}
                onChange={(e) => cambiar({ domicilio: e.target.checked })}
              />
              A domicilio
            </label>
            <p className={cn("pl-8 text-13", valor.domicilio && s.zonasActivas === 0 ? "font-medium text-warning" : "text-ink-2")}>
              {s.zonasActivas === 1 ? "1 zona de envío" : `${s.zonasActivas} zonas de envío`}
              {valor.domicilio && s.zonasActivas === 0 && ". Para domicilio necesita al menos una zona de envío."}{" "}
              <Link href="/configuracion/envios" className={enlace}>Administrar zonas</Link>
            </p>
            {errorModalidad && <p role="alert" className="mt-2 text-13 font-medium text-danger">{errorModalidad}</p>}
          </fieldset>

          <TiendaHorario
            valor={valor.horario}
            onCambiar={(horario) => cambiar({ horario })}
            deshabilitado={quieto}
            errores={erroresHorario}
          />
        </div>
      )}

      {(abierta || sinGuardar || mensaje) && (
        <div className={cn("flex flex-wrap items-center justify-end gap-x-4 gap-y-2", abierta ? "mt-4 border-t border-line pt-4" : "mt-3")}>
          {/* «Cambios guardados.» deja de ser cierto en cuanto se vuelve a editar; un error se queda. */}
          {(mensaje?.tipo === "error" || !sinGuardar) && <LineaMensaje mensaje={mensaje} />}
          {sinGuardar && !guardando && <p className="text-13 text-ink-2">Cambios sin guardar</p>}
          <Button onClick={() => void guardar()} disabled={quieto || !sinGuardar || conError}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      )}
    </section>
  );
}
