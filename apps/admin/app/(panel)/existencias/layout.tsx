"use client";
import type { ReactNode } from "react";
import { useModulos } from "../../components/admin-shell";
import { PageBody, PageHeader } from "../../components/page-header";
import { conExistencias } from "../../lib/operacion";

/**
 * Toda la sección es del giro tienda (módulo `existencias`). Un restaurante no la ve en el menú; si
 * entra por enlace directo, lee lo mismo que en Etiquetas e Importar tienda. El candado de verdad
 * está en la base (`_existencias_puede_escribir`).
 */
export default function ExistenciasLayout({ children }: { children: ReactNode }) {
  const modulos = useModulos();
  if (modulos === null) return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (!conExistencias(modulos)) {
    return (
      <>
        <PageHeader titulo="Existencias" />
        <PageBody><p className="text-sm text-ink-2">Esta sección es para tiendas.</p></PageBody>
      </>
    );
  }
  return <>{children}</>;
}
