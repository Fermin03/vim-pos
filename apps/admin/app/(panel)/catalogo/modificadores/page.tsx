"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { TIPO_SELECCION, eliminarGrupo, listarGrupos, type Grupo } from "../../../lib/modificadores";

export default function ModificadoresPage() {
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
      setError(e instanceof Error ? e.message : "No se pudieron cargar los grupos");
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
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo grupo
          </Button>
        }
      />
      <CatalogoTabs />
      <PageBody>
        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        {grupos === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {grupos !== null && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Grupo</th>
                  <th className="w-[230px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Selección</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Opciones</th>
                  <th className="w-[110px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.id} className="group cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => router.push(`/catalogo/modificadores/${g.id}`)}>
                    <td className="px-4 py-3.5">
                      <div className="text-[15px] font-semibold">{g.nombre}</div>
                      {g.descripcion && <div className="mt-px text-[12.5px] text-ink-3">{g.descripcion}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-[13.5px] text-ink-2">
                      {TIPO_SELECCION[g.tipo_seleccion]}
                      {g.tipo_seleccion === "MULTIPLE_OBLIGATORIA_RANGO" && g.minimo_selecciones !== null && (
                        <span className="text-ink-3"> ({g.minimo_selecciones}–{g.maximo_selecciones})</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-display text-[15px] font-semibold tabular-nums">{g.nOpciones}</span>{" "}
                      <span className="text-xs text-ink-3">opciones</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", g.activo ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3"].join(" ")}>
                        <span className={["h-1.5 w-1.5 rounded-full", g.activo ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {g.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" title="Editar" onClick={() => router.push(`/catalogo/modificadores/${g.id}`)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button type="button" title="Eliminar" onClick={() => setBorrar(g)} className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
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
          <p className="mt-4 text-[13px] text-ink-3">
            <b className="text-ink-2">{grupos.length}</b> grupo(s)
          </p>
        )}
      </PageBody>

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Eliminar grupo" className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            ¿Eliminar <b className="text-ink">{borrar.nombre}</b>? Se quitará de los productos que lo usen.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={borrando}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarBorrado} disabled={borrando}>{borrando ? "Eliminando…" : "Eliminar"}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
