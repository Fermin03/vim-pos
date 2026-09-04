"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Categorías", href: "/catalogo/categorias" },
  { label: "Productos", href: "/catalogo/productos" },
  { label: "Modificadores", href: "/catalogo/modificadores" },
  { label: "Recetas", href: "/catalogo/recetas" },
];

/** Sub-navegación del módulo Catálogo. */
export function CatalogoTabs() {
  const pathname = usePathname();
  return (
    <div className="scroll-x-limpio flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-4 lg:overflow-x-visible lg:px-8">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px flex min-h-[44px] flex-shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors lg:min-h-0 lg:block lg:py-2.5",
              active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
