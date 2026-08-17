import { ConfigSideNav } from "../../components/config-sidenav";

/**
 * Layout interno de Configuración.
 * Escritorio: sub-nav lateral + contenido (sin cambios).
 * Móvil: la sub-nav se convierte en una tira horizontal encima del contenido.
 */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <ConfigSideNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
