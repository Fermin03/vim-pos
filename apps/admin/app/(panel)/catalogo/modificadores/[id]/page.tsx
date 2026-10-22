"use client";
import { Cargando } from "@vim/ui/styles";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, PageBody } from "../../../../components/page-header";
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
      <PageBody>
        {grupo === undefined && <Cargando />}
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
