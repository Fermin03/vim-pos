"use client";
import type { ReactNode } from "react";
import { SoloConInventario } from "../../components/inventario-desde-negocio";

/**
 * Toda la sección Inventario (insumos, compras, proveedores, movimientos) es del plan Negocio
 * (0148, ADR 0025). Sin el módulo se enseña la explicación en lugar de las pantallas; el candado de
 * verdad está en la base, que rechaza cualquier escritura.
 */
export default function InventarioLayout({ children }: { children: ReactNode }) {
  return <SoloConInventario>{children}</SoloConInventario>;
}
