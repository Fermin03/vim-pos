"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { ProductoForm } from "../../../../components/producto-form";
import { ProductoModificadores } from "../../../../components/producto-modificadores";
import { obtenerProducto, type Producto } from "../../../../lib/catalogo";

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const [prod, setProd] = useState<Producto | null | undefined>(undefined);

  useEffect(() => {
    obtenerProducto(params.id)
      .then(setProd)
      .catch(() => setProd(null));
  }, [params.id]);

  return (
    <>
      <PageHeader
        titulo={prod ? prod.nombre : "Editar producto"}
        migas={[
          { label: "Catálogo" },
          { label: "Productos", href: "/catalogo/productos" },
          { label: prod ? prod.nombre : "Editar" },
        ]}
        right={prod ? <Link className="text-sm font-medium text-accent underline-offset-2 hover:underline" href={`/catalogo/recetas/${prod.id}`}>Receta y costo</Link> : undefined}
      />
      <CatalogoTabs />
      <PageBody>
        {prod === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {prod === null && <p className="text-sm text-danger">Producto no encontrado.</p>}
        {prod && (
          <>
            <ProductoForm producto={prod} />
            <ProductoModificadores productoId={prod.id} />
          </>
        )}
      </PageBody>
    </>
  );
}
