import { ConfigSideNav } from "../../components/config-sidenav";

/** Layout interno de Configuración: sub-nav lateral + contenido. */
export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <ConfigSideNav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
