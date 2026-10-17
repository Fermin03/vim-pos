"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Icono } from "@vim/ui/styles";
import { ZONA_MX } from "@vim/fecha";
import type { Producto } from "../lib/catalogo";
import { buscarVentaPorFolio, buscarVentasConProducto, leerVentaDevolvible, leerVentasTurno, type VentaDevolvible, type VentaTurno } from "../lib/devoluciones";
import { listarTicketsEnEspera } from "../lib/espera";
import { buscarPorCodigo, filasCuentas, renglonVenta, type FilaCuenta } from "../lib/tienda";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { useEscaner } from "../lib/use-escaner";
import { esEscritorio } from "../lib/actualizacion";
import { listarCuentasParaLlevar } from "./modal-cuentas-para-llevar";

/** pos-retail.md, «Cambio de talla» · «Lo que no hace». */
const FACTURADA = "Esta venta está facturada. Haz la devolución desde Devoluciones.";

type Busqueda = { titulo: string; ventas: VentaDevolvible[]; vacio: string };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: ZONA_MX, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const fila = "flex min-h-14 w-full items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-left transition-transform duration-150 ease-vim active:scale-[.99]";

/**
 * Transacciones de la tienda (pos-retail.md, «Versión 2»): arriba las cuentas abiertas (se tocan y
 * se cargan en el Panel), luego las ventas del turno, y búsqueda por folio o escaneando una prenda
 * (30 días). Aquí el escaneo nunca agrega al ticket. Al tocar una venta, su detalle con Reimprimir,
 * Devolver y Cambio de talla.
 */
