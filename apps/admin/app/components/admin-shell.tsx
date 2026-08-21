"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { leerSesion } from "../lib/supabase";
import { cargarPerfil, iniciales, type Perfil } from "../lib/perfil";
import { salir } from "../lib/supabase";
import { listarSucursales } from "../lib/configuracion";
import { puedeVer } from "../lib/acceso";

const PerfilCtx = createContext<Perfil | null>(null);
export const usePerfil = () => useContext(PerfilCtx);

type Item = { label: string; href: string; icon: ReactNode };
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
      { label: "Panel", href: "/dashboard", icon: I.panel },
      { label: "Catálogo", href: "/catalogo", icon: I.catalogo },
      { label: "Promociones", href: "/promociones", icon: I.catalogo },
      { label: "Inventario", href: "/inventario", icon: I.inventario },
      { label: "Clientes", href: "/clientes", icon: I.clientes },
      { label: "Reservaciones", href: "/reservaciones", icon: I.clientes },
      { label: "Conciliación apps", href: "/conciliacion", icon: I.reportes },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { label: "Usuarios", href: "/usuarios", icon: I.usuarios },
      { label: "Facturación", href: "/facturacion", icon: I.reportes },
      { label: "Configuración", href: "/configuracion", icon: I.config },
      { label: "Reportes", href: "/reportes", icon: I.reportes },
    ],
  },
];

