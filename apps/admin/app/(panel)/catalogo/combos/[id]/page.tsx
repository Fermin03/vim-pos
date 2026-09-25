"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { ProductoForm } from "../../../../components/producto-form";
import { ComboSlotsEditor } from "../../../../components/combo-slots-editor";
import { ComboPreview } from "../../../../components/combo-preview";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";

export default function EditarComboPage() {
  const params = useParams<{ id: string }>();
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
              <ProductoForm producto={combo} alGuardar={cargar} volverA="/catalogo/combos" />
              <ComboSlotsEditor comboId={combo.id} onCambio={() => setRefreshToken((v) => v + 1)} />
            </div>
            <aside className="mt-6 lg:sticky lg:top-0 lg:mt-0">
              <ComboPreview comboId={combo.id} base={combo.precio_base_mxn} refreshToken={refreshToken} />
            </aside>
          </div>
        )}
      </PageBody>
    </>
  );
}
