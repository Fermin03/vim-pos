"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icono, Modal } from "@vim/ui/styles";
import type { Producto } from "../lib/catalogo";
import { agruparTienda, buscarVitrina, destinoInventario, estadoExistencia, renglonTienda, resumenVitrina, type DestinoInventario, type Existencia, type PadreTienda } from "../lib/tienda";
import { useEscaner } from "../lib/use-escaner";
import { avisoCantidad, ExistenciasApagadas, masUna, recibirEnCaja, textoRecibido, SinPermisoRecibir } from "../lib/recibir-caja";
import { sonarError } from "./venta-retail";
import { aGranel, unidadDeVenta } from "../lib/unidades";
import { piezas, SelectorVariantes, textoActualizado } from "./selector-variantes";

type Pestana = "existencias" | "recibir";
/** Con la lista corta y sin búsqueda no se pintan miles de renglones: se escribe o se escanea. */
const MAXIMO = 60;

type RenglonRecibir = { producto: Producto; cantidad: string };
const soloNumero = (v: string) => v.replace(/[^0-9.]/g, "");
const cuantos = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

const ETIQUETA = { normal: null, pocas: "Pocas", agotada: "Agotada" } as const;
const COLOR = { normal: "text-ink", pocas: "text-warning", agotada: "text-danger" } as const;

/**
 * Inventario de la tienda (pos-retail.md, «Versión 2 · Inventario»). «Existencias»: buscar o escanear
 * una prenda y ver su existencia por talla y color, en esta sucursal y en las demás, solo lectura;
 * escanear aquí nunca agrega al ticket. «Recibir»: escanear suma 1 por pieza, sin costo ni proveedor
 * (se capturan en el admin). Lo capturado vive aquí; `onPendiente` dice cuántos renglones hay para que
 * home-pos pregunte antes de dejar la sección.
 */
