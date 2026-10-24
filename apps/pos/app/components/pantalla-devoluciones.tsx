"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotonVolver, ENCABEZADO_PANTALLA } from "./boton-volver";
import { useEscape } from "../lib/use-escape";
import { Button, DialogoPeligro, Icono, Cargando } from "@vim/ui/styles";
import { type DatosCaja, type Turno, fmtMxn } from "../lib/turno";
import { type Empleado } from "../lib/supabase";
import {
  alcanceDevolucion,
  buscarVentaPorFolio,
  cantidadADevolver,
  buscarVentasConProducto,
  cobradoEnTerminal,
  devolverRenglones,
  devolverVenta,
  leerItemsVenta,
  leerVentaDevolvible,
  leerVentasTurno,
  MEDIOS_DEV,
  MOTIVOS_DEV,
  motivosDevolucion,
  ROLES_DEVOLUCION,
  totalDevolucion,
  type ItemVenta,
  type MedioDevolucion,
  type MotivoDevolucion,
  type RenglonDevolver,
  type VentaDevolvible,
  type VentaTurno,
} from "../lib/devoluciones";
import { buscarPorCodigo, comoTienda } from "../lib/tienda";
import { aGranel, contarProductos, fmtCantidad, precioConUnidad, tipoDesdeSat } from "../lib/unidades";
import { useEscaner } from "../lib/use-escaner";
import { esEscritorio } from "../lib/actualizacion";
import type { Producto } from "../lib/catalogo";
import { ZONA_MX } from "@vim/fecha";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { motivoReembolso, reembolsarTicket } from "../lib/terminal";
import { AvisoAutorizacion, MotivoChips, etiquetaMotivo } from "./motivo-y-autorizacion";
import { leerTicketParaImpresion } from "../lib/print/ticket-datos";
import { obtenerImpresora } from "../lib/print/adapter";
import { construirDevolucionJob, type DatosDevolucion } from "../lib/print/devolucion-builder";
import { OverlayReciboDevolucion } from "./recibo-devolucion";

