"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, PageBody } from "../../../../components/page-header";
import { CatalogoTabs } from "../../../../components/catalogo-tabs";
import { GrupoForm } from "../../../../components/grupo-form";
import { OpcionesEditor } from "../../../../components/opciones-editor";
import { AsignacionMasivaGrupo } from "../../../../components/asignacion-masiva-grupo";
import { obtenerGrupo, type Grupo } from "../../../../lib/modificadores";

export default function EditarGrupoPage() {
  const params = useParams<{ id: string }>();
  const [grupo, setGrupo] = useState<Grupo | null | undefined>(undefined);

  useEffect(() => {
    obtenerGrupo(params.id)
      .then(setGrupo)
      .catch(() => setGrupo(null));
  }, [params.id]);

  return (
    <>
      <PageHeader
        titulo={grupo ? grupo.nombre : "Editar grupo"}
        migas={[
          { label: "Catálogo" },
          { label: "Modificadores", href: "/catalogo/modificadores" },
          { label: grupo ? grupo.nombre : "Editar" },
        ]}
      />
      <CatalogoTabs />
      <PageBody>
        {grupo === undefined && <p className="text-sm text-ink-3">Cargando…</p>}
        {grupo === null && <p className="text-sm text-danger">Grupo no encontrado.</p>}
        {grupo && (
          <>
            <GrupoForm grupo={grupo} />
            <OpcionesEditor grupoId={grupo.id} />
            <AsignacionMasivaGrupo grupoId={grupo.id} grupoNombre={grupo.nombre} />
          </>
        )}
      </PageBody>
    </>
  );
}
