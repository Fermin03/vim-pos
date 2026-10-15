"use client";
import { ConfigSideNav } from "../../components/config-sidenav";
import { useModulos } from "../../components/admin-shell";
import { rutasOcultas } from "../../lib/operacion";

/**
 * Layout interno de Configuración. Esconde lo que este negocio no usa (ADR 0034) y "Apps de
 * delivery" mientras VIM no le conceda el add-on (ADR 0014). Mientras carga, delivery se esconde
 * (esconder de más es recuperable) y lo de operación se enseña (lo de siempre).
 */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const m = useModulos();
  const ocultas = new Set(rutasOcultas(m));
  const permitidoDelivery = m !== null && m !== "error" && m.permitidos.delivery_apps === true;
  if (!permitidoDelivery) ocultas.add("/configuracion/integraciones");
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <ConfigSideNav ocultas={ocultas} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
