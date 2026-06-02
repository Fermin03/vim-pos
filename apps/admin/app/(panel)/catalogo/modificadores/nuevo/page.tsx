"use client";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { GrupoForm } from "../../../../components/grupo-form";

export default function NuevoGrupoPage() {
  return (
    <>
      <PageHeader
        titulo="Nuevo grupo de modificadores"
        migas={[{ label: "Catálogo" }, { label: "Modificadores", href: "/catalogo/modificadores" }, { label: "Nuevo" }]}
      />
      <CatalogoTabs />
      <PageBody>
        <GrupoForm grupo={null} />
      </PageBody>
    </>
  );
}
