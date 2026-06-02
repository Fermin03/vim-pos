"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Categorías", href: "/catalogo/categorias" },
  { label: "Productos", href: "/catalogo/productos" },
];

/** Sub-navegación del módulo Catálogo. */
export function CatalogoTabs() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-line px-8">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
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
