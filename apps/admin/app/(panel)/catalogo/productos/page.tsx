"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { AvisoCajasMenu } from "../../../components/aviso-cajas-menu";
import { eliminarProducto, listarProductos, precioMxn, type Producto } from "../../../lib/catalogo";
import type { Caja } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";
import { limpiarPrecio } from "../../../lib/numeros";
import {
  cajasQueNoRespetanMenu,
  esPorDefecto,
  estadoEnSucursal,
  estadoGeneral,
  filaPorDefecto,
  guardarMenuSucursal,
  leerMenuDeSucursal,
  listarSucursalesMenu,
  type EdicionMenuSucursal,
  type EstadoEnSucursal,
  type FilaMenuSucursal,
  type SucursalMenu,
} from "../../../lib/menu-sucursal";

type Filtro = "all" | EstadoEnSucursal;
const TODAS = "todas";

const BADGE: Record<EstadoEnSucursal, { txt: string; cls: string; dot: string }> = {
  ACTIVO: { txt: "Activo", cls: "bg-success-soft text-success", dot: "bg-success" },
  PAUSADO: { txt: "Pausado", cls: "bg-hover text-ink-3", dot: "bg-ink-3" },
  AGOTADO: { txt: "Agotado", cls: "bg-[#FBF1EF] text-danger", dot: "bg-danger" },
  NO_SE_VENDE: { txt: "No se vende aquí", cls: "bg-hover text-ink-2", dot: "bg-ink-3" },
};
const NOMBRE_FILTRO: Record<Filtro, string> = {
  all: "Todos",
  ACTIVO: "Activos",
  PAUSADO: "Pausados",
  AGOTADO: "Agotados",
  NO_SE_VENDE: "No se venden aquí",
};

