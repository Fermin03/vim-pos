"use client";
import type { ReactNode } from "react";
import { SesionProvider } from "../lib/sesion";
import { BarraLateral } from "./barra-lateral";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <SesionProvider>
      <div className="flex min-h-screen bg-bg">
        <BarraLateral />
        <main className="min-w-0 flex-1 px-8 py-7">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>
    </SesionProvider>
  );
}
