"use client";
import { Cargando } from "@vim/ui/styles";
import type { ReactNode } from "react";
import { PageBody } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { TiendaSinContratar } from "../../components/tienda-sin-contratar";
import { estadoTienda } from "../../lib/tienda-plan";

/**
 * La sección Tienda en línea se guía por lo PERMITIDO (lo que VIM concedió), no por lo efectivo: aquí
 * adentro está el interruptor con el que el dueño la enciende. Sin el permiso, se explica cómo pedirlo.
 */
export default function TiendaLayout({ children }: { children: ReactNode }) {
  const estado = estadoTienda(useModulos());
  if (estado === "cargando") return <PageBody><Cargando /></PageBody>;
  if (estado === "sin_contratar") return <TiendaSinContratar />;
  return <>{children}</>;
}
