"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icono, LogoVim, Cargando } from "@vim/ui/styles";
import { ZONA_MX } from "@vim/fecha";
import { BotonVolver } from "./boton-volver";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { SelectorVariantes } from "./selector-variantes";
import { useEscape } from "../lib/use-escape";
import { useEscaner } from "../lib/use-escaner";
import { esEscritorio } from "../lib/actualizacion";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { nuevoClientId } from "../lib/carrito";
import { CambioRechazado, registrarCambio, resumenCambio, type CambioRegistrado } from "../lib/cambio-talla";
import type { Producto } from "../lib/catalogo";
import {
  buscarVentaPorFolio,
  buscarVentasConProducto,
  leerVentaDevolvible,
  leerVentasTurno,
  aCentavos,
  ROLES_DEVOLUCION,
  totalDevolucion,
  type RenglonVenta,
  type VentaDevolvible,
  type VentaTurno,
} from "../lib/devoluciones";
import { obtenerImpresora } from "../lib/print/adapter";
import { type Empleado } from "../lib/supabase";
import { agruparTienda, buscarPorCodigo, decidirEscaneo, type Existencia, type PadreTienda } from "../lib/tienda";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { aGranel, fmtCantidad, tipoDesdeSat } from "../lib/unidades";

/** pos-retail.md, «Lo que no hace». */
const FACTURADA = "Esta venta está facturada. Haz la devolución en Transacciones, con «Devolver».";
const PASOS = ["Venta", "Qué regresa", "Qué se lleva", "Listo"];

type Busqueda = { titulo: string; ventas: VentaDevolvible[]; vacio: string; marcar?: string };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: ZONA_MX, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Cambio de talla (pos-retail.md, «Cambio de talla»): cuatro pasos a pantalla completa. La venta
 * (folio, turno o escaneando la prenda), qué regresa, qué se lleva (el selector de la misma prenda
 * con «La que regresa» marcada) y el resumen del dinero. Confirmar llama `registrar_cambio_talla`:
 * con saldo, `onCobrar` abre el cobro de siempre; sin saldo, el ticket ya está pagado y se imprime.
 *
 * ponytail: una prenda por cambio (con sus piezas); varias prendas se hacen como devolución + venta.
 */
