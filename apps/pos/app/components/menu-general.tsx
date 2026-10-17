"use client";
import { LogoVim, Icono } from "@vim/ui/styles";
import type { ComponentProps } from "react";
import { ContenidoMenu } from "./contenido-menu";

/**
 * Menú de pantalla completa del POS.
 *
 * Vivía dentro del topbar de la pantalla de venta, así que desde el inicio no había forma de
 * abrirlo: su botón "Menú" solo cambiaba de pantalla y no pasaba nada visible. Extraído aquí
 * para que ambas pantallas abran EL MISMO menú. Sus opciones viven en `ContenidoMenu`, que la
 * caja de tienda pinta en su sección «Configuración».
 */
export function MenuGeneral({
  onCerrar,
  ...opciones
}: { onCerrar: () => void } & Omit<ComponentProps<typeof ContenidoMenu>, "alElegir" | "enPagina">) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="flex h-[68px] flex-shrink-0 items-center justify-between border-b border-line px-8">
        <div className="flex items-center gap-3">
          <LogoVim className="h-[34px] w-[34px]" />
          <span className="font-display text-18 font-semibold tracking-tight">Menú</span>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar menú"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-2 transition hover:border-ink hover:text-ink"
        >
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-10">
        <ContenidoMenu alElegir={onCerrar} {...opciones} />
      </div>
    </div>
  );
}
