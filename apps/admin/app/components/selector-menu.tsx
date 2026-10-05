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
import { useCallback, useEffect, useState } from "react";
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

  const recargar = useCallback(async () => {
    const r = await listarMenus();
    setMenus(r.menus);
    setSucursales(r.sucursales);
    // Si el menú elegido ya no existe (lo borraron en otra pestaña), se vuelve al General.
    setId((actual) => (actual === MENU_GENERAL || r.menus.some((m) => m.id === actual) ? actual : MENU_GENERAL));
  }, []);

  useEffect(() => {
    let vivo = true;
    listarMenus()
      .then((r) => {
        if (!vivo) return;
        const inicial = elegirMenuInicial(r.menus, new URLSearchParams(window.location.search).get("menu"), leerGuardado());
        setMenus(r.menus);
        setSucursales(r.sucursales);
        setId(inicial);
        if (hayMenus(r.menus, r.sucursales)) recordar(inicial);
      })
      // Si no se pueden leer los menús, el Catálogo se ve como siempre (el General) en vez de nada.
      .catch(() => {})
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

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
    cambiar,
    recargar,
  };
}

const pastilla = "inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-3 text-13 transition-colors lg:min-h-0 lg:py-1.5";

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
              className={[pastilla, activo ? "border-ink bg-surface font-semibold text-ink" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"].join(" ")}
            >
              {m.nombre}
              <span className="font-normal text-ink-3">· {nombresDe(m.id)}</span>
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
