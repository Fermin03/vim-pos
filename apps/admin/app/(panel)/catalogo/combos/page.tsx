"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { CatalogoTabs } from "../../../components/catalogo-tabs";
import { FranjaMenus, useMenuCatalogo } from "../../../components/selector-menu";
import { CasillaMenu } from "../../../components/casilla-menu";
import { activarComboUpsell, leerComboUpsellActivo, listarCombos, type ComboResumen } from "../../../lib/combos";
import { precioMxn } from "../../../lib/catalogo";
import { mensajeError } from "../../../lib/errores";
import { limpiarPrecio } from "../../../lib/numeros";
import { precioValido } from "../../../lib/menu-sucursal";
import {
  MENU_GENERAL,
  estadoEnMenu,
  guardarFilaDeMenu,
  hrefConMenu,
  leerFilasDeMenu,
  type FilaDeMenu,
  type MenuId,
} from "../../../lib/menus";

// Mismo estilo que BADGE en catalogo/productos/page.tsx: un combo también puede quedar AGOTADO
// (el formulario de producto lo permite), y sin esta entrada el fallback lo mostraba como "Pausado".
const ESTADO: Record<string, { txt: string; cls: string; dot: string }> = {
  ACTIVO: { txt: "Activo", cls: "bg-success-soft text-success", dot: "bg-success" },
  PAUSADO: { txt: "Pausado", cls: "bg-hover text-ink-3", dot: "bg-ink-3" },
  AGOTADO: { txt: "Agotado", cls: "bg-[#FBF1EF] text-danger", dot: "bg-danger" },
  NO_SE_VENDE: { txt: "No se vende aquí", cls: "bg-hover text-ink-2", dot: "bg-ink-3" },
};
const SIN_FILAS: Map<string, FilaDeMenu> = new Map();

/** Los combos del General: lo que dicen los propios productos. */
function filasDeCombos(combos: ComboResumen[]): Map<string, FilaDeMenu> {
  return new Map(combos.map((c) => [c.id, { disponible: c.en_menu_general, precio_mxn: c.precio_base_mxn }]));
}

function Pasos({ n }: { n: number }) {
  return n === 0 ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-[11px] py-1 text-13 font-semibold text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      Sin pasos: la caja no lo puede vender
    </span>
  ) : (
    <span className="text-14 text-ink-2">
      <span className="font-display font-semibold tabular-nums">{n}</span> {n === 1 ? "paso" : "pasos"}
    </span>
  );
}

