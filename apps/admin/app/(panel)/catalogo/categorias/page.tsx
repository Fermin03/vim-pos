"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { FranjaMenus, useMenuCatalogo } from "../../../components/selector-menu";
import { ModalCategoria } from "../../../components/modal-categoria";
import {
  reordenarCategorias,
  ICONOS,
  bgDe,
  eliminarCategoria,
  listarCategorias,
  listarProductos,
  type Categoria,
  type Producto,
} from "../../../lib/catalogo";
import { mensajeError } from "../../../lib/errores";
import {
  MENU_GENERAL,
  conteoPorCategoria,
  encenderCategoria,
  estadoCategoria,
  filasDelGeneral,
  leerFilasDeMenu,
  type FilaDeMenu,
  type MenuId,
} from "../../../lib/menus";

type Filtro = "all" | "on" | "off";

/**
 * Casilla que admite el estado indeterminado (una categoría con parte de sus productos apagados).
 * El área de toque es la etiqueta (44 px en táctil, 40 en escritorio); la casilla visible sigue en 20 px.
 * Mientras guarda no se usa `disabled`: deshabilitar el elemento enfocado le quita el foco al teclado.
 */
function Interruptor({
  marcada,
  parcial,
  ocupada,
  etiqueta,
  onCambiar,
}: {
  marcada: boolean;
  parcial: boolean;
  ocupada: boolean;
  etiqueta: string;
  onCambiar: (encender: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Sin lista de dependencias: React reescribe `checked` en cada clic y el estado indeterminado se perdería.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = parcial;
  });
  return (
    <label className={["flex h-11 w-11 items-center justify-center lg:h-10 lg:w-10", ocupada ? "cursor-wait" : "cursor-pointer"].join(" ")}>
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 accent-ink"
        aria-label={etiqueta}
        aria-checked={parcial ? "mixed" : marcada}
        aria-disabled={ocupada}
        checked={marcada}
        // Parcial: un clic enciende el resto. Encendida se apaga; apagada se enciende.
        onChange={() => {
          if (!ocupada) onCambiar(parcial ? true : !marcada);
        }}
      />
    </label>
  );
}

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
  const menu = useMenuCatalogo();
  const [cats, setCats] = useState<Categoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [modal, setModal] = useState<{ cat: Categoria | null } | null>(null);
  const [borrar, setBorrar] = useState<Categoria | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Menús del catálogo (ADR 0029): en modo menú cada categoría muestra cuántos de sus productos se venden en el menú elegido.
  const modoMenu = menu.visible && menu.listo;
  const [prods, setProds] = useState<Producto[] | null>(null);
  const [filas, setFilas] = useState<Map<string, FilaDeMenu>>(new Map());
  // A qué menú pertenecen `filas`: mientras no coincida con el elegido no se pinta ningún conteo.
  const [filasDe, setFilasDe] = useState<MenuId | null>(null);
  const [guardandoCat, setGuardandoCat] = useState<string[]>([]);

  // Mover solo tiene sentido viendo la lista completa: con un filtro o una búsqueda, "subir"
  // saltaría sobre categorías que no se ven.
  const puedeOrdenar = filtro === "all" && query.trim() === "";
  const [moviendo, setMoviendo] = useState(false);
  async function mover(c: Categoria, dir: -1 | 1) {
    if (!cats) return;
    const i = cats.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    const copia = [...cats];
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
    setCats(copia.map((x, k) => ({ ...x, orden_visualizacion: k + 1 }))); // respuesta inmediata
    setMoviendo(true);
    try {
      await reordenarCategorias(copia);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar el orden"));
    } finally {
      setMoviendo(false);
      await recargar();
    }
  }

  async function recargar() {
    setError(null);
    try {
      setCats(await listarCategorias());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar las categorías"));
    }
  }
  useEffect(() => {
    recargar();
  }, []);

  async function recargarProductos() {
    try {
      setProds(await listarProductos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los productos"));
    }
  }
  useEffect(() => {
    if (modoMenu) void recargarProductos();
  }, [modoMenu]);

  // Al cambiar de menú se olvida el anterior; al recargar el mismo menú se conserva lo que ya se ve hasta que llegue lo nuevo.
  useEffect(() => {
    setFilas(new Map());
    setFilasDe(null);
  }, [menu.id, modoMenu]);

  useEffect(() => {
    if (!modoMenu || prods === null) return;
    if (menu.esGeneral) {
      setFilas(filasDelGeneral(prods));
      setFilasDe(MENU_GENERAL);
      return;
    }
    let vivo = true;
    const id = menu.id;
    leerFilasDeMenu(id)
      .then((fs) => {
        if (!vivo) return;
        setFilas(fs);
        setFilasDe(id);
      })
      .catch((e) => {
        if (vivo) setError(mensajeError(e, "No se pudo leer el menú"));
      });
    return () => {
      vivo = false;
    };
  }, [menu.id, menu.esGeneral, modoMenu, prods]);

  const cargandoFilas = modoMenu && filasDe !== menu.id;
  const conteo = useMemo(
    () => (modoMenu && prods && filasDe === menu.id ? conteoPorCategoria(prods, filas) : null),
    [modoMenu, prods, filas, filasDe, menu.id],
  );

  async function alternarCategoria(c: Categoria, encender: boolean) {
    const m = menu.id;
    setGuardandoCat((g) => [...g, c.id]);
    setError(null);
    try {
      await encenderCategoria(m, c.id, encender);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar la categoría"));
    }
    // Lo que se ve es lo guardado: se releen productos (y con ellos las filas del menú).
    await recargarProductos();
    setGuardandoCat((g) => g.filter((x) => x !== c.id));
  }

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
      setError(mensajeError(e, "No se pudo eliminar"));
      setBorrando(false);
    }
  }

  const sinNada = cats !== null && cats.length === 0;

  return (
    <>
      <PageHeader
        titulo="Categorías"
        subtitulo="Los grupos de tu menú. Con las flechas eliges en qué orden aparecen en la caja."
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
      <FranjaMenus menu={menu} />
      <CatalogoTabs />
      <PageBody>
        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1 sm:max-w-[340px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-[13px] top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              aria-label="Buscar categoría"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoría…"
              className="h-10 w-full rounded border border-line-strong pl-[38px] pr-3 text-sm outline-none focus:border-ink"
            />
          </div>
          <div className="scroll-x-limpio inline-flex max-w-full gap-0.5 overflow-x-auto rounded border border-line bg-hover p-[3px] lg:max-w-none lg:overflow-x-visible">
            {(["all", "on", "off"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={[
                  "flex-shrink-0 whitespace-nowrap rounded-[4px] px-3 py-2.5 text-13 font-semibold transition lg:py-[7px]",
                  filtro === f ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                ].join(" ")}
              >
                {f === "all" ? "Todas" : f === "on" ? "Activas" : "Inactivas"}
              </button>
            ))}
          </div>
        </div>

        {modoMenu && (
          <div className="mb-3 space-y-1 text-13 text-ink-2">
            <p>Estás viendo {menu.nombre}. Apagar una categoría apaga todos sus productos en este menú.</p>
            <p>El nombre, el orden y el color de las categorías son los mismos en todos los menús.</p>
          </div>
        )}

        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        {cats === null && <p className="text-sm text-ink-3">Cargando…</p>}

        {cats !== null && (
          <div className="tabla-caja overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Categoría</th>
                  <th className="w-[130px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Productos</th>
                  {modoMenu && (
                    <th className="w-[130px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                      {menu.esGeneral ? "Se vende" : "En este menú"}
                    </th>
                  )}
                  <th className="w-[130px] border-b border-line bg-sel px-4 py-[13px] text-center text-12 font-bold uppercase tracking-wide text-ink-3">Orden</th>
                  <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-bold uppercase tracking-wide text-ink-3">Estado</th>
                  <th className="w-[104px] border-b border-line bg-sel px-4 py-[13px]"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const n = conteo?.get(c.id) ?? { seVenden: 0, total: 0 };
                  const estado = estadoCategoria(n.seVenden, n.total);
                  const ocupada = guardandoCat.includes(c.id);
                  return (
                  <tr key={c.id} className={["group border-b border-line last:border-none hover:bg-hover", ocupada ? "opacity-50" : ""].join(" ")}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Dot cat={c} />
                        <div>
                          <div className="text-15 font-semibold">{c.nombre}</div>
                          {c.descripcion && <div className="mt-px text-13 text-ink-3">{c.descripcion}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {modoMenu ? (
                        conteo ? (
                          <>
                            <span className="font-display text-15 font-semibold tabular-nums">
                              {n.total === 0 ? 0 : `${n.seVenden} de ${n.total}`}
                            </span>{" "}
                            <span className="text-xs text-ink-3">productos</span>
                          </>
                        ) : (
                          <span className="text-13 tabular-nums text-ink-3">…</span>
                        )
                      ) : (
                        <>
                          <span className="font-display text-15 font-semibold tabular-nums">{c.nProductos}</span>{" "}
                          <span className="text-xs text-ink-3">productos</span>
                        </>
                      )}
                    </td>
                    {modoMenu && (
                      <td className="px-4 py-3.5">
                        {!conteo || estado === "vacia" ? (
                          <>
                            <span aria-hidden="true" className="text-ink-3">–</span>
                            <span className="sr-only">{conteo ? "Sin productos" : "Cargando"}</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Interruptor
                              marcada={estado === "encendida"}
                              parcial={estado === "parcial"}
                              ocupada={cargandoFilas || ocupada}
                              etiqueta={`${c.nombre} se vende en ${menu.nombre}`}
                              onCambiar={(encender) => void alternarCategoria(c, encender)}
                            />
                            {estado === "parcial" && <span className="text-13 text-ink-3">parcial</span>}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-3.5">
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Subir ${c.nombre}`}
                          title={puedeOrdenar ? "Subir" : "Quita el filtro para ordenar"}
                          disabled={!puedeOrdenar || moviendo || cats[0]?.id === c.id}
                          onClick={() => void mover(c, -1)}
                          className="flex h-10 w-10 items-center justify-center rounded text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 lg:h-8 lg:w-8"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                        </button>
                        <span className="min-w-[22px] text-center font-display text-13 font-semibold tabular-nums text-ink-2">{c.orden_visualizacion}</span>
                        <button
                          type="button"
                          aria-label={`Bajar ${c.nombre}`}
                          title={puedeOrdenar ? "Bajar" : "Quita el filtro para ordenar"}
                          disabled={!puedeOrdenar || moviendo || cats[cats.length - 1]?.id === c.id}
                          onClick={() => void mover(c, 1)}
                          className="flex h-10 w-10 items-center justify-center rounded text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:opacity-30 lg:h-8 lg:w-8"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                        </button>
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-13 font-semibold",
                          c.activa ? "bg-success-soft text-success" : "bg-hover text-ink-3",
                        ].join(" ")}
                      >
                        <span className={["h-1.5 w-1.5 rounded-full", c.activa ? "bg-success" : "bg-ink-3"].join(" ")} />
                        {c.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          title="Editar"
                          aria-label={`Editar ${c.nombre}`}
                          onClick={() => setModal({ cat: c })}
                          className="flex h-10 w-10 items-center justify-center rounded border border-transparent lg:h-8 lg:w-8 text-ink-3 transition hover:border-line-strong hover:bg-surface hover:text-ink"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          aria-label={`Eliminar ${c.nombre}`}
                          onClick={() => setBorrar(c)}
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
                <p className="font-display text-lg font-semibold">
                  {sinNada ? "Aún no hay categorías" : "Sin resultados"}
                </p>
                <p className="max-w-sm text-sm text-ink-2">
                  {sinNada
                    ? "Crea tu primera categoría para empezar a ordenar tu menú."
                    : "No hay categorías que coincidan con tu búsqueda o filtro."}
                </p>
                {sinNada && <Button onClick={() => setModal({ cat: null })}>Crear la primera categoría</Button>}
              </div>
            )}
          </div>
        )}

        {cats !== null && visibles.length > 0 && (
          <p className="mt-4 text-13 text-ink-3">
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
        <DialogoPeligro
          error={error}
          titulo="¿Eliminar esta categoría?"
          consecuencia={
            <>
              <b className="text-ink">{borrar.nombre}</b> se ocultará del catálogo y del POS.
              {borrar.nProductos > 0 && (
                <>
                  {" "}
                  Tiene <b>{borrar.nProductos}</b> producto(s) asociados.
                </>
              )}
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