export function SeccionTransacciones({
  caja,
  turno,
  token,
  productos,
  escaneoIgnorado,
  onAbrirCuenta,
  onRetomar,
  onDevolver,
  onCambio,
  onReimprimir,
}: {
  caja: DatosCaja;
  turno: Turno;
  token: string;
  productos: Producto[];
  /** Un diálogo o el aviso de un pedido encima: el escaneo no hace nada. */
  escaneoIgnorado: boolean;
  onAbrirCuenta: (ticketId: string) => void;
  /** Una cuenta en espera de antes: se retoma como siempre. */
  onRetomar: (ticketId: string, etiqueta: string) => void;
  onDevolver: (ticketId: string) => void;
  onCambio: (ticketId: string) => void;
  onReimprimir: (ticketId: string) => Promise<void>;
}) {
  const [cuentas, setCuentas] = useState<FilaCuenta[] | null>(null);
  const [ventas, setVentas] = useState<VentaTurno[] | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [folio, setFolio] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<VentaDevolvible | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [errorImpresion, setErrorImpresion] = useState<string | null>(null);
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  useEffect(() => {
    Promise.all([listarCuentasParaLlevar(token, caja.sucursal_id), listarTicketsEnEspera(token, turno.caja_id)])
      .then(([a, e]) => { if (montado.current) setCuentas(filasCuentas(a, e)); })
      .catch((e) => { if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las cuentas abiertas"); });
    leerVentasTurno(token, turno.id)
      .then((v) => { if (montado.current) setVentas(v); })
      .catch((e) => { if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las ventas"); });
  }, [token, caja.sucursal_id, turno.caja_id, turno.id]);

  function ver(v: VentaDevolvible) {
    setElegida(v.ticketId);
    setDetalle(v);
    setErrorImpresion(null);
  }

  async function verDelTurno(ticketId: string) {
    setElegida(ticketId);
    setDetalle(null);
    setErrorImpresion(null);
    try {
      const v = await leerVentaDevolvible(token, ticketId);
      if (!montado.current) return;
      if (v) setDetalle(v);
      else { setElegida(null); setError("No se pudo abrir esa venta."); }
    } catch (e) {
      if (montado.current) { setElegida(null); setError(e instanceof Error ? e.message : "No se pudo leer la venta"); }
    }
  }

  async function buscar(fn: () => Promise<VentaDevolvible[]>, b: Omit<Busqueda, "ventas">) {
    setBuscando(true);
    setError(null);
    try {
      const v = await fn();
      if (!montado.current) return;
      setBusqueda({ ...b, ventas: v });
      // Una sola venta (lo normal con el folio): su detalle se abre de una vez.
      if (v.length === 1) ver(v[0]!);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudo buscar");
    } finally {
      if (montado.current) setBuscando(false);
    }
  }

  function buscarFolio() {
    const f = folio.trim();
    if (!f) return;
    setFolio("");
    void buscar(async () => {
      const v = await buscarVentaPorFolio(token, f, caja.sucursal_id);
      return v ? [v] : [];
    }, { titulo: `Folio ${f}`, vacio: `No encontramos una venta cobrada con el folio ${f}.` });
  }

  // El lector busca las ventas que llevan esa prenda; aquí nunca agrega al ticket del Panel.
  useEscaner((codigo) => {
    if (escaneoIgnorado || buscando) return;
    const p = buscarPorCodigo(productos, codigo);
    if (!p) { setBusqueda({ titulo: `Código ${codigo}`, ventas: [], vacio: `No encontramos el código ${codigo}.` }); return; }
    void buscar(() => buscarVentasConProducto(token, p.id, caja.sucursal_id), {
      titulo: `Últimos 30 días · ${p.nombre}`,
      vacio: `Ninguna venta de los últimos 30 días lleva ${p.nombre}.`,
    });
  }, true);

  async function reimprimir(ticketId: string) {
    setImprimiendo(true);
    setErrorImpresion(null);
    try { await onReimprimir(ticketId); }
    catch (e) { if (montado.current) setErrorImpresion(e instanceof Error ? e.message : "No se pudo reimprimir"); }
    finally { if (montado.current) setImprimiendo(false); }
  }

  const filaVenta = (v: { ticketId: string; folio: string; total: number; fechaCobro: string | null; conDevolucion: boolean }, alTocar: () => void) => (
    <button key={v.ticketId} type="button" onClick={alTocar} aria-current={elegida === v.ticketId ? "true" : undefined}
      className={`${fila} ${elegida === v.ticketId ? "border-accent bg-accent-soft" : "border-line"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-15 font-bold">{v.folio}</span>
          {v.conDevolucion && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">Con devolución</span>}
        </div>
        {v.fechaCobro && <div className="mt-0.5 text-12 text-ink-3">{fechaHora(v.fechaCobro)}</div>}
      </div>
      <span className="font-display text-16 font-bold tabular-nums">{fmtMxn(v.total)}</span>
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-4 px-6 pt-6">
        <h1 className="mr-auto font-display text-24 font-semibold tracking-tight">Transacciones</h1>
        <form className="flex w-full max-w-[420px] items-center gap-2" onSubmit={(e) => { e.preventDefault(); buscarFolio(); }}>
          <input
            data-escaner="busqueda"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="Folio del ticket"
            aria-label="Folio del ticket"
            className="h-11 min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 text-14 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          />
          <Button type="submit" variant="ghost" disabled={buscando || folio.trim() === ""}>{buscando ? "Buscando…" : "Buscar"}</Button>
        </form>
      </div>
      <p className="flex-shrink-0 px-6 pt-1.5 text-right text-12 text-ink-3">O escanea una prenda para ver las ventas de los últimos 30 días que la llevan.</p>
      {error && <div className="mx-6 mt-3 flex-shrink-0 rounded border border-danger-line bg-danger-soft px-3 py-2 text-13 font-medium text-danger" role="alert">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 px-6 pb-6 pt-4">
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {busqueda ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-15 font-semibold text-ink">{busqueda.titulo}</h2>
                <Button variant="ghost" onClick={() => setBusqueda(null)}>Ventas del turno</Button>
              </div>
              {busqueda.ventas.length === 0 ? (
                <div className="mt-6 flex flex-col items-center gap-2 text-center text-ink-3">
                  <p className="text-16 font-semibold text-ink-2">{busqueda.vacio}</p>
                  <p className="max-w-[400px] text-13">
                    {/* La caja instalada solo tiene sus propias ventas; el POS web, las del negocio. */}
                    {esEscritorio()
                      ? "Aquí salen las ventas cobradas en esta caja. Si se cobró en otra caja o sucursal, búscala en la caja que la cobró o en el POS web."
                      : "Revisa el folio impreso en el ticket, o escanea otra prenda."}
                  </p>
                </div>
              ) : (
                busqueda.ventas.map((v) => filaVenta({ ...v, conDevolucion: v.renglones.some((r) => r.devuelta > 0) }, () => ver(v)))
              )}
            </>
          ) : (
            <>
              <h2 className="text-13 font-semibold text-ink-3">Cuentas abiertas</h2>
              {cuentas === null ? (
                <p className="text-13 text-ink-3">Cargando…</p>
              ) : cuentas.length === 0 ? (
                <p className="text-13 text-ink-3">No hay cuentas abiertas.</p>
              ) : (
                cuentas.map((c) => (
                  <button key={c.ticketId} type="button" className={`${fila} border-line`}
                    onClick={() => (c.etiquetaEspera !== null ? onRetomar(c.ticketId, c.etiquetaEspera) : onAbrirCuenta(c.ticketId))}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-15 font-bold">{c.titulo}</span>
                        {c.etiquetaEspera !== null && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">En espera</span>}
                      </div>
                      {c.folio && <div className="mt-0.5 text-12 text-ink-3">{c.folio}</div>}
                    </div>
                    <span className="font-display text-16 font-bold tabular-nums">{fmtMxn(c.monto)}</span>
                    <Icono nombre="chevron-derecha" className="h-4 w-4 text-ink-3" />
                  </button>
                ))
              )}
              <h2 className="mt-4 text-13 font-semibold text-ink-3">Ventas del turno</h2>
              {ventas === null ? (
                <p className="text-13 text-ink-3">Cargando…</p>
              ) : ventas.length === 0 ? (
                <p className="text-13 text-ink-3">Todavía no hay ventas en este turno.</p>
              ) : (
                ventas.map((v) => filaVenta({ ...v, conDevolucion: v.tieneDevolucion }, () => void verDelTurno(v.ticketId)))
              )}
            </>
          )}
        </div>

        <section aria-label="Detalle de la venta" className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
          {!elegida ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-ink-3">
              <Icono nombre="recibo" className="h-10 w-10" />
              <p className="text-15">Toca una venta para ver su detalle.</p>
            </div>
          ) : !detalle ? (
            <p className="p-6 text-13 text-ink-3">Cargando venta…</p>
          ) : (
            <>
              <div className="flex flex-shrink-0 items-baseline justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <div className="font-display text-18 font-bold">{detalle.folio}</div>
                  {detalle.fechaCobro && <div className="mt-0.5 text-13 text-ink-3">{fechaHora(detalle.fechaCobro)}</div>}
                </div>
                <div className="font-display text-24 font-bold tabular-nums">{fmtMxn(detalle.total)}</div>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-5">
                {detalle.renglones.map((r) => {
                  const { nombre, detalle: variante } = renglonVenta(r, productos);
                  return (
                    <li key={r.ticket_item_id} className="flex items-start gap-3 py-3">
                      <span className="w-8 flex-shrink-0 font-display text-14 font-bold tabular-nums text-ink-2">{r.cantidad}×</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-14 font-semibold text-ink">{nombre}</div>
                        {variante && <div className="mt-0.5 text-12 text-ink-3">{variante}</div>}
                        {r.devuelta > 0 && <div className="mt-0.5 text-12 font-semibold text-warning">{r.devuelta} devuelta{r.devuelta === 1 ? "" : "s"}</div>}
                      </div>
                      <span className="font-display text-14 font-bold tabular-nums">{fmtMxn(r.total)}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-shrink-0 flex-col gap-3 border-t border-line px-5 py-4">
                {errorImpresion && <p className="text-13 font-medium text-danger" role="alert">{errorImpresion}</p>}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void reimprimir(detalle.ticketId)} disabled={imprimiendo}>
                    {imprimiendo ? "Imprimiendo…" : "Reimprimir"}
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => onDevolver(detalle.ticketId)}>Devolver</Button>
                  {!detalle.facturada && <Button variant="ghost" className="flex-1" onClick={() => onCambio(detalle.ticketId)}>Cambio de talla</Button>}
                </div>
                {detalle.facturada && <p className="text-13 text-ink-3">{FACTURADA}</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
