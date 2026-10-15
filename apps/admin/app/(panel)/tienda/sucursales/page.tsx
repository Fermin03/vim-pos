"use client";
import { TiendaSucursales } from "../../../components/tienda-sucursales";
import { TiendaMarco } from "../marco";

/** Pestaña Sucursales y horarios: qué sucursales reciben pedidos y en qué horario. */
export default function TiendaSucursalesPage() {
  return (
    <TiendaMarco>
      {({ t, ocupado, soloLectura }) => t.leido && (
        <TiendaSucursales
          sucursales={t.leido.sucursales}
          guardando={t.sucursalGuardando}
          ocupado={ocupado}
          soloLectura={soloLectura}
          mensajeDe={t.mensajeDeSucursal}
          onGuardar={t.guardarSucursal}
          envio={{ guardando: t.envioGuardando, mensajeDe: t.mensajeDeEnvio, onGuardar: t.guardarEnvio }}
        />
      )}
    </TiendaMarco>
  );
}