export default function CombosPage() {
  const menu = useMenuCatalogo();
  const router = useRouter();
  const [combos, setCombos] = useState<ComboResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [ofrecer, setOfrecer] = useState<boolean | null>(null);
  const [cambiando, setCambiando] = useState(false);
  // Menús del catálogo (ADR 0029): con dos o más sucursales o algún menú propio, cada combo se ajusta por menú.
  const modoMenu = menu.visible && menu.listo;
  const [filas, setFilas] = useState<Map<string, FilaDeMenu>>(new Map());
  // A qué menú pertenecen `filas`: mientras no coincida con el elegido, el menú no se muestra ni se edita.
  const [filasDe, setFilasDe] = useState<MenuId | null>(null);
  // Renglones con una escritura en cola o en curso (un id por escritura).
  const [guardando, setGuardando] = useState<string[]>([]);
  // Se incrementa cuando un guardado falla: obliga a remontar los campos con lo que sí quedó guardado.
  const [recarga, setRecarga] = useState(0);
  // Las escrituras salen de estos refs, no del cierre del render: cada una ve lo último guardado.
  const menuRef = useRef<MenuId>(menu.id);
  menuRef.current = menu.id;
  const filasRef = useRef<{ de: MenuId | null; filas: Map<string, FilaDeMenu> }>({ de: null, filas: new Map() });
  const colaRef = useRef<Promise<void>>(Promise.resolve());
  const cargandoFilas = modoMenu && filasDe !== menu.id;
  const filasVista = filasDe === menu.id ? filas : SIN_FILAS;
  // Los enlaces llevan el menú que se está viendo: el combo abre en ese, no en «el último usado».
  const menuHref = modoMenu ? menu.id : null;

  async function recargar() {
    setError(null);
    try {
      setCombos(await listarCombos());
    } catch (e) {
      setError(mensajeError(e, "No se pudieron cargar los combos"));
    }
  }
  useEffect(() => {
    recargar();
    leerComboUpsellActivo().then(setOfrecer).catch(() => setOfrecer(true));
  }, []);

  /** Enciende o apaga "¿Lo hacemos combo?" en caja (migración 0111, docs/diseno/pos.md). */
  async function cambiarOfrecer(activo: boolean) {
    setCambiando(true);
    setError(null);
    try {
      await activarComboUpsell(activo);
      setOfrecer(activo);
      setOkMsg(
        activo
          ? "La caja va a ofrecer el combo en unos minutos, o al momento si el cajero toca “Actualizar menú”."
          : "La caja va a dejar de ofrecer el combo en unos minutos, o al momento si el cajero toca “Actualizar menú”.",
      );
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(mensajeError(e, "No se pudo cambiar si la caja ofrece el combo"));
    } finally {
      setCambiando(false);
    }
  }

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
    if (!modoMenu || combos === null) return;
    if (menu.esGeneral) {
      aplicarFilas(MENU_GENERAL, filasDeCombos(combos));
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
  }, [menu.id, menu.esGeneral, modoMenu, combos]);

  /** Lo que se ve de un combo en el menú elegido; en el modo de siempre, su estado global. */
  function claveEstado(c: ComboResumen, fila: FilaDeMenu | undefined): string {
    if (!modoMenu) return c.estado;
    const e = estadoEnMenu(c.estado, fila?.disponible ?? true);
    // Un combo AGOTADO heredado se sigue viendo como hoy.
    return e === "ACTIVO" && c.estado === "AGOTADO" ? "AGOTADO" : e;
  }

  /**
   * Una escritura a la vez y ninguna se pierde: cada una se encadena a la anterior (mismo patrón que
   * Productos). Al terminar se vuelve a leer: lo que se ve es lo guardado. Solo el renglón en cola se
   * atenúa; el resto de la tabla sigue libre.
   */
  function guardarFila(c: ComboResumen, cambio: Partial<FilaDeMenu>) {
    const m = menu.id;
    if (!modoMenu || menu.error || filasRef.current.de !== m) return;
    setGuardando((g) => [...g, c.id]);
    colaRef.current = colaRef.current.then(async () => {
      try {
        // Si mientras esperaba en la cola se cambió de menú, esta escritura ya no aplica.
        if (menuRef.current !== m || filasRef.current.de !== m) return;
        setError(null);
        const releer = async () => {
          if (m === MENU_GENERAL) {
            const nuevos = await listarCombos();
            if (menuRef.current === m) {
              // Los renglones conservan su lugar: con el mismo orden_visualizacion la base puede devolverlos en otro orden.
              setCombos((previos) => {
                if (!previos) return nuevos;
                const lugar = new Map(previos.map((x, i) => [x.id, i]));
                return [...nuevos].sort((a, b) => (lugar.get(a.id) ?? 1e9) - (lugar.get(b.id) ?? 1e9));
              });
              aplicarFilas(m, filasDeCombos(nuevos));
            }
          } else {
            const fs = await leerFilasDeMenu(m);
            if (menuRef.current === m) aplicarFilas(m, fs);
          }
        };
        try {
          await guardarFilaDeMenu(m, c.id, cambio);
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
        } catch (e) {
          if (menuRef.current === m) setError(mensajeError(e, "Se guardó, pero no se pudo releer el menú"));
        }
      } finally {
        setGuardando((g) => {
          const i = g.indexOf(c.id);
          return i < 0 ? g : [...g.slice(0, i), ...g.slice(i + 1)];
        });
      }
    });
  }

  const sinNada = combos !== null && combos.length === 0;

  return (
    <>
      <PageHeader
        titulo="Combos"
        subtitulo="Un producto por pasos: la caja va preguntando qué elige el cliente en cada uno."
        migas={[{ label: "Catálogo" }, { label: "Combos" }]}
        right={
          <Button onClick={() => router.push(hrefConMenu("/catalogo/combos/nuevo", menuHref))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[17px] w-[17px]">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo combo
          </Button>
        }
      />
      <FranjaMenus menu={menu} />
      <CatalogoTabs />
      <PageBody>
        {okMsg && <p className="mb-3 text-sm font-medium text-success">{okMsg}</p>}
        {error && (
          <p className="mb-4 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="grid gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button" role="switch" aria-checked={!!ofrecer} aria-labelledby="ofrecer-combo" disabled={ofrecer === null || cambiando}
                onClick={() => cambiarOfrecer(!ofrecer)}
                className={`relative h-6 w-11 rounded-full transition-colors ${ofrecer ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${ofrecer ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <span id="ofrecer-combo" className="text-sm font-semibold">Ofrecer el combo en la caja {ofrecer === null ? "" : ofrecer ? "· Encendido" : "· Apagado"}</span>
            </div>
            <p className="text-13 text-ink-2">
              Cuando el cajero agrega suelto un producto que es principal de un combo (por
              ejemplo, una hamburguesa), la caja le pregunta si lo hace combo y le muestra cuánto
              cuesta de más. Apagado, el combo se sigue armando a mano desde su propia pantalla.
            </p>
          </div>
        </div>

        {combos === null && <p className="text-sm text-ink-2">Cargando…</p>}

        {/* En el celular, tarjetas; en lg, tabla. Antes era una fila con onClick: solo se abría
            con el mouse, ni con el teclado ni con un lector de pantalla. Ahora el nombre es un
            enlace y toda la fila lo sigue. */}
        {combos !== null && combos.length > 0 && (
          <ul className="flex flex-col gap-2.5 lg:hidden">
            {combos.map((c) => {
              const fila = filasVista.get(c.id);
              const e = ESTADO[claveEstado(c, fila)] ?? ESTADO.PAUSADO!;
              return (
                <li key={c.id}>
                  <Link href={hrefConMenu(`/catalogo/combos/${c.id}`, menuHref)} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 transition-[border-color,transform] duration-150 ease-vim hover:border-ink active:scale-[.99]">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-15 font-semibold">{c.nombre}</span>
                      <span className="flex-shrink-0 font-display text-15 font-semibold tabular-nums">
                        {!modoMenu ? precioMxn(c.precio_base_mxn) : fila ? precioMxn(fila.precio_mxn) : "…"}
                      </span>
                    </span>
                    <span className="text-13 text-ink-2">{c.categoriaNombre}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pasos n={c.nSlots} />
                      {!cargandoFilas && (
                        <span className={["inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1 text-13 font-semibold", e.cls].join(" ")}>
                          <span className={["h-1.5 w-1.5 rounded-full", e.dot].join(" ")} />
                          {e.txt}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {combos !== null && (
          <div className={`overflow-hidden rounded-lg border border-line bg-surface ${sinNada ? "" : "hidden lg:block"}`}>
            <table className={`w-full border-collapse ${sinNada ? "hidden" : ""}`}>
              <thead>
                <tr>
                  <th className="border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-semibold uppercase tracking-wide text-ink-2">Combo</th>
                  <th className="w-[180px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-semibold uppercase tracking-wide text-ink-2">Categoría</th>
                  {modoMenu && <th className="w-[120px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-semibold uppercase tracking-wide text-ink-2">{menu.esGeneral ? "Se vende" : "En este menú"}</th>}
                  <th className={`${modoMenu ? "w-[150px]" : "w-[120px]"} border-b border-line bg-sel px-4 py-[13px] text-right text-12 font-semibold uppercase tracking-wide text-ink-2`}>{modoMenu ? "Precio" : "Precio base"}</th>
                  <th className="w-[240px] border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-semibold uppercase tracking-wide text-ink-2">Pasos</th>
                  <th className={`${modoMenu ? "w-[160px]" : "w-[110px]"} border-b border-line bg-sel px-4 py-[13px] text-left text-12 font-semibold uppercase tracking-wide text-ink-2`}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((c) => {
                  const fila = filasVista.get(c.id);
                  const e = ESTADO[claveEstado(c, fila)] ?? ESTADO.PAUSADO!;
                  const enCola = guardando.includes(c.id);
                  const bloqueado = cargandoFilas || enCola || !!menu.error;
                  return (
                    <tr key={c.id} className={["cursor-pointer border-b border-line last:border-none hover:bg-hover", enCola ? "opacity-50" : ""].join(" ")} onClick={() => router.push(hrefConMenu(`/catalogo/combos/${c.id}`, menuHref))}>
                      <td className="px-4 py-3.5 text-15 font-semibold">
                        <Link href={hrefConMenu(`/catalogo/combos/${c.id}`, menuHref)} className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" onClick={(ev) => ev.stopPropagation()}>
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-14 text-ink-2">{c.categoriaNombre}</td>
                      {modoMenu && (
                        <td className="px-4 py-1" onClick={(ev) => ev.stopPropagation()}>
                          <CasillaMenu
                            marcada={fila?.disponible ?? true}
                            ocupada={bloqueado}
                            etiqueta={`${c.nombre} se vende en ${menu.nombre}`}
                            onCambiar={(v) => guardarFila(c, { disponible: v })}
                          />
                        </td>
                      )}
                      {modoMenu ? (
                        <td className="px-4 py-3.5" onClick={(ev) => ev.stopPropagation()}>
                          <div className="relative ml-auto w-[120px]">
                            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-2">$</span>
                            <input
                              key={`${c.id}:${fila?.precio_mxn ?? ""}:${recarga}`}
                              defaultValue={fila ? String(fila.precio_mxn) : ""}
                              inputMode="decimal"
                              aria-label={`Precio de ${c.nombre} en ${menu.nombre}`}
                              disabled={bloqueado || fila?.disponible === false}
                              className="h-9 w-full rounded border border-line-strong pl-6 pr-2 text-right text-sm tabular-nums outline-none focus:border-ink disabled:bg-hover disabled:text-ink-3"
                              onChange={(ev) => {
                                ev.target.value = limpiarPrecio(ev.target.value);
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter") ev.currentTarget.blur();
                              }}
                              onBlur={(ev) => {
                                const nuevo = precioValido(ev.target.value);
                                if (nuevo === "invalido" || nuevo === null) {
                                  // Un "." suelto o un campo vacío no son un precio: en un menú el precio no puede quedar vacío.
                                  ev.target.value = fila ? String(fila.precio_mxn) : "";
                                  return;
                                }
                                if (nuevo !== fila?.precio_mxn) guardarFila(c, { precio_mxn: nuevo });
                              }}
                            />
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-3.5 text-right font-display text-15 font-semibold tabular-nums">{precioMxn(c.precio_base_mxn)}</td>
                      )}
                      <td className="px-4 py-3.5">
                        <Pasos n={c.nSlots} />
                      </td>
                      <td className="px-4 py-3.5">
                        {!cargandoFilas && (
                          <span className={["inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1 text-13 font-semibold", e.cls].join(" ")}>
                            <span className={["h-1.5 w-1.5 rounded-full", e.dot].join(" ")} />
                            {e.txt}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {sinNada && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <p className="font-display text-lg font-semibold">Aún no hay combos</p>
                <p className="max-w-sm text-sm text-ink-2">
                  Un combo es un producto por pasos: la caja pregunta qué hamburguesa, qué acompañamiento y qué bebida.
                </p>
                <Button onClick={() => router.push(hrefConMenu("/catalogo/combos/nuevo", menuHref))}>Crear el primer combo</Button>
              </div>
            )}
          </div>
        )}

        {combos !== null && combos.length > 0 && (
          <>
            <p className="mt-4 text-13 text-ink-2">
              <b className="text-ink">{combos.length}</b> {combos.length === 1 ? "combo" : "combos"}
            </p>
            {/* Un combo nuevo nace PAUSADO (lib/combos.ts: crearCombo). Sin este aviso, el dueño
                ve "Pausado" en la tabla y no sabe que le toca a él publicarlo. */}
            <p className="mt-1 text-13 text-ink-2">
              Un combo nuevo nace <b className="text-ink">Pausado</b> porque todavía no tiene
              pasos. Ábrelo, agrégale sus pasos y elige <b className="text-ink">Se vende</b> para
              que la caja lo ofrezca.
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}