/** Lo que ve quien llega a una sección que su rol no alcanza. */
function SinAcceso({ rol }: { rol: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F6EEDD] text-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
          <rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h1 className="font-display text-[19px] font-semibold tracking-tight">Esta sección no está disponible para ti</h1>
      <p className="max-w-sm text-[13.5px] leading-snug text-ink-2">
        Tu cuenta tiene el rol <b>{rol}</b>. Si necesitas entrar aquí, pídele al dueño del negocio
        que ajuste tus permisos.
      </p>
      <Link href="/dashboard" className="mt-2 inline-flex h-10 items-center rounded border border-line-strong px-4 text-[13.5px] font-semibold text-ink-2 transition hover:border-ink hover:text-ink">
        Ir al panel
      </Link>
    </main>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [listo, setListo] = useState(false);
  const [sinAcceso, setSinAcceso] = useState<string | null>(null);
  const [sucursales, setSucursales] = useState<{ nombre: string; total: number } | null>(null);
  // Cajón lateral: solo existe por debajo de `lg`. En escritorio el <aside> es estático.
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Navegar cierra el cajón (si no, queda tapando la pantalla nueva).
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Bloquea el scroll del documento y permite cerrar con Esc mientras el cajón está abierto.
  useEffect(() => {
    if (!menuAbierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuAbierto(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuAbierto]);

  useEffect(() => {
    (async () => {
      const s = await leerSesion();
      if (!s) {
        router.replace("/");
        return;
      }
      // Fase 4 (SSO): sesión válida pero SIN tenant = correo no invitado a ningún negocio.
      if (!s.tenantId) {
        setSinAcceso(s.email);
        setListo(true);
        return;
      }
      setPerfil(await cargarPerfil());
      setListo(true);
      // El selector del sidebar muestra la sucursal real del tenant (antes decía "León Centro"
      // fijo, que es el dato del mockup: cualquier cliente nuevo veía el nombre equivocado).
      listarSucursales()
        .then((subs) => {
          const activas = subs.filter((x) => x.activa);
          const lista = activas.length > 0 ? activas : subs;
          if (lista.length > 0) setSucursales({ nombre: lista[0]!.nombre, total: lista.length });
        })
        .catch(() => {});
    })();
  }, [router]);

  if (listo && sinAcceso) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F6EEDD] text-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        </div>
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Tu correo no tiene acceso todavía</h1>
        <p className="max-w-md text-[14px] leading-relaxed text-ink-3">
          Entraste como <b className="text-ink-2">{sinAcceso}</b>, pero ese correo no está invitado a ningún negocio en VIM POS.
          Pide al dueño que te invite desde su panel (Usuarios) con este mismo correo, o crea tu negocio.
        </p>
        <div className="mt-2 flex gap-2">
          <a href="/registro" className="rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-95">Crear mi negocio</a>
          <button type="button" onClick={async () => { const { supabase } = await import("../lib/supabase"); await supabase.auth.signOut(); router.replace("/"); }}
            className="rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-semibold text-ink-2 transition hover:border-ink">
            Salir
          </button>
        </div>
      </main>
    );
  }

  if (!listo) {
    return (
      <main className="flex h-[100dvh] items-center justify-center">
        <p className="text-sm text-ink-3">Cargando…</p>
      </main>
    );
  }

  const jer = perfil?.jerarquia ?? 0;

  return (
    <PerfilCtx.Provider value={perfil}>
      <div className="flex h-[100dvh] lg:h-screen">
        {/* Velo del cajón (solo móvil/tablet). */}
        <div
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
          className={[
            "fixed inset-0 z-40 bg-ink/50 transition-opacity duration-200 lg:hidden",
            menuAbierto ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
        />

        {/* ===== Sidebar (cajón deslizable por debajo de lg, estático en escritorio) ===== */}
        <aside
          id="menu-lateral"
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] flex-shrink-0 flex-col bg-ink text-[#C8C8CC]",
            "transition-transform duration-200 ease-out",
            menuAbierto ? "translate-x-0" : "-translate-x-full",
            "lg:static lg:z-auto lg:w-[248px] lg:translate-x-0 lg:transition-none",
          ].join(" ")}
        >
          <div className="flex h-14 flex-shrink-0 items-center gap-[11px] border-b border-[#2C2C32] px-5 lg:h-16">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white">
              <span className="font-display text-base font-bold leading-none tracking-tight text-ink">V</span>
              <span className="absolute bottom-1.5 right-[5px] h-[3.5px] w-[3.5px] rounded-full bg-accent" aria-hidden="true" />
            </div>
            <div className="font-display text-base font-bold tracking-tight text-white">VIM POS</div>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenuAbierto(false)}
              className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded text-[#76767E] transition-colors hover:text-white lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="mx-3 mb-2 mt-4 flex items-center gap-2.5 rounded border border-[#2C2C32] bg-[#1E1E23] px-3 py-2.5">
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-[#2A2A30]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-white">{sucursales?.nombre ?? "—"}</div>
              <div className="mt-px text-[11.5px] text-[#76767E]">
                {sucursales ? `1 de ${sucursales.total} ${sucursales.total === 1 ? "sucursal" : "sucursales"}` : "Cargando…"}
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-px overflow-y-auto px-3 pb-4 pt-3">
            {NAV.map((sec) => {
              const items = sec.items.filter((it) => puedeVer(jer, it.href));
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
                          "flex min-h-[44px] items-center gap-[11px] rounded px-3 py-[9px] text-sm font-medium transition-colors lg:min-h-0 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:flex-shrink-0 [&_svg]:stroke-current",
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

          <div className="flex flex-shrink-0 items-center gap-2.5 border-t border-[#2C2C32] p-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:pb-3">
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
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-[#76767E] transition-colors hover:text-white lg:h-auto lg:w-auto"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
          </div>
        </aside>

        {/* ===== Main ===== */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg">
          {/* Barra superior móvil: abre el cajón. Oculta en escritorio (el sidebar ya está visible). */}
          <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[#2C2C32] bg-ink px-2 pr-4 lg:hidden">
            <button
              type="button"
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              aria-controls="menu-lateral"
              onClick={() => setMenuAbierto(true)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-white transition-colors hover:bg-[#1E1E23]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px]"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white">
              <span className="font-display text-[13px] font-bold leading-none tracking-tight text-ink">V</span>
              <span className="absolute bottom-1 right-1 h-[3px] w-[3px] rounded-full bg-accent" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[14px] font-bold leading-tight tracking-tight text-white">VIM POS</div>
              <div className="truncate text-[11.5px] leading-tight text-[#76767E]">{sucursales?.nombre ?? "—"}</div>
            </div>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#2C2C32] bg-[#2A2A30] font-display text-[12px] font-semibold text-white">
              {iniciales(perfil?.nombre ?? "U")}
            </div>
          </header>
          {/* Guardián de rutas. El menú ya oculta lo que no corresponde al rol, pero ocultar un
              enlace no impide teclear la dirección: sin esto, un cajero llegaba a la configuración
              fiscal o al reporte Z escribiéndolos en la barra. Usa la MISMA tabla que el menú.

              Mientras el perfil carga no se bloquea nada: hacerlo mostraría un "sin acceso" de un
              parpadeo a todo el mundo, y enseñar a ignorar ese aviso es peor que no tenerlo. */}
          {perfil && !puedeVer(jer, pathname) ? <SinAcceso rol={perfil.rolNombre} /> : children}
        </div>
      </div>
    </PerfilCtx.Provider>
  );
}
