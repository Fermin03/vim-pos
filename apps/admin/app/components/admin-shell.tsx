"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { leerSesion } from "../lib/supabase";
import { cargarPerfil, iniciales, type Perfil } from "../lib/perfil";
import { salir } from "../lib/supabase";

const PerfilCtx = createContext<Perfil | null>(null);
export const usePerfil = () => useContext(PerfilCtx);

type Item = { label: string; href: string; minJerarquia: number; icon: ReactNode };
type Seccion = { titulo: string; items: Item[] };

const I = {
  panel: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  ),
  catalogo: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M3 7h18M3 12h18M3 17h18" /></svg>,
  inventario: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M20 7l-8-4-8 4 8 4 8-4zM4 7v10l8 4 8-4V7" /></svg>,
  clientes: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>,
  usuarios: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" /></svg>,
  config: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L16.5 3h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z" /></svg>,
  reportes: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-5 3 3 5-7" /></svg>,
};

const NAV: Seccion[] = [
  {
    titulo: "Operación",
    items: [
      { label: "Panel", href: "/dashboard", minJerarquia: 0, icon: I.panel },
      { label: "Catálogo", href: "/catalogo", minJerarquia: 4, icon: I.catalogo },
      { label: "Inventario", href: "/inventario", minJerarquia: 4, icon: I.inventario },
      { label: "Clientes", href: "/clientes", minJerarquia: 4, icon: I.clientes },
      { label: "Reservaciones", href: "/reservaciones", minJerarquia: 3, icon: I.clientes },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { label: "Usuarios", href: "/usuarios", minJerarquia: 4, icon: I.usuarios },
      { label: "Configuración", href: "/configuracion", minJerarquia: 4, icon: I.config },
      { label: "Reportes", href: "/reportes", minJerarquia: 3, icon: I.reportes },
    ],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await leerSesion();
      if (!s) {
        router.replace("/");
        return;
      }
      setPerfil(await cargarPerfil());
      setListo(true);
    })();
  }, [router]);

  if (!listo) {
    return (
      <main className="flex h-screen items-center justify-center">
        <p className="text-sm text-ink-3">Cargando…</p>
      </main>
    );
  }

  const jer = perfil?.jerarquia ?? 0;

  return (
    <PerfilCtx.Provider value={perfil}>
      <div className="flex h-screen">
        {/* ===== Sidebar ===== */}
        <aside className="flex w-[248px] flex-shrink-0 flex-col bg-ink text-[#C8C8CC]">
          <div className="flex h-16 flex-shrink-0 items-center gap-[11px] border-b border-[#2C2C32] px-5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <span className="font-display text-base font-bold leading-none tracking-tight text-ink">V</span>
              <span className="absolute bottom-1.5 right-[5px] h-[3.5px] w-[3.5px] rounded-full bg-accent" aria-hidden="true" />
            </div>
            <div className="font-display text-base font-bold tracking-tight text-white">VIM POS</div>
          </div>

          <div className="mx-3 mb-2 mt-4 flex items-center gap-2.5 rounded border border-[#2C2C32] bg-[#1E1E23] px-3 py-2.5">
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-[#2A2A30]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-white">León Centro</div>
              <div className="mt-px text-[11.5px] text-[#76767E]">1 de 1 sucursal</div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-px overflow-y-auto px-3 pb-4 pt-3">
            {NAV.map((sec) => {
              const items = sec.items.filter((it) => jer >= it.minJerarquia);
              if (items.length === 0) return null;
              return (
                <div key={sec.titulo} className="contents">
                  <div className="px-3 pb-2 pt-4 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#76767E] first:pt-2">
                    {sec.titulo}
                  </div>
                  {items.map((it) => {
                    const active = pathname === it.href || pathname.startsWith(it.href + "/");
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center gap-[11px] rounded px-3 py-[9px] text-sm font-medium transition-colors [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-current",
                          active
                            ? "bg-white font-semibold text-ink"
                            : "text-[#C8C8CC] hover:bg-[#1E1E23] hover:text-white",
                        ].join(" ")}
                      >
                        {it.icon}
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div className="flex flex-shrink-0 items-center gap-2.5 border-t border-[#2C2C32] p-3">
            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-[#2C2C32] bg-[#2A2A30] font-display text-[13px] font-semibold text-white">
              {iniciales(perfil?.nombre ?? "U")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-white">{perfil?.nombre}</div>
              <div className="text-[11.5px] text-[#76767E]">{perfil?.rolNombre}</div>
            </div>
            <button
              type="button"
              aria-label="Cerrar sesión"
              onClick={async () => {
                await salir();
                router.replace("/");
              }}
              className="text-[#76767E] transition-colors hover:text-white"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </aside>

        {/* ===== Main ===== */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg">{children}</div>
      </div>
    </PerfilCtx.Provider>
  );
}
