"use client";
import type { ReactNode } from "react";
import { PageBody, PageHeader } from "./page-header";
import { CatalogoTabs } from "./catalogo-tabs";
import { PedirModulo } from "./pedir-modulo";
import { useModulos } from "./admin-shell";
import { estadoInventario, INVENTARIO_INCLUYE, mensajeQuieroInventario } from "../lib/inventario-plan";

/** Lo que ve en Inventario (y en Recetas) un negocio cuyo plan no lo incluye (0148, ADR 0025). */
export function InventarioDesdeNegocio({ enRecetas = false }: { /** Desde Catálogo → Recetas: conserva su encabezado y sus pestañas. */ enRecetas?: boolean }) {
  return (
    <>
      {enRecetas ? (
        <>
          <PageHeader titulo="Recetas y costos" subtitulo="Qué insumos lleva cada producto y cuánto te cuesta." migas={[{ label: "Catálogo" }, { label: "Recetas" }]} />
          <CatalogoTabs />
        </>
      ) : (
        <PageHeader titulo="Inventario" subtitulo="Insumos, recetas, compras y mermas." />
      )}
      <PageBody>
        <PedirModulo
          titulo="El inventario viene desde el plan Negocio"
          texto="Tu plan cubre la caja, la cocina, tus mesas y tus reportes. Con el plan Negocio, además, VIM POS lleva la cuenta de lo que hay en tu bodega y de lo que te cuesta cada platillo."
          incluye={INVENTARIO_INCLUYE}
          cierre="Si te interesa, escríbenos y hacemos el cambio contigo. Lo que ya tienes capturado no se pierde."
          boton="Preguntar por el plan Negocio"
          mensaje={mensajeQuieroInventario}
        />
      </PageBody>
    </>
  );
}

/**
 * Envuelve las pantallas de inventario: con el módulo, las enseña; sin él, la explicación.
 * Mientras se lee, nada (un parpadeo de "Cargando…" es mejor que enseñar la pantalla equivocada).
 */
export function SoloConInventario({ children, enRecetas = false }: { children: ReactNode; enRecetas?: boolean }) {
  const estado = estadoInventario(useModulos());
  if (estado === "cargando") return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  if (estado === "no_incluido") return <InventarioDesdeNegocio enRecetas={enRecetas} />;
  return <>{children}</>;
}
