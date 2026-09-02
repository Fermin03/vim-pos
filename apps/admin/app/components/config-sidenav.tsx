"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { titulo: "Negocio", items: [
    { label: "Datos del negocio", href: "/configuracion/negocio" },
    { label: "Datos fiscales", href: "/configuracion/fiscal" },
    { label: "CFDI / PAC", href: "/configuracion/cfdi" },
  ]},
  { titulo: "Operación", items: [
    { label: "Sucursales", href: "/configuracion/sucursales" },
    { label: "Cajas", href: "/configuracion/cajas" },
    { label: "Mesas", href: "/configuracion/mesas" },
    { label: "Estaciones de preparación", href: "/configuracion/areas" },
    { label: "Propinas", href: "/configuracion/propinas" },
    { label: "Marcas virtuales", href: "/configuracion/marcas" },
    { label: "Apps de delivery", href: "/configuracion/integraciones" },
    { label: "Franquicias", href: "/configuracion/franquicias" },
    { label: "Roles y permisos", href: "/configuracion/roles" },
  ]},
  { titulo: "Cuenta", items: [
    { label: "Seguridad", href: "/configuracion/seguridad" },
    { label: "Sincronización", href: "/configuracion/sincronizacion" },
    { label: "Notificaciones", href: "/configuracion/notificaciones" },
  ]},
];

const TODOS = SECCIONES.flatMap((s) => s.items);

/**
 * Sub-navegación del módulo Configuración (mockups P-162+).
 * Escritorio (`lg+`): columna lateral, idéntica al mockup.
 * Móvil: tira horizontal deslizable debajo del encabezado.
 */
export function ConfigSideNav() {
  const pathname = usePathname();
  return (
    <>
      {/* --- Móvil: tira horizontal --- */}
      <nav
        aria-label="Secciones de configuración"
        className="scroll-x-limpio -mx-px flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2.5 lg:hidden"
      >
        {TODOS.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-[36px] flex-shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                active ? "bg-ink text-white" : "bg-hover text-ink-2",
              ].join(" ")}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* --- Escritorio: columna lateral (sin cambios) --- */}
      <DesktopSideNav pathname={pathname} />
    </>
  );
}

function DesktopSideNav({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden w-[220px] flex-shrink-0 flex-col gap-4 border-r border-line bg-surface px-4 py-6 lg:flex">
      {SECCIONES.map((sec) => (
        <div key={sec.titulo}>
          <div className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">{sec.titulo}</div>
          <div className="flex flex-col gap-px">
            {sec.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-ink text-white" : "text-ink-2 hover:bg-hover hover:text-ink",
                  ].join(" ")}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