export function SeccionInventario({
  productos,
  existencias,
  sucursalId,
  sucursales,
  actualizadoA,
  escaneoIgnorado,
  puedeRecibir,
  token,
  onRecibido,
  onPendiente,
  confirmarDescarte,
  onCambiarCajero,
  onAbierto,
  productoInicial,
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
  token: string;
  /** Tras recibir: leer las existencias de nuevo. */
  onRecibido: () => void;
  /** Renglones capturados sin recibir (0 = nada que perder). */
  onPendiente: (n: number) => void;
  /** Pregunta antes de descartar `n` renglones; `true` = descartar. */
  confirmarDescarte: (n: number) => Promise<boolean>;
  onCambiarCajero: () => void;
  /** Con una consulta a la vista, cómo cerrarla (o `null`): la pila de Escape de home-pos. */
  onAbierto: (cerrar: (() => void) | null) => void;
  /** Una prenda (desde Notificaciones): abre su consulta al montarse. */
  productoInicial?: string | null;
}) {
  const [pestana, setPestana] = useState<Pestana>("existencias");
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState<DestinoInventario | null>(null);
  const [deAlerta, setDeAlerta] = useState(false);
  /** La franja de arriba: un código desconocido o un padre sin variantes. Se va con el siguiente escaneo. */
  const [aviso, setAviso] = useState<string | null>(null);
  const { vitrina, padres } = useMemo(() => agruparTienda(productos), [productos]);

  // Recibir: lo capturado vive aquí para que cambiar de pestaña o de sección pueda preguntar.
  const [renglones, setRenglones] = useState<RenglonRecibir[]>([]);
  const [referencia, setReferencia] = useState("");
  const [selectorRecibir, setSelectorRecibir] = useState<PadreTienda | null>(null);
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  /** Tras editar una cantidad o la referencia, el foco vuelve aquí: el escáner ignora ráfagas en otros campos. */
  const buscar = useRef<HTMLInputElement>(null);
  const alEnterCampo = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); buscar.current?.focus(); } };
  /** Sin Enter (teclado táctil): si el foco no va a otro control, regresa al buscador. */
  const alSoltarCampo = (e: React.FocusEvent) => { if (e.relatedTarget === null) buscar.current?.focus(); };
  const [errorRecibir, setErrorRecibir] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);

  const avisar = useRef(onAbierto);
  avisar.current = onAbierto;
  useEffect(() => {
    avisar.current(destino ? () => setDestino(null) : selectorRecibir ? () => setSelectorRecibir(null) : null);
  }, [destino, selectorRecibir]);
  useEffect(() => () => avisar.current(null), []);
  const pendiente = useRef(onPendiente);
  pendiente.current = onPendiente;
  useEffect(() => { pendiente.current(renglones.length); }, [renglones.length]);
  useEffect(() => () => pendiente.current(0), []);

  /** Cambiar de pestaña con renglones capturados pregunta antes de tirarlos. */
  const irAPestana = async (id: Pestana) => {
    if (id === pestana) return;
    if (pestana === "recibir" && renglones.length > 0) {
      if (!(await confirmarDescarte(renglones.length))) return;
      setRenglones([]);
      setReferencia("");
      setErrorRecibir(null);
    }
    setTexto("");
    setAviso(null);
    setDestino(null);
    setSelectorRecibir(null);
    setListo(null);
    setPestana(id);
  };

  /** Una pieza más de esta prenda: escanear otra vez la misma suma 1 a su renglón. */
  const agregar = (p: Producto) => {
    // La base rechazaría todo el lote por uno que no lleva existencias; `undefined` = aún no se sabe, ella decide.
    if (p.controla_existencias === false) { setAviso("Ese producto no lleva existencias."); sonarError(); return; }
    setAviso(null);
    setListo(null);
    setErrorRecibir(null);
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto.id === p.id);
      if (i < 0) return [...rs, { producto: p, cantidad: "1" }];
      const cantidad = masUna(rs[i]!.cantidad);
      return rs.map((r, j) => (j === i ? { ...r, cantidad } : r));
    });
  };

  /** Un código o una prenda elegida a mano: una pieza suelta o una talla suma; un padre abre su selector. */
  const recibirDestino = (d: DestinoInventario) => {
    setAviso(null);
    if ("suelto" in d) { agregar(d.suelto); return; }
    const marcada = d.marcada ? d.padre.hijas.find((h) => h.id === d.marcada) : undefined;
    if (marcada) { agregar(marcada); return; }
    if (d.padre.hijas.length === 0) { setAviso("Sin tallas cargadas."); return; }
    setSelectorRecibir(d.padre);
  };

  /** Abre la consulta; un padre sin hijas no tiene matriz que enseñar. */
  const mostrar = (d: DestinoInventario, alerta = false) => {
    setDeAlerta(alerta);
    if ("padre" in d && d.padre.hijas.length === 0) { setDestino(null); setAviso("Sin tallas cargadas."); return; }
    setAviso(null);
    setDestino(d);
  };

  useEffect(() => {
    const p = productoInicial ? productos.find((x) => x.id === productoInicial) : undefined;
    if (!p) return;
    const padre = padres.get(p.producto_padre_id ?? p.id);
    mostrar(padre ? { padre, marcada: p.producto_padre_id ? p.id : undefined } : { suelto: p }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montarse
  }, []);

  // Escáner: abre (o cambia a) la consulta de esa prenda. Solo en Existencias; un diálogo encima lo calla.
  useEscaner((codigo) => {
    if (escaneoIgnorado) return;
    const d = destinoInventario(productos, padres, codigo);
    setTexto("");
    if (d) mostrar(d);
    else { setDestino(null); setAviso(`No encontramos el código ${codigo}.`); sonarError(); }
  }, pestana === "existencias");

  // Escáner de Recibir: solo en esa pestaña y con permiso; un diálogo encima lo calla.
  const puede = puedeRecibir && !sinPermiso;
  useEscaner((codigo) => {
    if (escaneoIgnorado || selectorRecibir || guardando) return;
    const d = destinoInventario(productos, padres, codigo);
    setTexto("");
    if (d) recibirDestino(d);
    else { setAviso(`No encontramos el código ${codigo}.`); sonarError(); }
  }, pestana === "recibir" && puede);

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

  const abrirRecibir = (p: Producto) => {
    const padre = padres.get(p.id);
    recibirDestino(padre ? { padre } : { suelto: p });
    setTexto("");
  };
  const alEnterRecibir = () => {
    const d = destinoInventario(productos, padres, texto);
    if (d) recibirDestino(d);
    else if (visibles.length === 1) abrirRecibir(visibles[0]!);
    else return;
    setTexto("");
  };

  const avisos = renglones.map((r) => avisoCantidad(r.cantidad));
  const sePuede = renglones.length > 0 && avisos.every((a) => a === null) && !guardando;
  const recibir = async () => {
    if (!sePuede || enviando.current) return;
    enviando.current = true;
    setGuardando(true);
    setErrorRecibir(null);
    try {
      const n = await recibirEnCaja({
        token,
        sucursalId,
        lineas: renglones.map((r) => ({ productoId: r.producto.id, cantidad: Number(r.cantidad) })),
        referencia,
      });
      setRenglones([]);
      setReferencia("");
      setListo(textoRecibido(n));
      onRecibido();
    } catch (e) {
      // Sin el permiso de productos la base lo dice aquí, aunque el rol pareciera bastar.
      if (e instanceof SinPermisoRecibir) { setSinPermiso(true); setRenglones([]); setReferencia(""); } // nada invisible que perder
      else if (e instanceof ExistenciasApagadas) setErrorRecibir("Las existencias están apagadas para este negocio.");
      else setErrorRecibir(e instanceof Error ? e.message : "No se pudo recibir la mercancía");
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  };

  const pestanaBoton = (id: Pestana, nombre: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={pestana === id}
      onClick={() => void irAPestana(id)}
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

      {pestana === "recibir" && !puede ? (
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
      ) : (
        <>
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
            <label className="relative flex h-14 min-w-0 flex-1 items-center rounded-lg border border-line-strong bg-surface focus-within:border-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="ml-4 h-6 w-6 flex-shrink-0 text-ink-2">
                <path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14" />
              </svg>
              <input
                ref={buscar}
                data-escaner="busqueda"
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (pestana === "recibir" ? alEnterRecibir : alEnter)(); } }}
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

          {pestana === "recibir" ? (
            <div className="flex min-h-0 flex-1 flex-col bg-bg">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  {texto.trim() ? (
                    visibles.length === 0 ? (
                      <p className="py-8 text-center text-14 text-ink-3">Nada coincide. Revisa el nombre o el SKU, o escanea la etiqueta.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {visibles.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => abrirRecibir(p)}
                              className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-[transform,border-color] duration-150 ease-vim hover:border-ink active:scale-[.99]"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-15 font-semibold text-ink">{p.nombre}</span>
                                {p.codigo_interno && <span className="block truncate text-13 text-ink-2">{p.codigo_interno}</span>}
                              </span>
                              <span className="flex-shrink-0 text-13 font-semibold text-ink-2">{padres.has(p.id) ? "Elegir talla" : "Agregar"}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : renglones.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-center">
                      <p className="font-display text-18 font-semibold">Escanea lo que llega</p>
                      <p className="max-w-md text-14 text-ink-3">Cada lectura suma una pieza. También puedes buscar por nombre o SKU.</p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {renglones.map((r, i) => {
                        const { nombre, detalle } = renglonTienda(r.producto, productos);
                        return (
                          <li key={r.producto.id} className="flex min-h-14 items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-15 font-semibold text-ink">{nombre}</span>
                              {detalle && <span className="block truncate text-13 text-ink-2">{detalle}</span>}
                              {avisos[i] && <span className="block text-13 font-medium text-danger" role="alert">{avisos[i]}</span>}
                            </span>
                            <input
                              aria-label={`Cantidad de ${nombre}`}
                              inputMode="decimal"
                              value={r.cantidad}
                              onChange={(e) => {
                                const cantidad = soloNumero(e.target.value);
                                setRenglones((rs) => rs.map((x) => (x.producto.id === r.producto.id ? { ...x, cantidad } : x)));
                              }}
                              data-escaner="campo-recibir"
                              onKeyDown={alEnterCampo}
                              onBlur={alSoltarCampo}
                              className="h-11 w-24 flex-shrink-0 rounded border border-line-strong bg-surface px-3 text-right font-display text-18 font-bold tabular-nums text-ink outline-none focus:border-ink"
                            />
                            {aGranel(r.producto.tipoVenta) && <span className="-ml-1.5 flex-shrink-0 text-15 font-semibold text-ink-2">{unidadDeVenta(r.producto.tipoVenta).abrev}</span>}
                            <button
                              type="button"
                              onClick={() => setRenglones((rs) => rs.filter((x) => x.producto.id !== r.producto.id))}
                              className="h-11 flex-shrink-0 rounded px-3 text-14 font-semibold text-danger transition-[transform,background-color] duration-150 ease-vim hover:bg-danger-soft active:scale-[.97]"
                            >
                              Quitar
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 border-t border-line bg-surface px-4 py-3">
                <div className="mx-auto flex max-w-3xl flex-wrap items-end gap-3">
                  <label className="flex min-w-48 flex-1 flex-col gap-1 text-13 font-medium text-ink-2">
                    Remisión o factura · opcional
                    <input
                      value={referencia}
                      maxLength={100}
                      onChange={(e) => setReferencia(e.target.value)}
                      data-escaner="campo-recibir"
                      onKeyDown={alEnterCampo}
                      onBlur={alSoltarCampo}
                      placeholder="Ej. F-1234"
                      autoComplete="off"
                      className="h-11 rounded border border-line-strong bg-surface px-3 text-15 font-normal text-ink outline-none placeholder:text-ink-3 focus:border-ink"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!sePuede}
                    onClick={() => void recibir()}
                    className="h-11 flex-shrink-0 rounded-lg bg-accent px-5 text-15 font-bold text-white transition-[transform,background-color,opacity] duration-150 ease-vim hover:bg-accent-hover active:scale-[.97] disabled:cursor-default disabled:opacity-40 disabled:active:scale-100"
                  >
                    {guardando ? "Recibiendo…" : `Recibir ${cuantos(renglones.length)}`}
                  </button>
                </div>
                {errorRecibir && <p className="mx-auto mt-2 max-w-3xl text-14 font-medium text-danger" role="alert">{errorRecibir}</p>}
                {listo && <p className="mx-auto mt-2 max-w-3xl text-14 font-medium text-success" role="status">{listo}</p>}
              </div>
            </div>
          ) : (
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
                            {piezas(r.piezas, p.tipoVenta)}
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
          )}
        </>
      )}

      {selectorRecibir && (
        <SelectorVariantes
          paraRecibir
          padre={selectorRecibir}
          existencias={existencias}
          sucursalId={sucursalId}
          sucursales={[]}
          actualizadoA={actualizadoA}
          onElegir={(hija) => { agregar(hija); setSelectorRecibir(null); }}
          onCerrar={() => setSelectorRecibir(null)}
        />
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
          etiquetaMarcada={deAlerta ? "La de la alerta" : undefined}
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
    <Modal open onClose={onCerrar} title={producto.nombre} hideTitle className="flex max-h-[calc(100dvh-32px)] w-full max-w-lg flex-col rounded-lg bg-surface shadow-xl">
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
                    {existencias ? piezas(cantidad, producto.tipoVenta) : "—"}
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
