"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { ProductoForm } from "../../../../components/producto-form";
import { ComboSlotsEditor } from "../../../../components/combo-slots-editor";
import { ComboPreview } from "../../../../components/combo-preview";
import { useMenuCatalogo } from "../../../../components/selector-menu";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";

export default function EditarComboPage() {
  const params = useParams<{ id: string }>();
  // El menú que se está administrando: la vista previa cuenta con sus precios (ADR 0029).
  const menu = useMenuCatalogo();
  const [combo, setCombo] = useState<Producto | null | undefined>(undefined);
  // Sube cada vez que el editor de slots guarda algo; la vista previa lo usa para refrescarse.
  const [refreshToken, setRefreshToken] = useState(0);

  const cargar = useCallback(() => {
    obtenerProducto(params.id)
      .then(setCombo)
      .catch(() => setCombo(null));
  }, [params.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <PageHeader
        titulo={combo ? combo.nombre : "Editar combo"}
        migas={[{ label: "Catálogo" }, { label: "Combos", href: "/catalogo/combos" }, { label: combo ? combo.nombre : "Editar" }]}
      />
      <CatalogoTabs />
      <PageBody>
        {combo === undefined && <p className="text-sm text-ink-2">Cargando…</p>}
        {combo === null && <p className="text-sm text-danger">Combo no encontrado.</p>}
        {combo && !combo.es_combo && <p className="text-sm text-danger">Este producto no es un combo.</p>}
        {combo && combo.es_combo && (
          // El precio que pagará el cliente es lo esencial de esta pantalla: antes quedaba al
          // fondo, debajo de todo. En lg va fijo a la derecha; en el celular, tras los pasos.
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
            <div className="min-w-0">
              {/* alGuardar: se queda en esta pantalla en vez de navegar, y recarga el producto
                  para que el nombre y el precio base de la vista previa reflejen el cambio. */}
              <ProductoForm
                producto={combo}
                alGuardar={() => {
                  cargar();
                  // En un menú propio el precio guardado vive en el menú, no en el producto: se recalcula.
                  setRefreshToken((v) => v + 1);
                }}
                volverA="/catalogo/combos"
              />
              <ComboSlotsEditor comboId={combo.id} onCambio={() => setRefreshToken((v) => v + 1)} />
            </div>
            <aside className="mt-6 lg:sticky lg:top-0 lg:mt-0">
              {menu.error ? (
                <p className="rounded-lg border border-line bg-surface p-4 text-sm font-medium text-danger" role="alert">{menu.error}</p>
              ) : menu.listo ? (
                <ComboPreview
                  comboId={combo.id}
                  base={combo.precio_base_mxn}
                  refreshToken={refreshToken}
                  menu={menu.visible ? { id: menu.id, nombre: menu.nombre, esGeneral: menu.esGeneral } : null}
                />
              ) : (
                <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">Calculando el precio…</p>
              )}
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
