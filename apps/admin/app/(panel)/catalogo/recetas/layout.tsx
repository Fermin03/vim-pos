"use client";
import type { ReactNode } from "react";
import { SoloConInventario } from "../../../components/inventario-desde-negocio";

/** Las recetas son parte del inventario (0148): mismo trato que la sección Inventario. */
export default function RecetasLayout({ children }: { children: ReactNode }) {
  return <SoloConInventario enRecetas>{children}</SoloConInventario>;
}