export default function ProductosPage() {
  const router = useRouter();
  const [prods, setProds] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Menú por sucursal (ADR 0027): con dos o más sucursales se elige una y se ajusta en línea.
  const [sucursales, setSucursales] = useState<SucursalMenu[]>([]);
  const [sucSel, setSucSel] = useState<string>(TODAS);
  const [filas, setFilas] = useState<Map<string, FilaMenuSucursal>>(new Map());
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);
  const [cajasViejas, setCajasViejas] = useState<Caja[]>([]);
  const porSucursal = sucSel !== TODAS;
  const nombreSuc = sucursales.find((s) => s.id === sucSel)?.nombre ?? "";

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
    listarSucursalesMenu().then(setSucursales).catch(() => setSucursales([]));
    cajasQueNoRespetanMenu().then(setCajasViejas).catch(() => setCajasViejas([]));
  }, []);

  useEffect(() => {
    if (sucSel === TODAS) {
      setFilas(new Map());
      return;
    }
    let vivo = true;
    leerMenuDeSucursal(sucSel)
      .then((fs) => {
        if (vivo) setFilas(new Map(fs.map((f) => [f.producto_id, f])));
      })
      .catch((e) => setError(mensajeError(e, "No se pudo leer el menú de la sucursal")));
    return () => {
      vivo = false;
    };
  }, [sucSel]);

  const visibles = useMemo(() => {
    return (prods ?? []).filter((p) => {
      const estado = porSucursal ? estadoEnSucursal(p.estado, filas.get(p.id)) : estadoGeneral(p);
      if (filtro !== "all" && estado !== filtro) return false;
      if (query && !p.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [prods, filtro, query, porSucursal, filas]);

  /** Una escritura a la vez; al terminar se vuelve a leer: lo que se ve es lo guardado. */
  async function guardarFila(p: Producto, cambio: Partial<Pick<EdicionMenuSucursal, "disponible" | "precio_mxn">>) {
    if (!porSucursal || guardandoFila) return;
    const actual = filas.get(p.id) ?? filaPorDefecto(p.id, sucSel);
    const edicion: EdicionMenuSucursal = {
      producto_id: p.id,
      sucursal_id: sucSel,
      disponible: actual.disponible,
      precio_mxn: actual.precio_mxn,
      agotado_manual: actual.agotado_manual,
      ...cambio,
    };
    if (!filas.has(p.id) && esPorDefecto(edicion)) return;
    setGuardandoFila(p.id);
    setError(null);
    try {
      await guardarMenuSucursal([edicion]);
      setFilas(new Map((await leerMenuDeSucursal(sucSel)).map((f) => [f.producto_id, f])));
      setCajasViejas(await cajasQueNoRespetanMenu());
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el menú de la sucursal"));
    } finally {
      setGuardandoFila(null);
    }
  }

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
  const filtros: Filtro[] = porSucursal ? ["all", "ACTIVO", "PAUSADO", "AGOTADO", "NO_SE_VENDE"] : ["all", "ACTIVO", "PAUSADO", "AGOTADO"];
  const th = "border-b border-line bg-sel px-4 py-[13px] text-12 font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo={
          sucursales.length >= 2
            ? "El menú de tu negocio. Elige una sucursal para ver y ajustar lo que vende y a qué precio."
            : "El menú completo de tu negocio. Aquí sí se muestran los precios."
        }
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
        <AvisoCajasMenu cajas={cajasViejas} />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {sucursales.length >= 2 && (
            <select
              aria-label="Sucursal"
              value={sucSel}
              onChange={(e) => {
                setSucSel(e.target.value);
                setFiltro("all");
              }}
              className="h-10 rounded border border-line-strong px-3 text-sm outline-none focus:border-ink"
            >
              <option value={TODAS}>Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          <div className="relative w-full flex-1 sm:max-w-[340px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar producto"
              placeholder="Buscar producto…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <div className="scroll-x-limpio inline-flex max-w-full gap-0.5 overflow-x-auto rounded border border-line bg-hover p-[3px] lg:max-w-none lg:overflow-x-visible">
            {filtros.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={[
                  "flex-shrink-0 whitespace-nowrap rounded-[4px] px-3 py-2.5 text-13 font-semibold transition lg:py-[7px]",
                  filtro === f ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {NOMBRE_FILTRO[f]}
              </button>
            ))}
          </div>
        </div>

        {porSucursal && (
          <p className="mb-3 text-13 text-ink-2">
            Precio vacío = el general. Los cambios llegan a las cajas de {nombreSuc} en uno o dos minutos.
          </p>
        )}

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
                  <th className={`${th} text-left`}>Producto</th>
                  <th className={`${th} w-[180px] text-left`}>Categoría</th>
                  {porSucursal && <th className={`${th} w-[110px] text-left`}>Se vende aquí</th>}
                  <th className={`${th} ${porSucursal ? "w-[150px]" : "w-[120px]"} text-right`}>{porSucursal ? "Precio aquí" : "Precio"}</th>
                  <th className={`${th} w-[150px] text-left`}>Estado</th>
                  <th className={`${th} w-[104px]`}></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const fila = filas.get(p.id);
                  const b = BADGE[porSucursal ? estadoEnSucursal(p.estado, fila) : estadoGeneral(p)];
                  // Un combo se edita en su propia pantalla (slots, vista previa de precio):
                  // no tiene receta ni estación, así que el editor de producto no le sirve.
                  const editarHref = p.es_combo ? `/catalogo/combos/${p.id}` : `/catalogo/productos/${p.id}`;
                  const ocupado = guardandoFila !== null;
                  return (
                    <tr
                      key={p.id}
                      className={["group cursor-pointer border-b border-line last:border-none hover:bg-hover", guardandoFila === p.id ? "opacity-50" : ""].join(" ")}
                      onClick={() => router.push(editarHref)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-15 font-semibold">{p.nombre}</span>
                          {p.es_combo && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-11 font-semibold text-accent">Combo</span>}
                        </div>
                        {p.codigo_interno && <div className="mt-px text-13 text-ink-3">{p.codigo_interno}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-14 text-ink-2">{p.categoriaNombre}</td>
                      {porSucursal && (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-ink"
                            aria-label={`${p.nombre} se vende en ${nombreSuc}`}
                            checked={fila?.disponible ?? true}
                            disabled={ocupado}
                            onChange={(e) => void guardarFila(p, { disponible: e.target.checked })}
                          />
                        </td>
                      )}
                      {porSucursal ? (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="relative ml-auto w-[120px]">
                            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">$</span>
                            <input
                              key={`${p.id}:${fila?.precio_mxn ?? ""}`}
                              defaultValue={fila?.precio_mxn ?? ""}
                              placeholder={String(p.precio_base_mxn)}
                              inputMode="decimal"
                              aria-label={`Precio de ${p.nombre} en ${nombreSuc}`}
                              disabled={ocupado || fila?.disponible === false}
                              className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                              onChange={(e) => {
                                e.target.value = limpiarPrecio(e.target.value);
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                const nuevo = v === "" ? null : Number(v);
                                if (nuevo !== (fila?.precio_mxn ?? null)) void guardarFila(p, { precio_mxn: nuevo });
                              }}
                            />
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-3.5 text-right font-display text-15 font-semibold tabular-nums">{precioMxn(p.precio_base_mxn)}</td>
                      )}
                      <td className="px-4 py-3.5">
                        <span className={["inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-13 font-semibold", b.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", b.dot].join(" ")} />
                          {b.txt}
                        </span>
                        {porSucursal && fila && fila.precio_mxn !== null && (
                          <div className="mt-1 text-12 text-ink-3 tabular-nums">General {precioMxn(p.precio_base_mxn)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            title="Editar"
                            aria-label={`Editar ${p.nombre}`}
                            onClick={() => router.push(editarHref)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            aria-label={`Eliminar ${p.nombre}`}
                            onClick={() => setBorrar(p)}
                            className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-danger-line hover:text-danger"
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
          <p className="mt-4 text-13 text-ink-3">
            Mostrando <b className="text-ink-2">{visibles.length}</b> de <b className="text-ink-2">{prods.length}</b> productos
          </p>
        )}
      </PageBody>

      {borrar && (
        <DialogoPeligro
          error={error}
          titulo="¿Eliminar este producto?"
          consecuencia={
            <>
              <b className="text-ink">{borrar.nombre}</b> se ocultará del catálogo y del POS.
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
