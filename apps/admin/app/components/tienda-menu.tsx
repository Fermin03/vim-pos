"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@vim/ui/styles";
import { Interruptor } from "./interruptor";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje } from "./tienda-mensaje";
import { precioMxn } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";
import { cambiarMenuTienda, leerMenuTienda, mostrarProductosTienda, type MenuTiendaLeido } from "../lib/tienda";
import { arbolMenu, conCambio, inverso, resumenCategoria, type CambioMenu, type CategoriaMenu } from "../lib/tienda-menu";
import type { SucursalTienda } from "../lib/tienda-reglas";

const enlace = "whitespace-nowrap font-semibold underline underline-offset-2";
const boton =
  "h-11 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

const claveDe = (c: Pick<CambioMenu, "tipo" | "id">) => `${c.tipo}:${c.id}`;

/**
 * Qué categorías y productos enseña cada sucursal en su tienda. Todo nace visible; apagar un
 * interruptor lo esconde en ESA sucursal. Cada toque se guarda al momento: se pinta primero y, si la
 * base lo rechaza, se regresa a como estaba y se dice por qué. No comparte la «una escritura a la
 * vez» del resto de la página: aquí cada interruptor es su propia fila.
 */
export function TiendaMenu({ sucursales, soloLectura }: { sucursales: SucursalTienda[]; soloLectura: boolean }) {
  const idSelector = useId();
  const participan = useMemo(() => sucursales.filter((s) => s.participa), [sucursales]);
  const [elegida, setElegida] = useState<string | null>(null);
  // Si la elegida dejó de vender en la tienda, se pasa a la primera que sí.
  const sucursalId = (participan.find((s) => s.id === elegida) ?? participan[0])?.id ?? null;

  /** Lo leído, con la sucursal de la que es: al cambiar de sucursal, lo viejo no se pinta. */
  const [leido, setLeido] = useState<{ sucursalId: string; menu: MenuTiendaLeido } | null>(null);
  const [falloLectura, setFalloLectura] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  /** Los interruptores con un guardado en curso. El ref es la guarda; el estado, lo que se pinta. */
  const enCurso = useRef(new Set<string>());
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursalId) return;
    let vivo = true;
    setFalloLectura(null);
    setError(null);
    leerMenuTienda(sucursalId).then(
      (menu) => { if (vivo) setLeido({ sucursalId, menu }); },
      (e: unknown) => { if (vivo) setFalloLectura(mensajeError(e, "No se pudo leer tu catálogo.")); },
    );
    return () => { vivo = false; };
  }, [sucursalId, intento]);

  const menu = leido !== null && leido.sucursalId === sucursalId ? leido.menu : null;
  const arbol = useMemo(() => (menu ? arbolMenu(menu.categorias, menu.productos, menu.ocultos) : []), [menu]);
  const hayCombos = useMemo(() => menu?.productos.some((p) => p.esCombo) ?? false, [menu]);

  /**
   * Pinta los cambios, los guarda y, si no entraron, los deshace uno por uno (no se restaura una
   * foto: entre tanto pudo entrar otro interruptor). Si el dueño ya cambió de sucursal, lo leído es
   * de otra y no se toca.
   */
  async function guardar(clave: string, cambios: CambioMenu[], accion: (sucursal: string) => Promise<void>) {
    const sucursal = sucursalId;
    if (!sucursal || soloLectura || enCurso.current.has(clave)) return;
    const pintar = (cs: CambioMenu[]) =>
      setLeido((l) => (l && l.sucursalId === sucursal ? { ...l, menu: { ...l.menu, ocultos: cs.reduce(conCambio, l.menu.ocultos) } } : l));
    enCurso.current.add(clave);
    setGuardando(new Set(enCurso.current));
    setError(null);
    pintar(cambios);
    try {
      await accion(sucursal);
    } catch (e) {
      pintar(cambios.map(inverso));
      setError(`${mensajeError(e, "No se pudo guardar el cambio.")} Quedó como estaba.`);
    }
    enCurso.current.delete(clave);
    setGuardando(new Set(enCurso.current));
  }

  const cambiar = (c: CambioMenu) => void guardar(claveDe(c), [c], (s) => cambiarMenuTienda(s, c));
  const mostrarTodos = (cat: CategoriaMenu) =>
    void guardar(`todos:${cat.id}`, cat.escondidos.map((id) => ({ tipo: "producto", id, escondido: false })), (s) => mostrarProductosTienda(s, cat.escondidos));

  function alternar(id: string) {
    setAbiertas((a) => {
      const n = new Set(a);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  return (
    <Tarjeta
      titulo="Menú de la tienda"
      descripcion="Todo lo de tu catálogo aparece en tu tienda. Apaga lo que no quieras vender en línea en esta sucursal."
    >
      {sucursalId === null ? (
        <p className="text-13 text-ink-2">Primero elige, en «Sucursales», cuál vende en la tienda.</p>
      ) : (
        <>
          {participan.length > 1 && (
            <div className="mb-4 flex flex-col gap-1.5">
              <label htmlFor={idSelector} className="text-13 font-semibold">Sucursal</label>
              <select
                id={idSelector}
                value={sucursalId}
                onChange={(e) => setElegida(e.target.value)}
                className="h-11 w-full max-w-[320px] rounded border border-line-strong bg-surface px-3 text-16 outline-none focus:border-ink md:text-14"
              >
                {participan.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}

          {falloLectura ? (
            <div role="alert">
              <p className="text-sm font-medium text-danger">{falloLectura}</p>
              <button type="button" onClick={() => setIntento((n) => n + 1)} className={cn(boton, "mt-3")}>Reintentar</button>
            </div>
          ) : menu === null ? (
            <p className="text-13 text-ink-3">Cargando…</p>
          ) : arbol.length === 0 ? (
            <p className="text-13 text-ink-2">
              Tu catálogo todavía no tiene productos.{" "}
              <Link href="/catalogo" className={enlace}>Ir al catálogo</Link>
            </p>
          ) : (
            <>
              <LineaMensaje mensaje={error ? { tipo: "error", texto: error } : null} className="mb-3" />
              <ul className="divide-y divide-line rounded border border-line">
                {arbol.map((cat) => (
                  <li key={cat.id}>
                    <Categoria
                      categoria={cat}
                      abierta={abiertas.has(cat.id)}
                      soloLectura={soloLectura}
                      guardando={guardando}
                      onAlternar={alternar}
                      onCambiar={cambiar}
                      onMostrarTodos={mostrarTodos}
                    />
                  </li>
                ))}
              </ul>
              {hayCombos && (
                <p className="mt-3 text-13 text-ink-2">
                  Esconder un producto no lo quita de los combos: sigue siendo una opción dentro de los combos que sí se muestran.
                </p>
              )}
            </>
          )}
        </>
      )}
    </Tarjeta>
  );
}

function Categoria({
  categoria: c,
  abierta,
  soloLectura,
  guardando,
  onAlternar,
  onCambiar,
  onMostrarTodos,
}: {
  categoria: CategoriaMenu;
  abierta: boolean;
  soloLectura: boolean;
  guardando: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onCambiar: (c: CambioMenu) => void;
  onMostrarTodos: (c: CategoriaMenu) => void;
}) {
  const idLista = useId();
  const mostrandoTodos = guardando.has(`todos:${c.id}`);
  return (
    <>
      <div className="flex items-start gap-2 py-3 pl-4 pr-1">
        <div className="min-w-0 flex-1">
          <Interruptor
            etiqueta={c.nombre}
            nombreAccesible={`Mostrar en la tienda la categoría ${c.nombre}`}
            descripcion={resumenCategoria(c)}
            encendido={!c.escondida}
            deshabilitado={soloLectura}
            ocupado={guardando.has(claveDe({ tipo: "categoria", id: c.id }))}
            onCambiar={(visible) => onCambiar({ tipo: "categoria", id: c.id, escondido: !visible })}
          />
        </div>
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={idLista}
          aria-label={`${abierta ? "Cerrar" : "Ver"} los productos de ${c.nombre}`}
          onClick={() => onAlternar(c.id)}
          className="-my-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-colors hover:text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className={cn("transition-transform duration-150 ease-vim motion-reduce:transition-none", abierta && "rotate-180")}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Los productos se pintan hasta que se abre la categoría: un catálogo de cientos no pesa. */}
      {abierta && (
        <div id={idLista} className="border-t border-line bg-hover px-4 pb-2 pt-1">
          {c.escondidos.length > 0 && !c.escondida && !soloLectura && (
            <button type="button" onClick={() => onMostrarTodos(c)} disabled={mostrandoTodos} className={cn(boton, "mb-1 mt-2 bg-surface")}>
              Mostrar todos
            </button>
          )}
          <ul>
            {c.productos.map((p) => {
              const manda = p.nota === null && !c.escondida;
              return (
                <li key={p.id} className={cn("flex min-h-[44px] items-start justify-between gap-3 py-2.5", !manda && "text-ink-3")}>
                  <div className="min-w-0 flex-1">
                    <Interruptor
                      etiqueta={p.nombre}
                      nombreAccesible={`Mostrar en la tienda: ${p.nombre}`}
                      descripcion={p.nota ?? (c.escondida ? "Categoría escondida" : undefined)}
                      encendido={manda && !p.escondido}
                      deshabilitado={soloLectura || !manda}
                      ocupado={mostrandoTodos || guardando.has(claveDe({ tipo: "producto", id: p.id }))}
                      onCambiar={(visible) => onCambiar({ tipo: "producto", id: p.id, escondido: !visible })}
                    />
                  </div>
                  <span className="flex-shrink-0 pt-0.5 text-14 tabular-nums text-ink-2">{precioMxn(p.precio)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
