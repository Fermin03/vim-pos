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
    { label: "Propinas", href: "/configuracion/propinas" },
    { label: "Marcas virtuales", href: "/configuracion/marcas" },
  ]},
  { titulo: "Cuenta", items: [
    { label: "Seguridad", href: "/configuracion/seguridad" },
    { label: "Sincronización", href: "/configuracion/sincronizacion" },
    { label: "Notificaciones", href: "/configuracion/notificaciones" },
  ]},
];

/** Sub-navegación lateral del módulo Configuración (mockups P-162+). */
export function ConfigSideNav() {
  const pathname = usePathname();
  return (
    <aside className="flex w-[220px] flex-shrink-0 flex-col gap-4 border-r border-line bg-surface px-4 py-6">
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
