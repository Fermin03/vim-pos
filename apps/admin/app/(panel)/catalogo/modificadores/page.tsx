"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DialogoPeligro, Icono } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { FranjaMenus, useMenuCatalogo } from "../../../components/selector-menu";
import { TIPO_SELECCION, eliminarGrupo, listarGrupos, type Grupo } from "../../../lib/modificadores";
import { mensajeError } from "../../../lib/errores";

export default function ModificadoresPage() {
  const menu = useMenuCatalogo();
  const router = useRouter();
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<Grupo | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setGrupos(await listarGrupos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los grupos"));
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarGrupo(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar"));
      setBorrando(false);
    }
  }

  const sinNada = grupos !== null && grupos.length === 0;

  return (
    <>
      <PageHeader
        titulo="Modificadores"
        subtitulo="Grupos reutilizables de opciones (términos, extras, sin ingredientes)."
        migas={[{ label: "Catálogo" }, { label: "Modificadores" }]}
        right={
          <Button onClick={() => router.push("/catalogo/modificadores/nuevo")}>
            <Icono nombre="mas" className="h-[17px] w-[17px]" />
            Nuevo grupo
          </Button>
        }
      />
      <FranjaMenus menu={menu} nota={menu.esGeneral ? undefined : "Los modificadores son los mismos en todos los menús."} />
      <PageBody>
        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        {grupos === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {grupos !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Grupo</th>
                  <th className="w-[230px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Selección</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Opciones</th>
                  <th className="w-[110px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.id} className="group cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => router.push(`/catalogo/modificadores/${g.id}`)}>
                    <td className="px-4 py-3.5">
                      <div className="text-15 font-semibold">{g.nombre}</div>
                      {g.descripcion && <div className="mt-px text-13 text-ink-3">{g.descripcion}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-14 text-ink-2">
                      {TIPO_SELECCION[g.tipo_seleccion]}
                      {g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.minimo_selecciones !== null && (
                        <span className="text-ink-3"> ({g.minimo_selecciones}–{g.maximo_selecciones})</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-display text-15 font-semibold tabular-nums">{g.nOpciones}</span>{" "}
                      <span className="text-xs text-ink-3">opciones</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-13 font-semibold", g.activo ? "bg-success-soft text-success" : "bg-hover text-ink-3"].join(" ")}>
                        <span className={["h-1.5 w-1.5 rounded-full", g.activo ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {g.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1">
                        <button type="button" title="Editar" aria-label={`Editar ${g.nombre}`} onClick={() => router.push(`/catalogo/modificadores/${g.id}`)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                          <Icono nombre="editar" className="h-4 w-4" />
                        </button>
                        <button type="button" title="Eliminar" aria-label={`Eliminar ${g.nombre}`} onClick={() => setBorrar(g)} className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-danger-line hover:text-danger">
                          <Icono nombre="eliminar" className="h-4 w-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {grupos.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay grupos de modificadores</p>
                <p className="max-w-sm text-sm text-ink-2">
                  Crea un grupo (ej. “Término de cocción”, “Extras”, “Sin ingredientes”) y agrégale opciones.
                </p>
                <Button onClick={() => router.push("/catalogo/modificadores/nuevo")}>Crear el primer grupo</Button>
              </div>
            )}
          </div>
        )}

        {grupos !== null && grupos.length > 0 && (
          <p className="mt-4 text-13 text-ink-3">
            <b className="text-ink-2">{grupos.length}</b> grupo(s)
          </p>
        )}
      </PageBody>

      {borrar && (
        <DialogoPeligro
          error={error}
          titulo="¿Eliminar este grupo?"
          consecuencia={
            <>
              <b className="text-ink">{borrar.nombre}</b> se quitará de los productos que lo usen.
            </>
          }
          boton="Eliminar"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => setBorrar(null)}
        />
      )}
    </>
  );
}
