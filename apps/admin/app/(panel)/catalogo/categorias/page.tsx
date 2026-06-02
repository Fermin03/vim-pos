"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { ModalCategoria } from "../../../components/modal-categoria";
import {
  ICONOS,
  bgDe,
  eliminarCategoria,
  listarCategorias,
  type Categoria,
} from "../../../lib/catalogo";

type Filtro = "all" | "on" | "off";

function Dot({ cat }: { cat: Categoria }) {
  return (
    <span
      className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded"
      style={{ background: bgDe(cat.color_hex), color: cat.color_hex ?? "#5A5A60" }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d={ICONOS[cat.icono ?? "tag"] ?? ICONOS.tag} />
      </svg>
    </span>
  );
}

export default function CategoriasPage() {
  const [cats, setCats] = useState<Categoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [modal, setModal] = useState<{ cat: Categoria | null } | null>(null);
  const [borrar, setBorrar] = useState<Categoria | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setCats(await listarCategorias());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las categorías");
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  const visibles = useMemo(() => {
    return (cats ?? []).filter((c) => {
      if (filtro === "on" && !c.activa) return false;
      if (filtro === "off" && c.activa) return false;
      if (query && !c.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [cats, filtro, query]);

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarCategoria(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
      setBorrando(false);
    }
  }

  const sinNada = cats !== null && cats.length === 0;

  return (
    <>
      <PageHeader
        titulo="Categorías"
        subtitulo="Los grupos en los que se ordena tu menú."
        migas={[{ label: "Catálogo" }, { label: "Categorías" }]}
        right={
          <Button onClick={() => setModal({ cat: null })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva categoría
          </Button>
        }
      />
      <PageBody>
        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative max-w-[340px] flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoría…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <div className="inline-flex gap-0.5 rounded border border-line bg-hover p-[3px]">
            {(["all", "on", "off"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={[
                  "rounded-[4px] px-3 py-[7px] text-[13px] font-semibold transition",
                  filtro === f ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {f === "all" ? "Todas" : f === "on" ? "Activas" : "Inactivas"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {cats === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {cats !== null && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Categoría</th>
                  <th className="w-[130px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Productos</th>
                  <th className="w-[90px] border-b border-line bg-sel px-4 py-[13px] text-center text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Orden</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.id} className="group border-b border-line last:border-none hover:bg-hover">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Dot cat={c} />
                        <div>
                          <div className="text-[15px] font-semibold">{c.nombre}</div>
                          {c.descripcion && <div className="mt-px text-[12.5px] text-ink-3">{c.descripcion}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-display text-[15px] font-semibold tabular-nums">{c.nProductos}</span>{" "}
                      <span className="text-xs text-ink-3">productos</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex h-6 min-w-[26px] items-center justify-center rounded border border-line bg-hover px-[7px] font-display text-[13px] font-semibold tabular-nums text-ink-2">
                        {c.orden_visualizacion}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold",
                          c.activa ? "bg-[#EAF3EE] text-success" : "bg-hover text-ink-3",
                        ].join(" ")}
                      >
                        <span className={["h-1.5 w-1.5 rounded-full", c.activa ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {c.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => setModal({ cat: c })}
                          className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => setBorrar(c)}
                          className="flex h-8 w-8 items-center justify-center rounded border border-transparent text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {visibles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">
                  {sinNada ? "Aún no hay categorías" : "Sin resultados"}
                </p>
                <p className="max-w-sm text-sm text-ink-2">
                  {sinNada
                    ? "Crea tu primera categoría para empezar a ordenar el menú de Knock-Out."
                    : "No hay categorías que coincidan con tu búsqueda o filtro."}
                </p>
                {sinNada && <Button onClick={() => setModal({ cat: null })}>Crear la primera categoría</Button>}
              </div>
            )}
          </div>
        )}

        {cats !== null && visibles.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-3">
            Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{cats.length}</b> categorías
          </p>
        )}
      </PageBody>

      {modal && (
        <ModalCategoria
          cat={modal.cat}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            recargar();
          }}
        />
      )}

      {borrar && (
        <Modal
          open
          onClose={() => setBorrar(null)}
          title="Eliminar categoría"
          className="w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl"
        >
          <p className="text-sm text-ink-2">
            ¿Eliminar <b className="text-ink">{borrar.nombre}</b>? Esta acción la oculta del catálogo y del POS.
            {borrar.nProductos > 0 && (
              <>
                {" "}
                Tiene <b>{borrar.nProductos}</b> producto(s) asociados.
              </>
            )}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrar(null)} disabled={borrando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarBorrado} disabled={borrando}>
              {borrando ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
