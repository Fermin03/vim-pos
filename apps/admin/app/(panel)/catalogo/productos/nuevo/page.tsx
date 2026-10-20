"use client";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { ProductoForm } from "../../../../components/producto-form";

export default function NuevoProductoPage() {
  return (
    <>
      <PageHeader
        titulo="Nuevo producto"
        migas={[{ label: "Catálogo" }, { label: "Productos", href: "/catalogo/productos" }, { label: "Nuevo" }]}
      />
      <PageBody>
        <ProductoForm producto={null} />
      </PageBody>
    </>
  );
}