export function PantallaDevoluciones({
  token,
  caja,
  turno,
  empleado,
  productos = [],
  escaneoIgnorado = false,
  ventaInicial,
  onSalir,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  /** El catálogo de la caja: en una tienda, para reconocer la etiqueta escaneada. */
  productos?: Producto[];
  /** Hay un aviso de home-pos encima (pedido de la tienda en línea): el escaneo no hace nada. */
  escaneoIgnorado?: boolean;
  /** Tienda: el id de la venta ya elegida en Transacciones. Se salta la lista y, al terminar o cerrar, sale. */
  ventaInicial?: string;
  onSalir: () => void;
}) {
  const [ventas, setVentas] = useState<VentaTurno[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<VentaTurno | null>(null);
  const [reciboDev, setReciboDev] = useState<DatosDevolucion | null>(null);
  // Tienda: la venta elegida (con sus renglones), lo que trae la búsqueda y el folio tecleado.
  const tienda = comoTienda(caja);
  const [selTienda, setSelTienda] = useState<{ venta: VentaDevolvible; marcar?: string } | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [folio, setFolio] = useState("");
  const [buscando, setBuscando] = useState(false);
  // El recibo de la devolución va encima de la lista: Escape lo cierra a él antes de salir. En una
  // tienda, Escape deja primero la búsqueda y regresa a las ventas del turno.
  // Llegando con la venta elegida, cerrar el recibo es terminar: regresa a Transacciones.
  const cerrarRecibo = () => (ventaInicial ? onSalir() : setReciboDev(null));
  useEscape(reciboDev ? cerrarRecibo : busqueda ? () => setBusqueda(null) : onSalir);
  const montado = useRef(true);

  async function buscar(fn: () => Promise<VentaDevolvible[]>, b: Omit<Busqueda, "ventas">) {
    setBuscando(true);
    setError(null);
    try {
      const v = await fn();
      if (montado.current) setBusqueda({ ...b, ventas: v });
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudo buscar");
    } finally {
      if (montado.current) setBuscando(false);
    }
  }

  function buscarFolio() {
    const f = folio.trim();
    if (!f) return;
    void buscar(async () => {
      const v = await buscarVentaPorFolio(token, f, caja.sucursal_id);
      // Encontrada: se abre de una vez, sin una lista de un solo renglón en medio.
      if (v && montado.current) {
        setSelTienda({ venta: v });
        setFolio("");
      }
      return v ? [v] : [];
    }, { titulo: `Folio ${f}`, vacio: `No encontramos una venta cobrada con el folio ${f}.` });
  }

  // El lector de etiquetas: encendido siempre en una tienda, para que también bajo un diálogo se
  // trague la ráfaga (si no, el código cae en el teclado del PIN y puede mandar uno equivocado).
  // Qué hacer con el código solo aplica con la lista a la vista.
  useEscaner((codigo) => {
    if (sel || selTienda || reciboDev || buscando || escaneoIgnorado) return;
    const p = buscarPorCodigo(productos, codigo);
    if (!p) {
      setBusqueda({ titulo: `Código ${codigo}`, ventas: [], vacio: `No encontramos el código ${codigo}.` });
      return;
    }
    void buscar(() => buscarVentasConProducto(token, p.id, caja.sucursal_id), {
      titulo: `Últimos 30 días · ${p.nombre}`,
      vacio: `Ninguna venta de los últimos 30 días lleva ${p.nombre}.`,
      marcar: p.id,
    });
  }, tienda);

  async function abrirVentaTurno(ticketId: string) {
    setError(null);
    try {
      const v = await leerVentaDevolvible(token, ticketId);
      if (!montado.current) return;
      if (v) setSelTienda({ venta: v });
      else setError("Esa venta ya no se puede devolver");
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudo leer la venta");
    }
  }

  const recargar = useCallback(async () => {
    try {
      const v = await leerVentasTurno(token, turno.id);
      if (montado.current) {
        setVentas(v);
        setError(null);
      }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : "No se pudieron leer las ventas");
    }
  }, [token, turno.id]);

  useEffect(() => {
    montado.current = true;
    recargar();
    return () => {
      montado.current = false;
    };
  }, [recargar]);

  // Solo al montar: la venta que se eligió en Transacciones abre de una vez.
  useEffect(() => {
    if (ventaInicial) void abrirVentaTurno(ventaInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className={`${ENCABEZADO_PANTALLA} bg-surface`}>
        <BotonVolver onClick={onSalir} />
        <div className="mr-auto flex items-center gap-3">
          <div>
            <div className="font-display text-16 font-bold leading-tight">Devoluciones · {caja.nombre}</div>
            <div className="text-12 text-ink-3">Selecciona la venta a devolver. La venta queda en el historial; el reembolso sale de la caja.</div>
          </div>
        </div>
      </header>

      {tienda && (
        <form
          className="mx-auto mt-4 flex w-full max-w-[680px] items-center gap-2 px-6"
          onSubmit={(e) => {
            e.preventDefault();
            buscarFolio();
          }}
        >
          <input
            data-escaner="busqueda"
            value={folio}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="Folio del ticket"
            aria-label="Folio del ticket"
            className="h-11 min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 text-14 outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]"
          />
          <Button type="submit" variant="ghost" disabled={buscando || folio.trim() === ""}>
            {buscando ? "Buscando…" : "Buscar"}
          </Button>
        </form>
      )}
      {tienda && <p className="mx-auto mt-1.5 w-full max-w-[680px] px-6 text-12 text-ink-3">O escanea un código para ver las ventas de los últimos 30 días que lo llevan.</p>}

      {error && <div className="mx-6 mt-3 rounded border border-danger-line bg-danger-soft px-3 py-2 text-13 font-medium text-danger" role="alert">{error}</div>}

      {busqueda ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-[680px] flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-15 font-semibold text-ink">{busqueda.titulo}</h2>
              <Button variant="ghost" onClick={() => setBusqueda(null)}>Ventas del turno</Button>
            </div>
            {busqueda.ventas.length === 0 ? (
              <div className="mt-8 flex flex-col items-center gap-2 text-center text-ink-3">
                <Icono nombre="devolver" className="h-12 w-12" />
                <p className="text-18 font-semibold text-ink-2">{busqueda.vacio}</p>
                <p className="max-w-[440px] text-13">
                  {/* La caja instalada solo tiene sus propias ventas; el POS web, las del negocio. */}
                  {esEscritorio()
                    ? "Aquí salen las ventas cobradas en esta caja. Si se cobró en otra caja o sucursal, devuélvela desde la caja que la cobró o desde el POS web."
                    : "Revisa el folio impreso en el ticket, o escanea otro código."}
                </p>
              </div>
            ) : (
              busqueda.ventas.map((v) => {
                const conDevolucion = v.renglones.some((r) => r.devuelta > 0);
                return (
                  <div key={v.ticketId} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-15 font-bold">{v.folio}</span>
                        {conDevolucion && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">Con devolución</span>}
                      </div>
                      {v.fechaCobro && <div className="mt-0.5 text-12 text-ink-3">{fechaHora(v.fechaCobro)}</div>}
                    </div>
                    <div className="font-display text-16 font-bold tabular-nums">{fmtMxn(v.total)}</div>
                    <Button variant="ghost" onClick={() => setSelTienda({ venta: v, marcar: busqueda.marcar })}>Devolver</Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {ventas === null && <Cargando texto="Cargando ventas" />}
        {ventas !== null && ventas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-3">
            <Icono nombre="devolver" className="h-12 w-12" />
            <p className="text-18 font-semibold text-ink-2">No hay ventas en el turno</p>
            <p className="text-13">Las ventas cobradas aparecerán aquí para poder devolverlas.</p>
          </div>
        )}
        {ventas !== null && ventas.length > 0 && (
          <div className="mx-auto flex max-w-[680px] flex-col gap-2">
            {ventas.map((v) => (
              <div key={v.ticketId} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-15 font-bold">{v.folio}</span>
                    {v.tieneDevolucion && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-11 font-bold text-warning">Con devolución</span>}
                  </div>
                  {v.fechaCobro && (
                    <div className="mt-0.5 text-12 text-ink-3">
                      {new Date(v.fechaCobro).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
                <div className="font-display text-16 font-bold tabular-nums">{fmtMxn(v.total)}</div>
                <Button variant="ghost" onClick={() => (tienda ? void abrirVentaTurno(v.ticketId) : setSel(v))}>Devolver</Button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {selTienda && (
        <ModalDevolucionTienda
          token={token}
          caja={caja}
          turno={turno}
          empleado={empleado}
          venta={selTienda.venta}
          marcar={selTienda.marcar}
          onHecho={(d) => {
            setSelTienda(null);
            setBusqueda(null);
            if (d) setReciboDev(d);
            else if (ventaInicial) return onSalir();
            recargar();
          }}
          onCerrar={() => (ventaInicial ? onSalir() : setSelTienda(null))}
        />
      )}

      {sel && (
        <ModalDevolucion
          token={token}
          caja={caja}
          turno={turno}
          empleado={empleado}
          venta={sel}
          onHecho={(d) => {
            setSel(null);
            if (d) setReciboDev(d);
            recargar();
          }}
          onCerrar={() => setSel(null)}
        />
      )}

      {reciboDev && (
        <OverlayReciboDevolucion
          d={reciboDev}
          onImprimir={() => { obtenerImpresora("CAJA", { onMostrar: () => window.print() }).imprimir(construirDevolucionJob(reciboDev)); }}
          onCerrar={cerrarRecibo}
        />
      )}
    </div>
  );
}

function ModalDevolucion({
  token,
  caja,
  turno,
  empleado,
  venta,
  onHecho,
  onCerrar,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  venta: VentaTurno;
  onHecho: (d?: DatosDevolucion) => void;
  onCerrar: () => void;
}) {
  const [items, setItems] = useState<ItemVenta[] | null>(null);
  const [motivo, setMotivo] = useState<MotivoDevolucion>("PRODUCTO_DEFECTUOSO");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [medio, setMedio] = useState<MedioDevolucion>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  // La devolución ya quedó en VIM pero el proveedor de la terminal no devolvió el dinero: se reintenta solo eso.
  const [reembolsoFallo, setReembolsoFallo] = useState<{ motivo: string; recibo?: DatosDevolucion } | null>(null);

  const tienePermiso = ROLES_DEVOLUCION.includes(empleado.rol);

  /** Regresa el dinero a la tarjeta si ese ticket se cobró en la terminal (ADR 0033). */
  async function reembolsar(recibo?: DatosDevolucion) {
    setProcesando(true);
    try {
      await reembolsarTicket(token, turno.caja_id, venta.ticketId);
      onHecho(recibo);
    } catch (e) {
      setReembolsoFallo({ motivo: motivoReembolso(e), recibo });
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  useEffect(() => {
    leerItemsVenta(token, venta.ticketId).then(setItems).catch(() => setError("No se pudieron leer los ítems"));
  }, [token, venta.ticketId]);

  const labelMotivo = () => etiquetaMotivo(MOTIVOS_DEV, motivo, motivoTexto);

  async function ejecutar(a: Autorizacion) {
    if (!items) return;
    setProcesando(true);
    setError(null);
    try {
      await devolverVenta(token, {
        ticketId: venta.ticketId,
        cajaId: turno.caja_id,
        turnoId: turno.id,
        items: items.map((i) => ({ ticketItemId: i.ticketItemId, cantidadDevuelta: i.cantidad })),
        motivo,
        motivoTexto,
        medio,
        autorizacionPinId: a.autorizacionPinId,
        solicitanteId: empleado.id,
        autorizoId: a.autorizoId,
      });
      // Comprobante de devolución (best-effort: si falla armarlo, la devolución ya quedó).
      let dDev: DatosDevolucion | undefined;
      try {
        const datos = await leerTicketParaImpresion(venta.ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
        dDev = {
          negocio: { nombre: datos.negocio.nombre, rfc: datos.negocio.rfc },
          sucursal: { direccion: datos.sucursal.direccion, telefono: datos.sucursal.telefono },
          folioOriginal: datos.meta.folio,
          fechaIso: new Date().toISOString(),
          cajero: empleado.nombre,
          caja: caja.nombre,
          autorizo: null,
          items: datos.lineas.map((l) => ({ cantidad: l.cantidad, nombre: l.nombre, totalMxn: l.totalMxn, unidadSat: l.unidadSat })),
          motivo: labelMotivo(),
          medio: MEDIOS_DEV.find((m) => m.codigo === medio)?.label ?? medio,
          tarjetas: medio === "MISMO_METODO_PAGO" ? datos.pagos.flatMap((p) => (p.tarjeta ? [p.tarjeta] : [])) : [],
          totalReembolso: venta.total,
          ancho: 80,
        };
      } catch { /* recibo opcional */ }
      if (medio === "MISMO_METODO_PAGO") await reembolsar(dDev);
      else onHecho(dDev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function confirmar() {
    setError(null);
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (!tienePermiso) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      const a = await autorizacionPropia(token, {
        accion: "devolucion",
        permisoCodigo: "venta.devolucion",
        entidadTipo: "ticket",
        entidadId: venta.ticketId,
        monto: venta.total,
        motivo: labelMotivo(),
        cajaId: turno.caja_id,
        turnoId: turno.id,
      });
      await ejecutar(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  if (reembolsoFallo) {
    return (
      <DialogoPeligro
        titulo="El dinero no regresó a la tarjeta"
        contexto={`${venta.folio} · ${fmtMxn(venta.total)}`}
        consecuencia={`La devolución ya quedó registrada, pero el dinero no regresó a la tarjeta: ${reembolsoFallo.motivo}. Vuelve a intentar, o devuélvelo desde la app de tu terminal.`}
        boton="Volver a intentar"
        ocupado={procesando}
        textoOcupado="Devolviendo…"
        onConfirmar={() => void reembolsar(reembolsoFallo.recibo)}
        onCerrar={() => onHecho(reembolsoFallo.recibo)}
      />
    );
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        payload={{ accion: "devolucion", permisoCodigo: "venta.devolucion", entidadTipo: "ticket", entidadId: venta.ticketId, monto: venta.total, motivo: labelMotivo(), cajaId: turno.caja_id, turnoId: turno.id }}
        descripcion={`Devolución de ${venta.folio} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  return (
    <DialogoPeligro
      titulo="Devolver venta"
      contexto={`${venta.folio} · se reembolsan ${fmtMxn(venta.total)}`}
      consecuencia="Se devuelven todos los productos. La venta queda en el historial."
      error={error}
      boton="Devolver venta"
      ocupado={procesando}
      textoOcupado="Devolviendo…"
      deshabilitado={items === null}
      onConfirmar={() => void confirmar()}
      onCerrar={onCerrar}
    >
      {items === null ? (
        <Cargando en="linea" texto="Cargando ítems" />
      ) : (
        <div className="max-h-32 overflow-y-auto rounded border border-line bg-sel p-3 text-13 text-ink-2">
          {items.map((i) => (
            <div key={i.ticketItemId} className="flex justify-between py-0.5">
              <span>{i.cantidad}× {i.nombre}</span>
              <span className="tabular-nums">{fmtMxn(i.totalItem)}</span>
            </div>
          ))}
        </div>
      )}
      <MotivoChips opciones={MOTIVOS_DEV} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <ElegirMedio medio={medio} onCambiar={setMedio} />
      <AvisoAutorizacion propia={tienePermiso} />
    </DialogoPeligro>
  );
}

/** «Reembolso en»: los medios con efecto real. `nota` reemplaza la del medio elegido. */
function ElegirMedio({ medio, onCambiar, nota }: { medio: MedioDevolucion; onCambiar: (m: MedioDevolucion) => void; nota?: string }) {
  const texto = nota ?? MEDIOS_DEV.find((m) => m.codigo === medio)?.nota;
  return (
    <div>
      <div className="mb-1.5 text-13 font-medium text-ink-2">Reembolso en</div>
      <div className="flex gap-2">
        {MEDIOS_DEV.map((m) => (
          <button key={m.codigo} type="button" onClick={() => onCambiar(m.codigo)}
            className={["flex-1 rounded border px-3 py-2 text-13 font-semibold transition", medio === m.codigo ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink"].join(" ")}>
            {m.label}
          </button>
        ))}
      </div>
      {texto && <p className="mt-1.5 text-12 text-ink-3">{texto}</p>}
    </div>
  );
}

type Busqueda = { titulo: string; ventas: VentaDevolvible[]; vacio: string; marcar?: string };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: ZONA_MX, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MOTIVOS_TIENDA = motivosDevolucion(true);

/**
 * Devolución de una tienda (pos-retail.md, «Devoluciones en una tienda»): se eligen renglones y
 * piezas, el total se recalcula en vivo y cada renglón dice si la pieza vuelve al anaquel. Esa
 * respuesta empieza en «No» con «Producto defectuoso» y en «Sí» con lo demás; cambiar el motivo
 * la regresa a su valor de entrada. Autorización y medio, los de siempre.
 */
function ModalDevolucionTienda({
  token,
  caja,
  turno,
  empleado,
  venta,
  marcar,
  onHecho,
  onCerrar,
}: {
  token: string;
  caja: DatosCaja;
  turno: Turno;
  empleado: Empleado;
  venta: VentaDevolvible;
  /** Producto escaneado: su renglón llega con una pieza marcada. */
  marcar?: string;
  onHecho: (d?: DatosDevolucion) => void;
  onCerrar: () => void;
}) {
  const [piezas, setPiezas] = useState<Record<string, number>>(() => {
    // A granel, el escaneo marca el renglón completo (se devuelve todo o nada).
    const r = marcar ? venta.renglones.find((x) => x.producto_id === marcar && cantidadADevolver(x, 1) > 0) : undefined;
    return r ? { [r.ticket_item_id]: cantidadADevolver(r, 1) } : {};
  });
  const [anaquel, setAnaquel] = useState<Record<string, boolean>>({});
  // Sin motivo de entrada: el cajero lo elige (y con él, si la pieza vuelve al anaquel).
  const [motivo, setMotivoBase] = useState<MotivoDevolucion | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");
  const [medio, setMedio] = useState<MedioDevolucion>("EFECTIVO");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [reembolsoFallo, setReembolsoFallo] = useState<{ motivo: string; recibo?: DatosDevolucion } | null>(null);
  // Devolución ya hecha cuyo dinero falta regresar a la tarjeta a mano: se avisa DESPUÉS también.
  const [pendiente, setPendiente] = useState<{ total: number; recibo?: DatosDevolucion } | null>(null);
  // ¿Se cobró en la terminal de Mercado Pago ligada a la caja? Decide dónde se hace el reembolso.
  const [enTerminal, setEnTerminal] = useState(false);
  useEffect(() => {
    cobradoEnTerminal(token, venta.ticketId).then(setEnTerminal).catch(() => {});
  }, [token, venta.ticketId]);

  const tienePermiso = ROLES_DEVOLUCION.includes(empleado.rol);
  const setMotivo = (m: MotivoDevolucion) => {
    setMotivoBase(m);
    setAnaquel({});
  };
  const vuelve = (id: string) => anaquel[id] ?? motivo !== "PRODUCTO_DEFECTUOSO";
  const dondeReembolsar = enTerminal ? "devuélvelo desde la app o la web de Mercado Pago" : "devuélvelo desde la terminal con que se cobró";

  const renglones: RenglonDevolver[] = venta.renglones
    .filter((r) => (piezas[r.ticket_item_id] ?? 0) > 0)
    .map((r) => ({ ticket_item_id: r.ticket_item_id, cantidad: piezas[r.ticket_item_id] ?? 0, regresaAlAnaquel: vuelve(r.ticket_item_id) }));
  const total = totalDevolucion(venta, renglones);
  const tipoDe = (id: string) => tipoDesdeSat(venta.renglones.find((x) => x.ticket_item_id === id)?.unidad_sat);
  const hayGranel = venta.renglones.some((r) => aGranel(tipoDesdeSat(r.unidad_sat)));
  // Con algo a granel en la venta se cuentan productos (cada pesada, 1); si todo es pieza, piezas como siempre.
  const nPiezas = contarProductos(renglones.map((r) => ({ cantidad: r.cantidad, tipo: tipoDe(r.ticket_item_id) })));
  const unidadBoton = hayGranel ? ["producto", "productos"] : ["pieza", "piezas"];
  // El reembolso a la tarjeta de Mercado Pago regresa el cobro COMPLETO: solo va solo cuando esta
  // devolución es la venta entera y nada se había devuelto antes. Por partes se hace a mano.
  const reembolsoAutomatico =
    medio === "MISMO_METODO_PAGO" && alcanceDevolucion(venta, renglones) === "TOTAL" && venta.renglones.every((r) => r.devuelta === 0);
  const tarjetaPendiente = medio === "MISMO_METODO_PAGO" && !reembolsoAutomatico;
  const labelMotivo = () => (motivo ? etiquetaMotivo(MOTIVOS_TIENDA, motivo, motivoTexto) : "");
  const payload: PayloadAutorizacion = { accion: "devolucion", permisoCodigo: "venta.devolucion", entidadTipo: "ticket", entidadId: venta.ticketId, monto: total, motivo: labelMotivo(), cajaId: turno.caja_id, turnoId: turno.id };

  async function reembolsar(recibo?: DatosDevolucion) {
    setProcesando(true);
    try {
      await reembolsarTicket(token, turno.caja_id, venta.ticketId);
      onHecho(recibo);
    } catch (e) {
      setReembolsoFallo({ motivo: motivoReembolso(e), recibo });
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function ejecutar(a: Autorizacion) {
    if (!motivo) return;
    setProcesando(true);
    setError(null);
    try {
      // `hecha.total` es el que guardó la base: ése se enseña, se imprime y se reembolsa.
      const hecha = await devolverRenglones(venta, renglones, motivo, medio, a, {
        token,
        cajaId: turno.caja_id,
        turnoId: turno.id,
        solicitanteId: empleado.id,
        motivoTexto,
        nota: tarjetaPendiente ? `Reembolso a tarjeta pendiente: ${dondeReembolsar}.` : undefined,
      });
      // Comprobante (best-effort: si falla armarlo, la devolución ya quedó).
      let dDev: DatosDevolucion | undefined;
      try {
        const datos = await leerTicketParaImpresion(venta.ticketId, { token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre });
        dDev = {
          negocio: { nombre: datos.negocio.nombre, rfc: datos.negocio.rfc },
          sucursal: { direccion: datos.sucursal.direccion, telefono: datos.sucursal.telefono },
          folioOriginal: datos.meta.folio,
          fechaIso: new Date().toISOString(),
          cajero: empleado.nombre,
          caja: caja.nombre,
          autorizo: null,
          items: renglones.map((r) => {
            const v = venta.renglones.find((x) => x.ticket_item_id === r.ticket_item_id);
            return { cantidad: r.cantidad, nombre: v?.nombre ?? "", totalMxn: totalDevolucion(venta, [r]), unidadSat: v?.unidad_sat ?? null };
          }),
          motivo: labelMotivo(),
          // Si el dinero aún no regresa a la tarjeta, el comprobante no dice «Devuelto a: …».
          medio: tarjetaPendiente
            ? "Tarjeta · reembolso pendiente"
            : (MEDIOS_DEV.find((m) => m.codigo === medio)?.label ?? medio),
          tarjetas: reembolsoAutomatico ? datos.pagos.flatMap((p) => (p.tarjeta ? [p.tarjeta] : [])) : [],
          totalReembolso: hecha.total,
          ancho: 80,
        };
      } catch { /* recibo opcional */ }
      if (reembolsoAutomatico) await reembolsar(dDev);
      else if (tarjetaPendiente) {
        setProcesando(false);
        setPidiendoPin(false);
        setPendiente({ total: hecha.total, recibo: dDev });
      } else onHecho(dDev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo devolver");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function confirmar() {
    setError(null);
    if (renglones.length === 0 || !motivo) return;
    if (motivo === "OTRO" && motivoTexto.trim().length === 0) {
      setError("Describe el motivo");
      return;
    }
    if (!tienePermiso) {
      setPidiendoPin(true);
      return;
    }
    setProcesando(true);
    try {
      await ejecutar(await autorizacionPropia(token, payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar");
      setProcesando(false);
    }
  }

  if (pendiente) {
    return (
      <DialogoPeligro
        peligrosa={false}
        titulo="Falta regresar el dinero a la tarjeta"
        contexto={`${venta.folio} · ${fmtMxn(pendiente.total)}`}
        consecuencia={`La devolución ya quedó registrada, pero por partes el dinero no regresa solo a la tarjeta: ${dondeReembolsar}, por ${fmtMxn(pendiente.total)}.`}
        boton="Listo"
        onConfirmar={() => onHecho(pendiente.recibo)}
        onCerrar={() => onHecho(pendiente.recibo)}
      />
    );
  }

  if (reembolsoFallo) {
    return (
      <DialogoPeligro
        titulo="El dinero no regresó a la tarjeta"
        contexto={venta.folio}
        consecuencia={`La devolución ya quedó registrada, pero el dinero no regresó a la tarjeta: ${reembolsoFallo.motivo}. Vuelve a intentar, o devuélvelo desde la app de Mercado Pago.`}
        boton="Volver a intentar"
        ocupado={procesando}
        textoOcupado="Devolviendo…"
        onConfirmar={() => void reembolsar(reembolsoFallo.recibo)}
        onCerrar={() => onHecho(reembolsoFallo.recibo)}
      />
    );
  }

  if (pidiendoPin) {
    return (
      <ModalAutorizacionPin
        token={token}
        payload={payload}
        descripcion={`Devolución de ${venta.folio} · ${fmtMxn(total)} · ${labelMotivo()}`}
        ejecutaNombre={empleado.nombre}
        onAutorizado={(a) => ejecutar(a)}
        onCancelar={() => setPidiendoPin(false)}
      />
    );
  }

  const notaMedio =
    tarjetaPendiente && renglones.length > 0
      ? `Por partes el dinero no regresa solo a la tarjeta: al confirmar, ${dondeReembolsar}.`
      : undefined;
  const falta = renglones.length === 0 ? `Elige al menos ${hayGranel ? "un producto" : "una pieza"}.` : !motivo ? "Elige el motivo." : undefined;

  return (
    <DialogoPeligro
      ancho="lg"
      titulo="Devolver productos"
      contexto={`${venta.folio}${venta.fechaCobro ? ` · ${fechaHora(venta.fechaCobro)}` : ""}`}
      consecuencia={hayGranel
        ? "Elige qué regresa el cliente. Lo que se vende por kilo, metro o litro se devuelve completo. La venta queda en el historial."
        : "Elige qué regresa el cliente y cuántas piezas. La venta queda en el historial."}
      error={error}
      nota={falta}
      boton={nPiezas === 1 ? `Devolver 1 ${unidadBoton[0]}` : `Devolver ${nPiezas} ${unidadBoton[1]}`}
      ocupado={procesando}
      textoOcupado="Devolviendo…"
      deshabilitado={falta !== undefined}
      onConfirmar={() => void confirmar()}
      onCerrar={onCerrar}
    >
      <ul className="max-h-[40vh] divide-y divide-line overflow-y-auto rounded border border-line">
        {venta.renglones.map((r) => {
          const disponible = r.cantidad - r.devuelta;
          const n = piezas[r.ticket_item_id] ?? 0;
          const tipo = tipoDesdeSat(r.unidad_sat);
          const poner = (v: number) => setPiezas((p) => ({ ...p, [r.ticket_item_id]: cantidadADevolver(r, v) }));
          return (
            <li key={r.ticket_item_id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-14 font-medium text-ink">{r.nombre}</div>
                  <div className="text-12 text-ink-3">
                    {aGranel(tipo) ? fmtCantidad(r.cantidad, tipo) : r.cantidad} × {precioConUnidad(fmtMxn(r.precio_unitario), tipo)}
                    {r.devuelta > 0 && !aGranel(tipo) && ` · ya devueltas ${r.devuelta}`}
                  </div>
                </div>
                {disponible <= 0 ? (
                  <span className="text-13 font-medium text-ink-3">Ya devuelto</span>
                ) : aGranel(tipo) ? (
                  <label className="flex h-11 cursor-pointer items-center gap-2 text-13 font-semibold text-ink">
                    <input type="checkbox" checked={n > 0} onChange={(e) => poner(e.target.checked ? disponible : 0)} className="h-5 w-5 accent-ink" />
                    Devolver los {fmtCantidad(disponible, tipo)}
                  </label>
                ) : (
                  <div className="flex items-center gap-1" role="group" aria-label={`Piezas de ${r.nombre}`}>
                    <button type="button" aria-label="Una pieza menos" disabled={n <= 0} onClick={() => poner(n - 1)}
                      className="flex h-11 w-11 items-center justify-center rounded border border-line-strong text-18 font-semibold text-ink transition-transform active:scale-[0.97] disabled:opacity-40">−</button>
                    <span className="min-w-[4rem] whitespace-nowrap text-center font-display text-16 font-bold tabular-nums" aria-live="polite">{n} de {disponible}</span>
                    <button type="button" aria-label="Una pieza más" disabled={n >= disponible} onClick={() => poner(n + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded border border-line-strong text-18 font-semibold text-ink transition-transform active:scale-[0.97] disabled:opacity-40">+</button>
                  </div>
                )}
              </div>
              {n > 0 && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={vuelve(r.ticket_item_id)}
                  onClick={() => setAnaquel((a) => ({ ...a, [r.ticket_item_id]: !vuelve(r.ticket_item_id) }))}
                  className="flex h-11 items-center justify-between gap-3 rounded border border-line px-3 text-13 text-ink-2"
                >
                  <span>¿Vuelve al anaquel?</span>
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    {vuelve(r.ticket_item_id) ? "Sí" : "No"}
                    <span className={["relative h-6 w-10 rounded-full transition-colors", vuelve(r.ticket_item_id) ? "bg-ink" : "bg-line-strong"].join(" ")}>
                      <span className={["absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform duration-150 ease-out", vuelve(r.ticket_item_id) ? "translate-x-[18px]" : "translate-x-0.5"].join(" ")} />
                    </span>
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between">
        <span className="text-13 font-medium text-ink-2">Se reembolsan</span>
        <span className="font-display text-24 font-bold tabular-nums text-ink">{fmtMxn(total)}</span>
      </div>
      <MotivoChips opciones={MOTIVOS_TIENDA} valor={motivo} onCambiar={setMotivo} texto={motivoTexto} onTexto={setMotivoTexto} />
      <ElegirMedio medio={medio} onCambiar={setMedio} nota={notaMedio} />
      <AvisoAutorizacion propia={tienePermiso} />
    </DialogoPeligro>
  );
}
