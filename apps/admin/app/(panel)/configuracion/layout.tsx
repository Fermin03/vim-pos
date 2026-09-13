"use client";
import { useEffect, useState } from "react";
import { ConfigSideNav } from "../../components/config-sidenav";
import { leerModulos } from "../../lib/modulos";

/**
 * Layout interno de Configuración.
 * Escritorio: sub-nav lateral + contenido (sin cambios).
 * Móvil: la sub-nav se convierte en una tira horizontal encima del contenido.
 *
 * El sidenav es puramente de presentación y no tiene sesión a la mano, así que este layout lee
 * los módulos del tenant una sola vez y le pasa `permitidoDelivery` por prop (ADR 0014): así
 * "Apps de delivery" solo existe en el menú cuando VIM le dio el add-on al cliente. Mientras
 * carga, o si el RPC falla, se asume que no está permitido — esconder de más es recuperable.
 */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const [permitidoDelivery, setPermitidoDelivery] = useState(false);

  useEffect(() => {
    leerModulos()
      .then((m) => setPermitidoDelivery(m.permitidos.delivery_apps === true))
      .catch(() => setPermitidoDelivery(false));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <ConfigSideNav permitidoDelivery={permitidoDelivery} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
