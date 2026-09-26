"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoVim } from "@vim/ui/styles";
import { useSesion } from "../lib/sesion";

const NAV: { href: string; label: string }[] = [
  { href: "/atencion", label: "Atención" },
  { href: "/clientes", label: "Clientes" },
  { href: "/avisos", label: "Avisos" },
  { href: "/versiones", label: "Versiones" },
  { href: "/cfdi", label: "Facturación" },
  { href: "/errores", label: "Errores" },
  { href: "/bitacora", label: "Bitácora" },
];

/**
 * Contra qué base está el panel. En localhost lee una base de DESARROLLO, y sin esto no había forma
 * de distinguirla de producción: se podía "arreglar" un cliente en la base equivocada.
 */
export function InsigniaEntorno() {
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    const h = window.location.hostname;
    setLocal(h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost"));
  }, []);
  if (local === null) return null;
  return local ? (
    <span className="rounded bg-warning-soft px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-warning" title="En localhost el panel lee la base de desarrollo">
      Local
    </span>
  ) : (
    <span className="rounded bg-danger-soft px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-danger" title="Estás cambiando datos reales de clientes">
      Producción
    </span>
  );
}

/**
 * Se ve distinto al admin a propósito (docs/diseno/platform.md): leyenda "interno" bajo el
 * logotipo y sin el sidebar oscuro del cliente. El conteo de críticas acompaña a Atención
 * desde cualquier pantalla. Por debajo de lg es un cajón que se abre desde el Shell.
 */
export function BarraLateral({ abierto = false, onCerrar = () => {} }: { abierto?: boolean; onCerrar?: () => void }) {
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

  // Al navegar, el cajón se cierra solo.
  useEffect(() => { onCerrar(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc cierra el cajón.
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [abierto, onCerrar]);

  return (
    <>
      {/* Velo del cajón (solo bajo lg). */}
      <div
        aria-hidden="true"
        onClick={onCerrar}
        className={[
          "fixed inset-0 z-30 bg-ink/40 transition-opacity duration-200 ease-vim lg:hidden motion-reduce:transition-none",
          abierto ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[260px] flex-shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ease-vim motion-reduce:transition-none",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[220px] lg:translate-x-0",
          abierto ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center gap-2.5 px-5 py-4">
          <LogoVim className="h-8 w-8" />
          <div className="min-w-0 leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight">VIM Plataforma</div>
            <div className="mt-0.5"><InsigniaEntorno /></div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 pt-2" aria-label="Secciones del panel">
          {NAV.map((n) => {
            const activo = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={activo ? "page" : undefined}
                // Sin transición: se usa decenas de veces al día y un cambio de color animado deja estela.
                className={[
                  "flex min-h-[40px] items-center justify-between rounded px-3 py-2 text-[14px] font-semibold",
                  activo ? "bg-ink text-white" : "text-ink-2 hover:bg-hover",
                ].join(" ")}
              >
                <span>{n.label}</span>
                {n.href === "/atencion" && criticas > 0 && (
                  <span className={["rounded-full px-1.5 py-0.5 text-[12px] font-bold tabular-nums", activo ? "bg-white text-danger" : "bg-danger text-white"].join(" ")}>
                    {criticas}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 pb-4">
          <Link href="/clientes/nuevo" className="btn mb-2 flex h-10 items-center justify-center rounded border border-line-strong text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
            Nuevo cliente
          </Link>
          <button onClick={salir} className="btn h-10 w-full rounded text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink">
            Salir
          </button>
        </div>
      </aside>
    </>
  );
}
