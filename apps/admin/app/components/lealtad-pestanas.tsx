"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { label: "Programa", href: "/lealtad" },
  { label: "Premios", href: "/lealtad/premios" },
  { label: "Movimientos", href: "/lealtad/movimientos" },
];

/** Las tres pestañas de la sección Lealtad. Mismo control segmentado que el filtro de Promociones. */
export function LealtadPestanas() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de lealtad" className="mb-5 inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
      {PESTANAS.map((p) => {
        const activa = ruta === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={[
              "rounded-[4px] px-3 py-1.5 text-13 font-semibold transition",
              activa ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
            ].join(" ")}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
