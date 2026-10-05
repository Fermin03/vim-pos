"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { FranjaMenus, useMenuCatalogo } from "../../../components/selector-menu";
import { AvisoCajasMenu } from "../../../components/aviso-cajas-menu";
import { eliminarProducto, listarProductos, precioMxn, type Producto } from "../../../lib/catalogo";
import type { Caja } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";
import { limpiarPrecio } from "../../../lib/numeros";
import { cajasQueNoRespetanMenu, estadoGeneral, precioValido, type EstadoEnSucursal } from "../../../lib/menu-sucursal";
import {
  MENU_GENERAL,
  estadoEnMenu,
  filasDelGeneral,
  guardarFilaDeMenu,
  leerFilasDeMenu,
  type FilaDeMenu,
  type MenuId,
} from "../../../lib/menus";

type Filtro = "all" | EstadoEnSucursal;
const SIN_FILAS: Map<string, FilaDeMenu> = new Map();

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
  const menu = useMenuCatalogo();
  const router = useRouter();
  const [prods, setProds] = useState<Producto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Menús del catálogo (ADR 0029): con dos o más sucursales o algún menú propio se elige un menú y se ajusta en línea.
  const [filas, setFilas] = useState<Map<string, FilaDeMenu>>(new Map());
  // A qué menú pertenecen `filas`: mientras no coincida con el elegido, el menú no se muestra ni se edita.
  const [filasDe, setFilasDe] = useState<MenuId | null>(null);
  // Renglones con una escritura en cola o en curso (un id por escritura).
  const [guardando, setGuardando] = useState<string[]>([]);
  // Se incrementa cuando un guardado falla: obliga a remontar los campos con lo que sí quedó guardado.
  const [recarga, setRecarga] = useState(0);
  const [cajasViejas, setCajasViejas] = useState<Caja[]>([]);
  // Sin menús que elegir (una sola sucursal y ninguno propio) la tabla es la de siempre.
  const modoMenu = menu.visible && menu.listo;
  // Las escrituras salen de estos refs, no del cierre del render: cada una ve lo último guardado.
  const menuRef = useRef<MenuId>(menu.id);
  menuRef.current = menu.id;
  const filasRef = useRef<{ de: MenuId | null; filas: Map<string, FilaDeMenu> }>({ de: null, filas: new Map() });
  const colaRef = useRef<Promise<void>>(Promise.resolve());
  const cargandoFilas = modoMenu && filasDe !== menu.id;
  const filasVista = filasDe === menu.id ? filas : SIN_FILAS;

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
    cajasQueNoRespetanMenu().then(setCajasViejas).catch(() => setCajasViejas([]));
  }, []);

  function aplicarFilas(de: MenuId, mapa: Map<string, FilaDeMenu>) {
    filasRef.current = { de, filas: mapa };
    setFilas(mapa);
    setFilasDe(de);
  }

  useEffect(() => {
    // Al cambiar de menú se olvida el anterior antes de leer el nuevo.
    filasRef.current = { de: null, filas: new Map() };
    setFilas(new Map());
    setFilasDe(null);
    if (!modoMenu || prods === null) return;
    if (menu.esGeneral) {
      aplicarFilas(MENU_GENERAL, filasDelGeneral(prods));
      return;
    }
    let vivo = true;
    const id = menu.id;
    leerFilasDeMenu(id)
      .then((fs) => {
        if (vivo) aplicarFilas(id, fs);
      })
      .catch((e) => {
        if (vivo) setError(mensajeError(e, "No se pudo leer el menú"));
      });
    return () => {
      vivo = false;
    };
  }, [menu.id, menu.esGeneral, modoMenu, prods]);

  // Un filtro de un menú (p. ej. «No se venden aquí») no tiene sentido en otro.
  useEffect(() => {
    setFiltro("all");
  }, [menu.id, modoMenu]);

  function estadoDe(p: Producto, fila: FilaDeMenu | undefined): EstadoEnSucursal {
    return modoMenu ? estadoEnMenu(p.estado, fila?.disponible ?? true) : estadoGeneral(p);
  }

  const visibles = useMemo(() => {
    return (prods ?? []).filter((p) => {
      const estado = estadoDe(p, filasVista.get(p.id));
      if (filtro !== "all" && estado !== filtro) return false;
      if (query && !p.nombre.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [prods, filtro, query, modoMenu, filasVista]);

  /**
   * Una escritura a la vez y ninguna se pierde: cada una se encadena a la anterior. Al empezar, la
   * edición se arma con lo último leído (no con el render que la disparó), y al terminar se vuelve a
   * leer: lo que se ve es lo guardado. Solo el renglón en cola se atenúa; el resto de la tabla sigue libre.
   */
  function guardarFila(p: Producto, cambio: Partial<FilaDeMenu>) {
    const m = menu.id;
    if (!modoMenu || filasRef.current.de !== m) return;
    setGuardando((g) => [...g, p.id]);
    colaRef.current = colaRef.current.then(async () => {
      try {
        // Si mientras esperaba en la cola se cambió de menú, esta escritura ya no aplica.
        if (menuRef.current !== m || filasRef.current.de !== m) return;
        setError(null);
        // Lo que se ve debe ser lo guardado: en el General se releen los productos, en un menú propio sus filas.
        const releer = async () => {
          if (m === MENU_GENERAL) {
            const nuevos = await listarProductos();
            if (menuRef.current === m) {
              // Los renglones conservan su lugar: con el mismo orden_visualizacion la base puede devolverlos en otro orden.
              setProds((previos) => {
                if (!previos) return nuevos;
                const lugar = new Map(previos.map((x, i) => [x.id, i]));
                return [...nuevos].sort((a, b) => (lugar.get(a.id) ?? 1e9) - (lugar.get(b.id) ?? 1e9));
              });
              aplicarFilas(m, filasDelGeneral(nuevos));
            }
          } else {
            const fs = await leerFilasDeMenu(m);
            if (menuRef.current === m) aplicarFilas(m, fs);
          }
        };
        try {
          await guardarFilaDeMenu(m, p.id, cambio);
        } catch (e) {
          if (menuRef.current === m) {
            setError(mensajeError(e, "No se pudo guardar el menú"));
            // Los campos se remontan con lo que sí quedó guardado.
            try {
              await releer();
              if (menuRef.current === m) setRecarga((n) => n + 1);
            } catch {
              /* el error de guardado ya está a la vista */
            }
          }
          return;
        }
        try {
          await releer();
          setCajasViejas(await cajasQueNoRespetanMenu());
        } catch (e) {
          if (menuRef.current === m) setError(mensajeError(e, "Se guardó, pero no se pudo releer el menú"));
        }
      } finally {
        setGuardando((g) => {
          const i = g.indexOf(p.id);
          return i < 0 ? g : [...g.slice(0, i), ...g.slice(i + 1)];
        });
      }
    });
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
  const filtros: Filtro[] = modoMenu ? ["all", "ACTIVO", "PAUSADO", "NO_SE_VENDE"] : ["all", "ACTIVO", "PAUSADO", "AGOTADO"];
  const th = "border-b border-line bg-sel px-4 py-[13px] text-12 font-bold uppercase tracking-wide text-ink-3";

  return (
    <>
      <PageHeader
        titulo="Productos"
        subtitulo={
          modoMenu
            ? "El menú de tu negocio. Elige un menú para ver y ajustar lo que vende y a qué precio."
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
      <FranjaMenus menu={menu} />
      <CatalogoTabs />
      <PageBody>
        <AvisoCajasMenu cajas={cajasViejas} />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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

        {modoMenu && (
          <p className="mb-3 text-13 text-ink-2">
            Estás viendo {menu.nombre}. Los cambios llegan a sus cajas en uno o dos minutos.
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
                  {modoMenu && <th className={`${th} w-[110px] text-left`}>{menu.esGeneral ? "Se vende" : "En este menú"}</th>}
                  <th className={`${th} ${modoMenu ? "w-[150px]" : "w-[120px]"} text-right`}>Precio</th>
                  <th className={`${th} w-[150px] text-left`}>Estado</th>
                  <th className={`${th} w-[104px]`}></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const fila = filasVista.get(p.id);
                  const b = BADGE[estadoDe(p, fila)];
                  // Un combo se edita en su propia pantalla (slots, vista previa de precio):
                  // no tiene receta ni estación, así que el editor de producto no le sirve.
                  const editarHref = p.es_combo ? `/catalogo/combos/${p.id}` : `/catalogo/productos/${p.id}`;
                  const enCola = guardando.includes(p.id);
                  const bloqueado = cargandoFilas || enCola;
                  return (
                    <tr
                      key={p.id}
                      className={["group cursor-pointer border-b border-line last:border-none hover:bg-hover", enCola ? "opacity-50" : ""].join(" ")}
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
                      {modoMenu && (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-ink"
                            aria-label={`${p.nombre} se vende en ${menu.nombre}`}
                            checked={fila?.disponible ?? true}
                            disabled={bloqueado}
                            onChange={(e) => guardarFila(p, { disponible: e.target.checked })}
                          />
                        </td>
                      )}
                      {modoMenu ? (
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="relative ml-auto w-[120px]">
                            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">$</span>
                            <input
                              key={`${p.id}:${fila?.precio_mxn ?? ""}:${recarga}`}
                              defaultValue={fila ? String(fila.precio_mxn) : ""}
                              inputMode="decimal"
                              aria-label={`Precio de ${p.nombre} en ${menu.nombre}`}
                              disabled={bloqueado || fila?.disponible === false}
                              className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                              onChange={(e) => {
                                e.target.value = limpiarPrecio(e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              onBlur={(e) => {
                                const nuevo = precioValido(e.target.value);
                                if (nuevo === "invalido" || nuevo === null) {
                                  // Un "." suelto o un campo vacío no son un precio: en un menú el precio no puede quedar vacío.
                                  e.target.value = fila ? String(fila.precio_mxn) : "";
                                  return;
                                }
                                if (nuevo !== fila?.precio_mxn) guardarFila(p, { precio_mxn: nuevo });
                              }}
                            />
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-3.5 text-right font-display text-15 font-semibold tabular-nums">{precioMxn(p.precio_base_mxn)}</td>
                      )}
                      <td className="px-4 py-3.5">
                        <span className={["inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1 text-13 font-semibold", b.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", b.dot].join(" ")} />
                          {b.txt}
                        </span>
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
