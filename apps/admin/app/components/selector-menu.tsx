"use client";
/**
 * Qué menú se está administrando en el Catálogo (ADR 0029).
 *
 * Antes el menú de una sucursal eran excepciones escondidas en Productos; ahora es un menú con
 * nombre y se elige aquí, arriba de las pestañas, igual en Categorías, Productos, Combos,
 * Modificadores y Recetas. La elección viaja como la sucursal de los reportes: en la URL
 * (`?menu=`) y entre pantallas (localStorage). Con una sola sucursal y sin menús propios no hay
 * nada que elegir y la franja no se pinta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { mensajeError } from "../lib/errores";
import {
  MENU_GENERAL,
  elegirMenuInicial,
  eliminarMenu,
  hayMenus,
  listarMenus,
  sucursalesDe,
  type Menu,
  type MenuId,
  type SucursalDeMenu,
} from "../lib/menus";
import { ModalMenu } from "./modal-menu";

const CLAVE = "vim.catalogo.menu";

export type MenuCatalogo = {
  menus: Menu[];
  sucursales: SucursalDeMenu[];
  /** El menú elegido: el id de un menú propio o `MENU_GENERAL`. */
  id: MenuId;
  /** «General» o el nombre del menú propio. */
  nombre: string;
  esGeneral: boolean;
  /** ¿Se pinta la franja? (dos o más sucursales, o algún menú propio) */
  visible: boolean;
  /** `false` hasta saber qué menú mirar: antes de eso no se consulta nada por menú. */
  listo: boolean;
  /**
   * No se pudieron leer los menús. Mientras esté, NADIE guarda precio ni «se vende»: sin saber qué
   * menús hay, todo se vería como el General y un cambio pensado para un menú propio caería ahí.
   */
  error: string | null;
  cambiar: (id: MenuId) => void;
  recargar: () => Promise<void>;
};

