"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import {
  eliminarProducto,
  listarProductos,
  precioMxn,
  type EstadoProducto,
  type Producto,
} from "../../../lib/catalogo";
import { mensajeError } from "../../../lib/errores";

type Filtro = "all" | "ACTIVO" | "PAUSADO" | "AGOTADO";

const BADGE: Record<EstadoProducto, { txt: string; cls: string; dot: string }> = {
  ACTIVO: { txt: "Activo", cls: "bg-[#EAF3EE] text-success", dot: "bg-success" },
  PAUSADO: { txt: "Pausado", cls: "bg-hover text-ink-3", dot: "bg-ink-3" },
  AGOTADO: { txt: "Agotado", cls: "bg-[#FBF1EF] text-danger", dot: "bg-danger" },
};

export default function ProductosPage() {
  const router = useRouter();
  const [prods, setProds] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);

  async function recargar() {
    setError(null);
    try {
      setProds(await listarProductos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los productos"));
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  const visibles = useMemo(() => {
    return (prods ?? []).filter((p) => {
      if (filtro !== "all" && p.estado !== filtro) return false;
      if (query && !p.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [prods, filtro, query]);

  async function confirmarBorrado() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await eliminarProducto(borrar.id);
      setBorrar(null);
      setBorrando(false);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar"));
      setBorrando(false);
    }
  }

  const sinNada = prods !== null && prods.length === 0;

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo="El menú completo de tu negocio. Aquí sí se muestran los precios."
        migas={[{ label: "Catálogo" }, { label: "Productos" }]}
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/catalogo/importar")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[16px] w-[16px]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Importar menú
            </Button>
            <Button onClick={() => router.push("/catalogo/productos/nuevo")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nuevo producto
            </Button>
          </div>
        }
      />
      <CatalogoTabs />
      <PageBody>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1 sm:max-w-[340px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <div className="scroll-x-limpio inline-flex max-w-full gap-0.5 overflow-x-auto rounded border border-line bg-hover p-[3px] lg:max-w-none lg:overflow-x-visible">
            {(["all", "ACTIVO", "PAUSADO", "AGOTADO"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={[
                  "flex-shrink-0 whitespace-nowrap rounded-[4px] px-3 py-2.5 text-[13px] font-semibold transition lg:py-[7px]",
                  filtro === f ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {f === "all" ? "Todos" : f === "ACTIVO" ? "Activos" : f === "PAUSADO" ? "Pausados" : "Agotados"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {prods === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {prods !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Producto</th>
                  <th className="w-[180px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Categoría</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-right text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Precio</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const b = BADGE[p.estado];
                  return (
                    <tr key={p.id} className="group cursor-pointer border-b border-line last:border-none hover:bg-hover" onClick={() => router.push(`/catalogo/productos/${p.id}`)}>
                      <td className="px-4 py-3.5">
                        <div className="text-[15px] font-semibold">{p.nombre}</div>
                        {p.codigo_interno && <div className="mt-px text-[12.5px] text-ink-3">{p.codigo_interno}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-[14px] text-ink-2">{p.categoriaNombre}</td>
                      <td className="px-4 py-3.5 text-right font-display text-[15px] font-semibold tabular-nums">{precioMxn(p.precio_base_mxn)}</td>
                      <td className="px-4 py-3.5">
                        <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-[12.5px] font-semibold", b.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", b.dot].join(" ")} />
                          {b.txt}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => router.push(`/catalogo/productos/${p.id}`)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => setBorrar(p)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-[#E8C5C0] hover:text-danger"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">{sinNada ? "Aún no hay productos" : "Sin resultados"}</p>
                <p className="max-w-sm text-sm text-ink-2">
                  {sinNada
                    ? "Crea tu primer producto. Necesitas al menos una categoría."
                    : "No hay productos que coincidan con tu búsqueda o filtro."}
                </p>
                {sinNada && <Button onClick={() => router.push("/catalogo/productos/nuevo")}>Crear el primer producto</Button>}
              </div>
            )}
          </div>
        )}

        {prods !== null && visibles.length > 0 && (
          <p className="mt-4 text-[13px] text-ink-3">
            Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{prods.length}</b> productos
          </p>
        )}
      </PageBody>

      {borrar && (
        <Modal open onClose={() => setBorrar(null)} title="Eliminar producto" className="w-full max-w-[400px] rounded-lg border border-line bg-surface p-6 shadow-xl">
          <p className="text-sm text-ink-2">
            ¿Eliminar <b className="text-ink">{borrar.nombre}</b>? Esta acción lo oculta del catálogo y del POS.
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
