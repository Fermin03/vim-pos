"use client";
import { useState, type ReactNode } from "react";
import { LogoVim } from "@vim/ui/styles";
import { SesionProvider } from "../lib/sesion";
import { BarraLateral, InsigniaEntorno } from "./barra-lateral";

/**
 * Por debajo de lg la barra lateral es un cajón: fija de 220 px y con `px-8`, a 375 px dejaba unos
 * 90 px útiles, y las llamadas de las 11 de la noche se atienden con el teléfono (revisión de
 * diseño, sep 2026).
 */
export function Shell({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <SesionProvider>
      <div className="flex min-h-screen bg-bg">
        <BarraLateral abierto={menu} onCerrar={() => setMenu(false)} />
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label="Abrir el menú"
              aria-expanded={menu}
              className="btn flex h-11 w-11 items-center justify-center rounded border border-line-strong bg-surface"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <LogoVim className="h-7 w-7" />
            <span className="font-display text-[15px] font-bold tracking-tight">VIM Plataforma</span>
            <span className="ml-auto"><InsigniaEntorno /></span>
          </div>
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>
    </SesionProvider>
  );
}
