"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono, Modal } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import { agruparTienda, buscarVitrina, destinoInventario, estadoExistencia, resumenVitrina, type DestinoInventario, type Existencia } from "../lib/tienda";
import { useEscaner } from "../lib/use-escaner";
import { sonarError } from "./venta-retail";
import { piezas, SelectorVariantes, textoActualizado } from "./selector-variantes";

type Pestana = "existencias" | "recibir";
/** Con la lista corta y sin búsqueda no se pintan miles de renglones: se escribe o se escanea. */
const MAXIMO = 60;

const ETIQUETA = { normal: null, pocas: "Pocas", agotada: "Agotada" } as const;
const COLOR = { normal: "text-ink", pocas: "text-warning", agotada: "text-danger" } as const;

/**
 * Inventario de la tienda (pos-retail.md, «Versión 2 · Inventario»). «Existencias»: buscar o escanear
 * una prenda y ver su existencia por talla y color, en esta sucursal y en las demás, solo lectura;
 * escanear aquí nunca agrega al ticket. «Recibir» es de la Tarea 7: por ahora el hueco y el aviso de permiso.
 */
export function SeccionInventario({
  productos,
  existencias,
  sucursalId,
  sucursales,
  actualizadoA,
  escaneoIgnorado,
  puedeRecibir,
  onCambiarCajero,
  onAbierto,
}: {
  productos: Producto[];
  /** null = aún no se leyeron: nada se enseña como agotado. */
  existencias: Existencia[] | null;
  sucursalId: string;
  sucursales: { id: string; nombre: string }[];
  /** Hora ISO del último pull; `null` en el POS web («al momento»). */
  actualizadoA: string | null;
  /** Un diálogo o el aviso de un pedido encima: el escaneo no hace nada. */
  escaneoIgnorado: boolean;
  puedeRecibir: boolean;
  onCambiarCajero: () => void;
  /** Con una consulta a la vista, cómo cerrarla (o `null`): la pila de Escape de home-pos. */
  onAbierto: (cerrar: (() => void) | null) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("existencias");
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<DestinoInventario | null>(null);
  /** La franja de arriba: un código desconocido o un padre sin variantes. Se va con el siguiente escaneo. */
  const [aviso, setAviso] = useState<string | null>(null);
  const { vitrina, padres } = useMemo(() => agruparTienda(productos), [productos]);

  const avisar = useRef(onAbierto);
  avisar.current = onAbierto;
  useEffect(() => { avisar.current(destino ? () => setDestino(null) : null); }, [destino]);
  useEffect(() => () => avisar.current(null), []);

  /** Abre la consulta; un padre sin hijas no tiene matriz que enseñar. */
  const mostrar = (d: DestinoInventario) => {
    if ("padre" in d && d.padre.hijas.length === 0) { setDestino(null); setAviso("Sin tallas cargadas."); return; }
    setAviso(null);
    setDestino(d);
  };

  // Escáner: abre (o cambia a) la consulta de esa prenda. Solo en Existencias; un diálogo encima lo calla.
  useEscaner((codigo) => {
    if (escaneoIgnorado) return;
    const d = destinoInventario(productos, padres, codigo);
    setTexto("");
    if (d) mostrar(d);
    else { setDestino(null); setAviso(`No encontramos el código ${codigo}.`); sonarError(); }
  }, pestana === "existencias");

  const visibles = useMemo(() => {
    const lista = texto.trim() ? buscarVitrina(vitrina, padres, texto) : [...vitrina].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return lista.slice(0, MAXIMO);
  }, [vitrina, padres, texto]);

  const abrir = (p: Producto) => {
    const padre = padres.get(p.id);
    mostrar(padre ? { padre } : { suelto: p });
  };
  /** Enter a mano: un código exacto abre su consulta; si no, un solo resultado. */
  const alEnter = () => {
    const d = destinoInventario(productos, padres, texto);
    if (d) mostrar(d);
    else if (visibles.length === 1) abrir(visibles[0]!);
    else return;
    setTexto("");
  };

  const pestanaBoton = (id: Pestana, nombre: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={pestana === id}
      onClick={() => setPestana(id)}
      className={[
        "h-11 rounded-lg border px-5 text-14 font-semibold transition-[transform,background-color,border-color,color] duration-150 ease-vim active:scale-[.97]",
        pestana === id ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-ink",
      ].join(" ")}
    >
      {nombre}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-4 border-b border-line bg-surface px-4 py-3">
        <h1 className="font-display text-20 font-semibold tracking-tight">Inventario</h1>
        <div role="tablist" aria-label="Inventario" className="flex gap-2">
          {pestanaBoton("existencias", "Existencias")}
          {pestanaBoton("recibir", "Recibir")}
        </div>
      </div>

      {pestana === "existencias" ? (
        <>
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
            <label className="relative flex h-14 min-w-0 flex-1 items-center rounded-lg border border-line-strong bg-surface focus-within:border-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="ml-4 h-6 w-6 flex-shrink-0 text-ink-2">
                <path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14" />
              </svg>
              <input
                data-escaner="busqueda"
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); alEnter(); } }}
                placeholder="Escanea o busca por nombre o SKU…"
                aria-label="Escanea o busca por nombre o SKU"
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-16 text-ink outline-none placeholder:text-ink-3"
              />
              {texto && (
                <button
                  type="button"
                  onClick={() => setTexto("")}
                  aria-label="Limpiar búsqueda"
                  className="mr-1.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]"
                >
                  <Icono nombre="cerrar" className="h-5 w-5" />
                </button>
              )}
            </label>
            <span className="flex-shrink-0 text-13 text-ink-3">{escaneoIgnorado ? "Lector en pausa" : "Lector listo"}</span>
          </div>
          {aviso && (
            <div className="flex flex-shrink-0 items-center gap-3 bg-danger-soft px-4 py-1.5" role="alert">
              <p className="min-w-0 flex-1 text-13 font-medium text-danger">{aviso}</p>
              <button
                type="button"
                onClick={() => setAviso(null)}
                aria-label="Cerrar aviso"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger/10 active:scale-[.97]"
              >
                <Icono nombre="cerrar" className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-4">
            {visibles.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="font-display text-18 font-semibold">{texto.trim() ? "Nada coincide con la búsqueda" : "Sin productos"}</p>
                <p className="max-w-md text-14 text-ink-3">{texto.trim() ? "Revisa el nombre o el SKU, o escanea la etiqueta." : "Crea productos en el admin para empezar."}</p>
              </div>
            ) : (
              <ul className="mx-auto flex max-w-3xl flex-col gap-2">
                {visibles.map((p) => {
                  const r = resumenVitrina(p, padres, existencias ?? [], sucursalId);
                  const lleva = existencias !== null && (padres.has(p.id) || p.controla_existencias === true);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => abrir(p)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.99]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-15 font-semibold text-ink">{p.nombre}</span>
                          {p.codigo_interno && <span className="block truncate text-13 text-ink-2">{p.codigo_interno}</span>}
                        </span>
                        {lleva && (
                          <span className={`flex-shrink-0 text-right font-display text-18 font-bold tabular-nums ${COLOR[r.estado]}`}>
                            {piezas(r.piezas)}
                            {ETIQUETA[r.estado] && <span className="ml-2 text-13 font-semibold">{ETIQUETA[r.estado]}</span>}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {visibles.length === MAXIMO && <p className="mt-3 text-center text-13 text-ink-3">Hay más productos: escribe o escanea para acotar.</p>}
          </div>
        </>
      ) : puedeRecibir ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-15 text-ink-2">Próximamente.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-md text-15 text-ink-2">Pide a un administrador que entre con su PIN para recibir.</p>
          <button
            type="button"
            onClick={onCambiarCajero}
            className="h-11 rounded-lg border border-line-strong bg-surface px-5 text-14 font-semibold text-ink transition-[transform,background-color,border-color] duration-150 ease-vim hover:border-ink active:scale-[.97]"
          >
            Cambiar cajero
          </button>
        </div>
      )}

      {destino && "padre" in destino && (
        <SelectorVariantes
          soloConsulta
          padre={destino.padre}
          existencias={existencias}
          sucursalId={sucursalId}
          sucursales={sucursales}
          actualizadoA={actualizadoA}
          marcada={destino.marcada}
          onCerrar={() => setDestino(null)}
        />
      )}
      {destino && "suelto" in destino && (
        <ExistenciaSuelta
          producto={destino.suelto}
          existencias={existencias}
          sucursalId={sucursalId}
          sucursales={sucursales}
          actualizadoA={actualizadoA}
          onCerrar={() => setDestino(null)}
        />
      )}
    </div>
  );
}

/** Un producto sin variantes: su existencia en cada sucursal, en una lista corta. */
function ExistenciaSuelta({ producto, existencias, sucursalId, sucursales, actualizadoA, onCerrar }: {
  producto: Producto;
  existencias: Existencia[] | null;
  sucursalId: string;
  sucursales: { id: string; nombre: string }[];
  actualizadoA: string | null;
  onCerrar: () => void;
}) {
  // Sin la lista de sucursales (falló su lectura) queda al menos la propia.
  const filas = sucursales.length ? sucursales : [{ id: sucursalId, nombre: "Esta sucursal" }];
  return (
    <Modal open onClose={onCerrar} title={producto.nombre} hideTitle className="flex max-h-[calc(100vh-32px)] w-full max-w-lg flex-col rounded-lg bg-surface shadow-xl">
      <div className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-20 font-bold leading-tight text-ink">{producto.nombre}</p>
          {producto.codigo_interno && <p className="mt-1 text-13 text-ink-2">{producto.codigo_interno}</p>}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 transition-[transform,background-color] duration-150 ease-vim hover:bg-hover active:scale-[.97]"
        >
          <Icono nombre="cerrar" className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {!producto.controla_existencias ? (
          <p className="text-14 text-ink-2">Este producto no lleva existencias.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filas.map((s) => {
              const e = existencias?.find((x) => x.producto_id === producto.id && x.sucursal_id === s.id);
              const cantidad = e?.cantidad ?? 0;
              const estado = estadoExistencia(cantidad, e?.minimo ?? null);
              return (
                <li key={s.id} className="flex min-h-11 items-center gap-3 rounded border border-line px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-14 font-semibold text-ink">
                    {s.nombre}
                    {s.id === sucursalId && filas.length > 1 && <span className="ml-2 text-13 font-normal text-ink-2">Esta sucursal</span>}
                  </span>
                  <span className={`font-display text-18 font-bold tabular-nums ${existencias ? COLOR[estado] : "text-ink"}`}>
                    {existencias ? piezas(cantidad) : "—"}
                  </span>
                  {existencias && ETIQUETA[estado] && <span className={`text-13 font-semibold ${COLOR[estado]}`}>{ETIQUETA[estado]}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {sucursales.length > 1 && <p className="mt-3 text-13 text-ink-2">Solo para consultar · {textoActualizado(actualizadoA)}</p>}
      </div>
    </Modal>
  );
}
