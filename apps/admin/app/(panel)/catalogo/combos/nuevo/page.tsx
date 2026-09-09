"use client";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { ComboForm } from "../../../../components/combo-form";

export default function NuevoComboPage() {
  return (
    <>
      <PageHeader titulo="Nuevo combo" migas={[{ label: "Catálogo" }, { label: "Combos", href: "/catalogo/combos" }, { label: "Nuevo" }]} />
      <CatalogoTabs />
      <PageBody>
        <ComboForm />
      </PageBody>
    </>
  );
}