export function PantallaCambioTalla({
  token,
  caja,
  turno,
  empleado,
  productos,
  existencias,
  sucursales,
  actualizadoA,
  escaneoIgnorado,
  ventaInicial,
  onSalir,
  onCobrar,
  onImprimir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  productos: Producto[];
  existencias: Existencia[] | null;
  sucursales: { id: string; nombre: string }[];
  actualizadoA: string | null;
  /** Un aviso de home-pos encima (pedido de la tienda en línea): el escaneo no hace nada. */
  escaneoIgnorado: boolean;
  /** El id de la venta ya elegida en Transacciones: arranca en el paso 2 y `Volver` desde ahí sale. */
  ventaInicial?: string;
  onSalir: () => void;
  /** Cambio con saldo: la venta nueva quedó ABIERTA; home-pos la carga y abre su cobro. */
  onCobrar: (ticketId: string, saldo: number) => void;
  /** Cambio sin saldo: imprime el ticket de la venta nueva (ya PAGADA). */
  onImprimir: (ticketId: string) => Promise<void>;
}) {
  const [paso, setPaso] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // Paso 1
  const [ventasTurno, setVentasTurno] = useState<VentaTurno[] | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [folio, setFolio] = useState("");
  const [buscando, setBuscando] = useState(false);
  // Pasos 2 a 4
  const [venta, setVenta] = useState<VentaDevolvible | null>(null);
  const [regresa, setRegresa] = useState<{ ticketItemId: string; cantidad: number } | null>(null);
  const [lleva, setLleva] = useState<Producto | null>(null);
  const [selector, setSelector] = useState<PadreTienda | null>(null);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [hecho, setHecho] = useState<CambioRegistrado | null>(null);
  const [impresion, setImpresion] = useState<"imprimiendo" | "ok" | "error">("imprimiendo");
  const [cajonFallo, setCajonFallo] = useState(false);
  // La llave del intento: un reintento tras un corte de red no registra el cambio dos veces.
  const clientId = useRef(nuevoClientId());
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  useEffect(() => {
    leerVentasTurno(token, turno.id)
      .then((v) => { if (montado.current) setVentasTurno(v); })
      .catch((e) => { if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las ventas"); });
  }, [token, turno.id]);

  const padres = useMemo(() => agruparTienda(productos).padres, [productos]);
  // Lo que se vende por kilo, metro o litro no entra a un cambio: se devuelve completo.
  const vendibles = useMemo(() => productos.filter((p) => p.seVendeAqui !== false && !aGranel(p.tipoVenta)), [productos]);
  const cambiable = (r: RenglonVenta) => r.cantidad - r.devuelta >= 1 && !aGranel(tipoDesdeSat(r.unidad_sat));
  const renglon: RenglonVenta | undefined = venta?.renglones.find((r) => r.ticket_item_id === regresa?.ticketItemId);
  const productoRegresa = renglon?.producto_id ? productos.find((p) => p.id === renglon.producto_id) : undefined;
  const padreRegresa = productoRegresa?.producto_padre_id ? padres.get(productoRegresa.producto_padre_id) : undefined;
  const piezas = regresa?.cantidad ?? 0;

  // Vista previa para decidir la autorización; lo que se enseña al final es lo que guardó la base.
  const regresaMxn = venta && regresa ? totalDevolucion(venta, [{ ticket_item_id: regresa.ticketItemId, cantidad: regresa.cantidad, regresaAlAnaquel: true }]) : 0;
  // En centavos enteros: 0.1 × 3 no da 0.30000000000000004 en pantalla.
  const llevaMxn = lleva ? (aCentavos(lleva.precio_base_mxn) * piezas) / 100 : 0;
  const resumen = hecho ? resumenCambio(hecho.regresa, hecho.lleva) : resumenCambio(regresaMxn, llevaMxn);

  function atras() {
    if (procesando) return;
    setError(null);
    if (hecho) return onSalir();
    if (paso === 1) return busqueda ? setBusqueda(null) : onSalir();
    if (paso === 2 && ventaInicial) return onSalir();
    setPaso(paso - 1);
  }
  useEscape(atras);

  function abrirVenta(v: VentaDevolvible, marcar?: string) {
    if (v.facturada) { setError(FACTURADA); return; }
    const r = marcar ? v.renglones.find((x) => x.producto_id === marcar && x.cantidad - x.devuelta >= 1) : undefined;
    setError(null);
    setVenta(v);
    clientId.current = nuevoClientId(); // otra venta, otro cambio
    setRegresa(r ? { ticketItemId: r.ticket_item_id, cantidad: 1 } : null);
    setLleva(null);
    setBusqueda(null);
    setFolio("");
    setPaso(2);
  }

  async function buscar(fn: () => Promise<VentaDevolvible[]>, b: Omit<Busqueda, "ventas">) {
    setBuscando(true);
    setError(null);
    try {
      const v = await fn();
      if (!montado.current) return;
      // Una sola venta (lo normal con el folio, y casi siempre escaneando): se abre de una vez.
      if (v.length === 1) abrirVenta(v[0]!, b.marcar);
      else setBusqueda({ ...b, ventas: v });
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudo buscar");
    } finally {
      if (montado.current) setBuscando(false);
    }
  }

  async function abrirVentaTurno(ticketId: string) {
    setError(null);
    try {
      const v = await leerVentaDevolvible(token, ticketId);
      if (!montado.current) return;
      if (v) abrirVenta(v);
      else setError("Esa venta ya no se puede cambiar");
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudo leer la venta");
    }
  }

  // Solo al montar: la venta que se eligió en Transacciones abre de una vez en «Qué regresa».
  useEffect(() => {
    if (ventaInicial) void abrirVentaTurno(ventaInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irAPaso3() {
    setPaso(3);
    setLleva(null);
    if (padreRegresa) setSelector(padreRegresa);
  }

  function elegirLleva(p: Producto) {
    setSelector(null);
    if (p.agotado) { setError("Ese producto no se vende por ahora."); return; }
    setError(null);
    // La llave se conserva: si el intento anterior quedó en duda (la red), este no registra otro cambio.
    setLleva(p);
    setPaso(4);
  }

  // El lector: encendido toda la pantalla para que también bajo el PIN se trague la ráfaga.
  useEscaner((codigo) => {
    if (escaneoIgnorado || pidiendoPin || procesando || buscando || hecho) return;
    if (paso === 1) {
      const p = buscarPorCodigo(productos, codigo);
      if (!p) { setBusqueda({ titulo: `Código ${codigo}`, ventas: [], vacio: `No encontramos el código ${codigo}.` }); return; }
      void buscar(() => buscarVentasConProducto(token, p.id, caja.sucursal_id), {
        titulo: `Últimos 30 días · ${p.nombre}`,
        vacio: `Ninguna venta de los últimos 30 días lleva ${p.nombre}.`,
        marcar: p.id,
      });
      return;
    }
    if (paso === 2) {
      const p = buscarPorCodigo(productos, codigo);
      const r = p && venta?.renglones.find((x) => x.producto_id === p.id && cambiable(x));
      // Otra pieza de la misma prenda suma una, hasta las que quedan por devolver.
      if (r) setRegresa((a) => ({
        ticketItemId: r.ticket_item_id,
        cantidad: a?.ticketItemId === r.ticket_item_id ? Math.min(r.cantidad - r.devuelta, a.cantidad + 1) : 1,
      }));
      else setError(`Esa prenda no está en la venta ${venta?.folio ?? ""}.`);
      return;
    }
    // Pasos 3 y 4: cualquier prenda puede ser la que se lleva.
    const d = decidirEscaneo(vendibles, codigo, { cobroAbierto: false, ignorar: false });
    if (d.tipo === "agregar") elegirLleva(d.producto);
    else if (d.tipo === "selector" && padres.get(d.padre.id)?.hijas.length) setSelector(padres.get(d.padre.id)!);
    else setError(`No encontramos el código ${codigo}.`);
  }, true);

  const payload = (): PayloadAutorizacion => ({
    accion: "devolucion",
    permisoCodigo: "venta.devolucion",
    entidadTipo: "ticket",
    entidadId: venta?.ticketId ?? null,
    monto: regresaMxn,
    motivo: "Cambio de talla",
    cajaId: turno.caja_id,
    turnoId: turno.id,
  });

  async function ejecutar(a: Autorizacion) {
    if (!venta || !regresa || !lleva) return;
    setPidiendoPin(false);
    setProcesando(true);
    setError(null);
    try {
      const r = await registrarCambio({
        token,
        ticketOrigen: venta.ticketId,
        regresa,
        lleva: { productoId: lleva.id, cantidad: regresa.cantidad },
        cajaId: turno.caja_id,
        turnoId: turno.id,
        usuarioId: empleado.id,
        autorizacion: a,
        clientId: clientId.current,
      });
      if (!montado.current) return;
      if (r.diferencia > 0) { onCobrar(r.ticketId, r.diferencia); return; }
      // Ya está pagado: si hay que regresar dinero, el cajón se abre ahora.
      if (r.diferencia < 0) {
        const aMano = () => { if (montado.current) setCajonFallo(true); };
        obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().then((x) => { if (!x.ok) aMano(); }, aMano);
      }
      setHecho(r);
      setProcesando(false);
      void imprimir(r.ticketId);
    } catch (e) {
      if (!montado.current) return;
      // Rechazo definitivo: nada quedó hecho, el siguiente intento lleva llave nueva.
      if (e instanceof CambioRechazado) clientId.current = nuevoClientId();
      setError(e instanceof Error ? e.message : "No se pudo registrar el cambio");
      setProcesando(false);
    }
  }

  async function imprimir(ticketId: string) {
    setImpresion("imprimiendo");
    try {
      await onImprimir(ticketId);
      if (montado.current) setImpresion("ok");
    } catch {
      if (montado.current) setImpresion("error");
    }
  }

  async function confirmar() {
    setError(null);
    // La base siempre pide autorización. Sin dinero que regresar y con el permiso, sale sola;
    // si hay dinero que regresar o falta el permiso, PIN de supervisor (pos-retail.md, decisión 2).
    if (resumen.diferencia < 0 || !ROLES_DEVOLUCION.includes(empleado.rol)) { setPidiendoPin(true); return; }
    setProcesando(true);
    try {
      await ejecutar(await autorizacionPropia(token, payload()));
    } catch (e) {
      if (!montado.current) return;
      // El rol dice que sí, pero el permiso se le quitó a esta persona: lo autoriza un supervisor.
      if (e instanceof Error && e.message === "SIN_PERMISO") { setProcesando(false); setPidiendoPin(true); return; }
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  const piezasTxt = (n: number) => (n === 1 ? "" : `${n} × `);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-3.5">
        <BotonVolver onClick={atras} />
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <LogoVim className="h-8 w-8" />
          <div className="font-display text-16 font-bold leading-tight">Cambio de talla · {caja.nombre}</div>
        </div>
        <ol className="flex items-center gap-3 text-13" aria-label="Pasos">
          {PASOS.map((nombre, i) => (
            <li key={nombre} aria-current={paso === i + 1 ? "step" : undefined}
              className={paso === i + 1 ? "font-semibold text-ink" : paso > i + 1 ? "text-ink-2" : "text-ink-3"}>
              <span className="tabular-nums">{i + 1}</span> {nombre}
            </li>
          ))}
        </ol>
      </header>

      {error && <div className="mx-auto mt-3 w-full max-w-[680px] rounded border border-danger-line bg-danger-soft px-3 py-2 text-13 font-medium text-danger" role="alert">{error}</div>}

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-[680px] flex-col gap-3">
          {paso === 1 && (
            <>
              <form className="flex items-center gap-2" onSubmit={(e) => {
                e.preventDefault();
                const f = folio.trim();
                if (!f) return;
                void buscar(async () => {
                  const v = await buscarVentaPorFolio(token, f, caja.sucursal_id);
                  return v ? [v] : [];
                }, { titulo: `Folio ${f}`, vacio: `No encontramos una venta cobrada con el folio ${f}.` });
              }}>
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
              <p className="-mt-1.5 text-12 text-ink-3">O escanea la etiqueta de la prenda que trae el cliente.</p>

              {busqueda ? (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <h2 className="min-w-0 truncate text-15 font-semibold text-ink">{busqueda.titulo}</h2>
                    <Button variant="ghost" onClick={() => setBusqueda(null)}>Ventas del turno</Button>
                  </div>
                  {busqueda.ventas.length === 0 ? (
                    <div className="mt-8 flex flex-col items-center gap-2 text-center text-ink-3">
                      <Icono nombre="devolver" className="h-12 w-12" />
                      <p className="text-18 font-semibold text-ink-2">{busqueda.vacio}</p>
                      <p className="max-w-[440px] text-13">
                        {esEscritorio()
                          ? "Aquí solo salen ventas de esta caja. Las demás, en el POS web."
                          : "Revisa el folio impreso en el ticket, o escanea otra prenda."}
                      </p>
                    </div>
                  ) : (
                    busqueda.ventas.map((v) => (
                      <FilaVenta key={v.ticketId} folio={v.folio} cuando={v.fechaCobro ? fechaHora(v.fechaCobro) : null} total={v.total}
                        etiqueta={v.facturada ? "Facturada" : null} onElegir={() => abrirVenta(v, busqueda.marcar)} />
                    ))
                  )}
                </>
              ) : (
                <>
                  <h2 className="mt-2 text-15 font-semibold text-ink">Ventas del turno</h2>
                  {ventasTurno === null && <Cargando en="linea" texto="Cargando ventas" />}
                  {ventasTurno?.length === 0 && <p className="text-14 text-ink-3">Aún no hay ventas en el turno. Busca por folio o escanea la prenda.</p>}
                  {ventasTurno?.map((v) => (
                    <FilaVenta key={v.ticketId} folio={v.folio} total={v.total}
                      cuando={v.fechaCobro ? new Date(v.fechaCobro).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : null}
                      etiqueta={v.tieneDevolucion ? "Con devolución" : null} onElegir={() => void abrirVentaTurno(v.ticketId)} />
                  ))}
                </>
              )}
            </>
          )}

          {paso === 2 && venta && (
            <>
              <h2 className="text-15 font-semibold text-ink">¿Qué regresa? · {venta.folio}</h2>
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {venta.renglones.map((r) => {
                  const disponible = r.cantidad - r.devuelta;
                  const elegido = r.ticket_item_id === regresa?.ticketItemId;
                  const granel = aGranel(tipoDesdeSat(r.unidad_sat));
                  const poner = (n: number) => setRegresa({ ticketItemId: r.ticket_item_id, cantidad: Math.max(1, Math.min(disponible, n)) });
                  return (
                    <li key={r.ticket_item_id} className={["flex items-center gap-3 p-3", elegido ? "bg-sel" : ""].join(" ")}>
                      <button type="button" disabled={!cambiable(r)} onClick={() => poner(1)} aria-pressed={elegido}
                        className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded text-left disabled:opacity-50">
                        <span className="truncate text-14 font-medium text-ink">{r.nombre}</span>
                        <span className="text-12 text-ink-3">
                          {granel
                            ? `${fmtCantidad(r.cantidad, tipoDesdeSat(r.unidad_sat))} · se devuelve, no se cambia`
                            : <>{r.cantidad} × {fmtMxn(r.precio_unitario)}{disponible <= 0 ? " · ya devuelto" : r.devuelta > 0 ? ` · ya devueltas ${r.devuelta}` : ""}</>}
                        </span>
                      </button>
                      {elegido && disponible > 1 && (
                        <div className="flex items-center gap-1" role="group" aria-label={`Piezas de ${r.nombre}`}>
                          <button type="button" aria-label="Una pieza menos" disabled={piezas <= 1} onClick={() => poner(piezas - 1)}
                            className="flex h-11 w-11 items-center justify-center rounded border border-line-strong text-18 font-semibold text-ink transition-transform active:scale-[0.97] disabled:opacity-40">−</button>
                          <span className="min-w-[4rem] whitespace-nowrap text-center font-display text-16 font-bold tabular-nums" aria-live="polite">{piezas} de {disponible}</span>
                          <button type="button" aria-label="Una pieza más" disabled={piezas >= disponible} onClick={() => poner(piezas + 1)}
                            className="flex h-11 w-11 items-center justify-center rounded border border-line-strong text-18 font-semibold text-ink transition-transform active:scale-[0.97] disabled:opacity-40">+</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {paso === 3 && renglon && (
            <>
              <LineaCambio etiqueta="Regresa" nombre={`${piezasTxt(piezas)}${renglon.nombre}`} monto={regresaMxn} />
              <div className="mt-6 flex flex-col items-center gap-3 text-center">
                <p className="text-18 font-semibold text-ink-2">¿Qué se lleva?</p>
                <p className="max-w-[440px] text-13 text-ink-3">
                  {padreRegresa ? "Elige la talla y el color, o escanea cualquier otra prenda." : "Escanea la prenda que se lleva."}
                </p>
                {padreRegresa && (
                  <Button variant="ghost" size="lg" onClick={() => setSelector(padreRegresa)}>Elegir talla y color</Button>
                )}
              </div>
            </>
          )}

          {paso === 4 && renglon && lleva && (
            <>
              <LineaCambio etiqueta="Regresa" nombre={`${piezasTxt(piezas)}${renglon.nombre}`} monto={hecho?.regresa ?? regresaMxn} />
              <LineaCambio etiqueta="Se lleva" nombre={`${piezasTxt(piezas)}${lleva.nombre}`} monto={hecho?.lleva ?? llevaMxn} />
              <p className="mt-6 text-center font-display text-32 font-bold tabular-nums text-ink" aria-live="polite">{resumen.texto}</p>
              {hecho ? (
                <p className="text-center text-14 text-ink-2">
                  {impresion === "imprimiendo" ? "Cambio registrado. Imprimiendo el ticket…" : impresion === "ok" ? "Cambio registrado. El ticket ya salió." : "Cambio registrado, pero el ticket no salió."}
                </p>
              ) : (
                resumen.diferencia >= 0 && !ROLES_DEVOLUCION.includes(empleado.rol) && (
                  <p className="text-center text-13 text-ink-3">Un supervisor autoriza el cambio con su PIN.</p>
                )
              )}
              {hecho && cajonFallo && (
                <p className="text-center text-14 font-semibold text-warning" role="alert">Abre el cajón a mano y entrega {fmtMxn(-hecho.diferencia)}.</p>
              )}
              {hecho && impresion === "error" && (
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => void imprimir(hecho.ticketId)}>Volver a imprimir</Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {(paso === 2 || paso === 4) && (
        <footer className="flex flex-shrink-0 justify-end border-t border-line bg-surface px-6 py-3">
          {paso === 2 ? (
            <Button size="lg" disabled={!regresa} onClick={irAPaso3}>Siguiente</Button>
          ) : hecho ? (
            <Button size="lg" onClick={onSalir}>Listo</Button>
          ) : (
            <Button size="lg" disabled={procesando} onClick={() => void confirmar()}>
              {procesando ? "Registrando…" : resumen.diferencia > 0 ? `Cobrar ${fmtMxn(resumen.diferencia)}` : "Confirmar cambio"}
            </Button>
          )}
        </footer>
      )}

      {selector && (
        <SelectorVariantes
          padre={selector}
          existencias={existencias}
          sucursalId={caja.sucursal_id}
          sucursales={sucursales}
          actualizadoA={actualizadoA}
          marcada={renglon?.producto_id ?? undefined}
          onElegir={elegirLleva}
          onCerrar={() => setSelector(null)}
        />
      )}

      {pidiendoPin && venta && (
        <ModalAutorizacionPin
          token={token}
          payload={payload()}
          descripcion={`Cambio de talla de ${venta.folio} · ${resumen.texto}`}
          ejecutaNombre={empleado.nombre}
          onAutorizado={(a) => void ejecutar(a)}
          onCancelar={() => setPidiendoPin(false)}
        />
      )}
    </div>
  );
}

function FilaVenta({ folio, cuando, total, etiqueta, onElegir }: { folio: string; cuando: string | null; total: number; etiqueta: string | null; onElegir: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-15 font-bold">{folio}</span>
          {etiqueta && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">{etiqueta}</span>}
        </div>
        {cuando && <div className="mt-0.5 text-12 text-ink-3">{cuando}</div>}
      </div>
      <div className="font-display text-16 font-bold tabular-nums">{fmtMxn(total)}</div>
      <Button variant="ghost" onClick={onElegir}>Elegir</Button>
    </div>
  );
}

function LineaCambio({ etiqueta, nombre, monto }: { etiqueta: string; nombre: string; monto: number }) {
  return (
    <div className="flex items-baseline gap-3 rounded-lg border border-line bg-surface p-4">
      <span className="w-20 flex-shrink-0 text-13 font-medium text-ink-2">{etiqueta}</span>
      <span className="min-w-0 flex-1 truncate text-16 font-semibold text-ink">{nombre}</span>
      <span className="font-display text-18 font-bold tabular-nums text-ink">{fmtMxn(monto)}</span>
    </div>
  );
}
