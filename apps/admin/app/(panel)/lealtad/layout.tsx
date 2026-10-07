"use client";
import type { ReactNode } from "react";
import { PageBody } from "../../components/page-header";
import { useModulos } from "../../components/admin-shell";
import { LealtadSinContratar } from "../../components/lealtad-sin-contratar";
import { estadoLealtad } from "../../lib/lealtad-plan";

/**
 * La sección Lealtad se guía por lo PERMITIDO (lo que VIM concedió), no por lo efectivo: aquí
 * adentro está el interruptor con el que el dueño la enciende. Sin el permiso, se explica cómo pedirlo.
 */
export default function LealtadLayout({ children }: { children: ReactNode }) {
  const estado = estadoLealtad(useModulos());
  if (estado === "cargando") return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (estado === "sin_contratar") return <LealtadSinContratar />;
  return <>{children}</>;
}
