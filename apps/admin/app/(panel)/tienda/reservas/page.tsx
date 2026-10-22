"use client";
import { useModulos } from "../../../components/admin-shell";
import { ReservasEnLinea } from "../../../components/reservas-en-linea";
import { TiendaSinContratar } from "../../../components/tienda-sin-contratar";
import { TiendaMarco } from "../marco";

/**
 * Pestaña Reservas (belleza, entrega 3). Sin el complemento, la misma invitación que la tienda: hoy
 * el permiso de reservas ES el add-on TIENDA y el layout ya la enseña, pero si algún día se separan,
 * aquí no se enseña lo que no se contrató. Si la lectura de módulos falló, se enseña: la base decide.
 */
export default function TiendaReservasPage() {
  const m = useModulos();
  if (m !== null && m !== "error" && m.permitidos.reservas !== true) return <TiendaSinContratar />;
  return (
    <TiendaMarco>
      {({ t, soloLectura }) => t.leido && <ReservasEnLinea direccion={t.leido.config?.direccion ?? null} soloLectura={soloLectura} />}
    </TiendaMarco>
  );
}