function recordar(valor: MenuId) {
  const u = new URL(window.location.href);
  u.searchParams.set("menu", valor);
  window.history.replaceState(window.history.state, "", u);
  try {
    localStorage.setItem(CLAVE, valor);
  } catch {
    /* sin almacenamiento: la elección vive solo en la URL */
  }
}

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function useMenuCatalogo(): MenuCatalogo {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [sucursales, setSucursales] = useState<SucursalDeMenu[]>([]);
  const [id, setId] = useState<MenuId>(MENU_GENERAL);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vivo = useRef(true);
  // ¿Falta elegir el menú inicial? Sí hasta la primera lectura buena (también si llega al reintentar).
  const faltaElegir = useRef(true);

  /** Lee los menús. No lanza: si falla, deja el motivo en `error` y la franja ofrece reintentar. */
  const recargar = useCallback(async () => {
    try {
      const r = await listarMenus();
      if (!vivo.current) return;
      setMenus(r.menus);
      setSucursales(r.sucursales);
      setError(null);
      if (faltaElegir.current) {
        faltaElegir.current = false;
        const inicial = elegirMenuInicial(r.menus, new URLSearchParams(window.location.search).get("menu"), leerGuardado());
        setId(inicial);
        if (hayMenus(r.menus, r.sucursales)) recordar(inicial);
      } else {
        // Si el menú elegido ya no existe (lo borraron en otra pestaña), se vuelve al General.
        setId((actual) => (actual === MENU_GENERAL || r.menus.some((m) => m.id === actual) ? actual : MENU_GENERAL));
      }
    } catch (e) {
      if (vivo.current) setError(mensajeError(e, "No se pudieron cargar los menús. Mientras tanto no se guardan precios ni lo que se vende."));
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void recargar().finally(() => {
      if (vivo.current) setListo(true);
    });
    return () => {
      vivo.current = false;
    };
  }, [recargar]);

  const cambiar = useCallback((nuevo: MenuId) => {
    setId(nuevo);
    recordar(nuevo);
  }, []);

  const esGeneral = id === MENU_GENERAL;
  return {
    menus,
    sucursales,
    id,
    nombre: esGeneral ? "General" : (menus.find((m) => m.id === id)?.nombre ?? "General"),
    esGeneral,
    visible: hayMenus(menus, sucursales),
    listo,
    error,
    cambiar,
    recargar,
  };
}

const pastilla =
  "inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-3 text-13 transition-[color,background-color,border-color,transform] duration-150 ease-vim active:scale-[.97] lg:min-h-0 lg:py-1.5";
// El menú elegido va en tinta sólida, como el atajo activo de `rango-fechas.tsx`: antes solo cambiaban
// el borde y el peso de la letra, y entre tres pastillas no se distinguía cuál se estaba editando.
const pastillaActiva = "border-ink bg-ink font-semibold text-white";
const pastillaInactiva = "border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink";

/**
 * La franja de menús: una pastilla por menú con las sucursales que lo usan, «Nuevo menú», y
 * «Editar» / «Eliminar» sobre el menú propio elegido. `nota` es una línea opcional bajo la franja
 * (p. ej. «Los modificadores son los mismos en todos los menús.»).
 */
export function FranjaMenus({ menu, nota }: { menu: MenuCatalogo; nota?: string }) {
  const [modal, setModal] = useState<"nuevo" | "editar" | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (menu.error) {
    return (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sel px-4 py-2.5 lg:px-8">
        <p className="text-13 font-medium text-danger" role="alert">{menu.error}</p>
        <Button variant="ghost" onClick={() => void menu.recargar()}>Reintentar</Button>
      </div>
    );
  }
  if (!menu.visible) return null;

  const elegido = menu.menus.find((m) => m.id === menu.id) ?? null;
  const nombresDe = (id: MenuId) => {
    const ss = sucursalesDe(id, menu.sucursales).map((s) => s.nombre);
    return ss.length ? ss.join(", ") : "sin sucursales";
  };

  async function confirmarBorrado() {
    if (!elegido) return;
    setBorrando(true);
    setError(null);
    try {
      await eliminarMenu(elegido.id);
      setBorrar(false);
      menu.cambiar(MENU_GENERAL);
      await menu.recargar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo eliminar el menú"));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="flex-shrink-0 border-b border-line bg-sel px-4 py-2.5 lg:px-8">
      <div className="scroll-x-limpio flex items-center gap-2 overflow-x-auto lg:flex-wrap lg:overflow-x-visible">
        <span className="flex-shrink-0 text-13 font-medium text-ink-2">Menú</span>
        {[{ id: MENU_GENERAL, nombre: "General" }, ...menu.menus].map((m) => {
          const activo = m.id === menu.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={activo}
              onClick={() => menu.cambiar(m.id)}
              className={[pastilla, activo ? pastillaActiva : pastillaInactiva].join(" ")}
            >
              {m.nombre}
              <span className={["font-normal", activo ? "text-white/75" : "text-ink-3"].join(" ")}>· {nombresDe(m.id)}</span>
            </button>
          );
        })}
        <span className="ml-auto flex flex-shrink-0 items-center gap-2">
          {elegido && (
            <>
              <Button variant="ghost" onClick={() => setModal("editar")}>Editar</Button>
              <Button variant="ghost" onClick={() => setBorrar(true)}>Eliminar</Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setModal("nuevo")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[16px] w-[16px]" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Nuevo menú
          </Button>
        </span>
      </div>
      {nota && <p className="mt-2 text-13 text-ink-2">{nota}</p>}
      {error && !borrar && <p className="mt-2 text-13 font-medium text-danger" role="alert">{error}</p>}

      {modal && (
        <ModalMenu
          menu={modal === "editar" ? elegido : null}
          menus={menu.menus}
          sucursales={menu.sucursales}
          onCerrar={() => setModal(null)}
          onGuardado={async (id) => {
            setModal(null);
            await menu.recargar();
            menu.cambiar(id);
          }}
        />
      )}

      {borrar && elegido && (
        <DialogoPeligro
          error={error}
          titulo={`¿Eliminar ${elegido.nombre}?`}
          consecuencia={
            elegido.sucursales.length > 0 ? (
              <>
                <b className="text-ink">{elegido.sucursales.map((s) => s.nombre).join(", ")}</b>{" "}
                {elegido.sucursales.length === 1 ? "volverá" : "volverán"} a usar el menú General.
              </>
            ) : (
              <>Ninguna sucursal lo usa. Sus precios y lo que tenía apagado se pierden.</>
            )
          }
          boton="Eliminar menú"
          ocupado={borrando}
          textoOcupado="Eliminando…"
          ancho="sm"
          onConfirmar={confirmarBorrado}
          onCerrar={() => {
            setBorrar(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
