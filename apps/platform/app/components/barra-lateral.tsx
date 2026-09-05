"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoVim } from "@vim/ui/styles";
import { useSesion } from "../lib/sesion";

const NAV: { href: string; label: string }[] = [
  { href: "/atencion", label: "Atención" },
  { href: "/clientes", label: "Clientes" },
  { href: "/cfdi", label: "Facturación" },
  { href: "/errores", label: "Errores" },
  { href: "/bitacora", label: "Bitácora" },
];

/**
 * Se ve distinto al admin a propósito (docs/diseno/platform.md): leyenda "interno" bajo el
 * logotipo y sin el sidebar oscuro del cliente. El conteo de críticas acompaña a Atención
 * desde cualquier pantalla: un pendiente que solo se ve en su pestaña se pospone.
 */
export function BarraLateral() {
  const path = usePathname();
  const { api, salir } = useSesion();
  const [criticas, setCriticas] = useState<number>(0);

  useEffect(() => {
    let vivo = true;
    const carga = () =>
      api("/api/alertas")
        .then((r) => { if (vivo) setCriticas(Number((r.resumen as { critica?: number } | undefined)?.critica ?? 0)); })
        .catch(() => {});
    carga();
    const id = setInterval(carga, 60_000);
    return () => { vivo = false; clearInterval(id); };
  }, [api]);

  return (
    <aside className="sticky top-0 flex h-screen w-[220px] flex-shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <LogoVim className="h-8 w-8" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight">VIM Plataforma</div>
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-3">Panel interno</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 pt-2">
        {NAV.map((n) => {
          const activo = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              className={[
                "flex items-center justify-between rounded px-3 py-2 text-[13.5px] font-semibold transition-colors duration-150",
                activo ? "bg-ink text-white" : "text-ink-2 hover:bg-hover",
              ].join(" ")}
            >
              <span>{n.label}</span>
              {n.href === "/atencion" && criticas > 0 && (
                <span className={["rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums", activo ? "bg-white text-danger" : "bg-danger text-white"].join(" ")}>
                  {criticas}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pb-4">
        <Link href="/clientes/nuevo" className="btn mb-2 flex h-9 items-center justify-center rounded border border-line-strong text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
          Nuevo cliente
        </Link>
        <button onClick={salir} className="btn h-8 w-full rounded text-[12.5px] font-medium text-ink-3 hover:bg-hover hover:text-ink">
          Salir
        </button>
      </div>
    </aside>
  );
}
