"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export type Pestana = { label: string; href: string };

/** Sub-menú de una sección: un enlace por ruta, en el mismo control segmentado que el filtro de Promociones. */
export function Pestanas({ etiqueta, pestanas }: { etiqueta: string; pestanas: Pestana[] }) {
  const ruta = usePathname();
  const nav = useRef<HTMLElement>(null);
  // En celular no caben todas: la activa se recorre a la vista.
  useEffect(() => { nav.current?.querySelector('[aria-current]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [ruta]);
  return (
    <nav ref={nav} aria-label={etiqueta} className="mb-5 inline-flex max-w-full gap-0.5 overflow-x-auto [scrollbar-width:none] rounded border border-line bg-hover p-[3px]">
      {pestanas.map((p) => {
        const activa = ruta === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? "page" : undefined}
            className={[
              "shrink-0 whitespace-nowrap rounded-[4px] px-3 py-1.5 text-13 font-semibold transition",
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
