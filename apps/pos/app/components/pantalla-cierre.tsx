"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@vim/ui/styles";
import { employeeClient, type Empleado } from "../lib/supabase";
import { fmtMxn, registrarComisionEvento, type DatosCaja, type Turno } from "../lib/turno";
import { notificarEventoCritico } from "../lib/push-eventos";
import {
  leerReporteX,
  contarTicketsAbiertos,
  arquearCaja,
  cerrarTurnoZ,
  leerDatosFiscales,
  leerEstadisticasTurno,
  leerMovimientosTurno,
  type ReporteXResumen,
  type CorteResultado,
  type CierreZ,
  type DatosFiscales,
  type EstadisticasTurno,
  type MovimientosTurno,
} from "../lib/cierre";
import { autorizacionPropia, type Autorizacion, type PayloadAutorizacion } from "../lib/autorizacion";
import { ModalAutorizacionPin } from "./modal-autorizacion-pin";
import { construirReporteZJob, type DatosReporteZ } from "../lib/print/reporte-z-builder";
import { obtenerImpresora } from "../lib/print/adapter";
import { ReciboPreview } from "./recibo-preview";

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia / SPEI",
  APP_RAPPI: "Rappi", APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi", APP_IFOOD: "iFood", APP_OTRO: "App externa",
};

/** Etiqueta del método en MAYÚSCULAS estilo Soft Restaurant (EFECTIVO/VISA/…). */
const METODO_LABEL_SOFT_MAP: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TARJETA_CREDITO: "TARJETA",
  TARJETA_DEBITO: "TARJETA",
  TRANSFERENCIA: "TRANSFERENCIA",
  APP_RAPPI: "RAPPI", APP_UBEREATS: "UBER EATS", APP_DIDI: "DIDI", APP_IFOOD: "IFOOD", APP_OTRO: "APP EXTERNA",
};
const labelSoft = (m: string) => METODO_LABEL_SOFT_MAP[m] ?? m.toUpperCase();

const round2 = (n: number) => Math.round(n * 100) / 100;
const label = (m: string) => METODO_LABEL[m] ?? m;
const ROLES_CIERRE = ["CAJERO", "SUPERVISOR", "ADMIN", "DUENO"];

type Fila = { metodo: string; esperado: number };
type Paso = "arqueo" | "resultado" | "z";

export function PantallaCierre({
  token,
  empleado,
  caja,
  turno,
  onCancelar,
  onCerrado,
}: {
  token: string;
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  onCancelar: () => void;
  onCerrado: () => void;
}) {
  const [resumen, setResumen] = useState<ReporteXResumen | null>(null);
  const [negocio, setNegocio] = useState("");
  const [fiscales, setFiscales] = useState<DatosFiscales | null>(null);
  const [stats, setStats] = useState<EstadisticasTurno | null>(null);
  const [movs, setMovs] = useState<MovimientosTurno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>("arqueo");
  const [declarado, setDeclarado] = useState<Record<string, string>>({});
  const [comisionEvento, setComisionEvento] = useState(""); // B3 — comisión del organizador (turno de evento)
  const [procesando, setProcesando] = useState(false);
  const [corte, setCorte] = useState<CorteResultado | null>(null);
  const [pidiendoPin, setPidiendoPin] = useState(false);
  const [cierre, setCierre] = useState<CierreZ | null>(null);
  const [ticketsAbiertos, setTicketsAbiertos] = useState(0);

  useEffect(() => {
    let activo = true;
    Promise.all([
      leerReporteX(token, turno.id),
      employeeClient(token).from("tenants").select("nombre_comercial").limit(1).maybeSingle(),
      leerDatosFiscales(token, caja.tenant_id, caja.sucursal_id),
      leerEstadisticasTurno(token, turno.id),
      leerMovimientosTurno(token, turno.id),
      contarTicketsAbiertos(token, turno.id),
    ])
      .then(([x, ten, fis, st, mv, abiertos]) => {
        if (!activo) return;
        setResumen(x);
        setNegocio(((ten.data as { nombre_comercial?: string } | null)?.nombre_comercial) ?? "Negocio");
        setFiscales(fis);
        setStats(st);
        setMovs(mv);
        setTicketsAbiertos(abiertos);
        // Prellenar declarado de métodos no-efectivo con su esperado (verificable)
        const pre: Record<string, string> = {};
        for (const p of x.pagosPorMetodo) if (p.metodo !== "EFECTIVO") pre[p.metodo] = String(p.total);
        setDeclarado(pre);
      })
      .catch((e) => activo && setError(e instanceof Error ? e.message : "Error al leer el turno"));
    return () => { activo = false; };
  }, [token, turno.id, caja.tenant_id, caja.sucursal_id]);

  const filas = useMemo<Fila[]>(() => {
    if (!resumen) return [];
    const noEfectivo = resumen.pagosPorMetodo.filter((p) => p.metodo !== "EFECTIVO").map((p) => ({ metodo: p.metodo, esperado: p.total }));
    return [{ metodo: "EFECTIVO", esperado: resumen.efectivoEsperado }, ...noEfectivo];
  }, [resumen]);

  const efectivoDeclarado = Number(declarado["EFECTIVO"] || 0);
  // BUG B: no se puede cerrar el turno con cuentas abiertas (quedarían huérfanas).
  const puedeGenerar = (declarado["EFECTIVO"] ?? "").trim() !== "" && ticketsAbiertos === 0;

  function dif(metodo: string, esperado: number): number | null {
    const v = declarado[metodo];
    if (v == null || v.trim() === "") return null;
    return Math.round((Number(v) - esperado) * 100) / 100;
  }

  async function generarCorte() {
    if (!resumen || !puedeGenerar) return;
    setProcesando(true);
    setError(null);
    try {
      // B3 — turno de evento: registrar la comisión del organizador antes del corte.
      if (turno.evento_nombre && comisionEvento.trim() !== "") {
        await registrarComisionEvento(token, turno.id, Number(comisionEvento) || 0);
      }
      const declaraciones = filas.map((f) => ({ metodoPago: f.metodo, montoDeclarado: Number(declarado[f.metodo] || 0) }));
      const r = await arquearCaja(token, { turnoId: turno.id, declaraciones, usuarioId: empleado.id });
      setCorte(r);
      setPaso("resultado");
      // Evento crítico: el corte tiene diferencia → avisar a los dispositivos del dueño.
      if (Math.abs(r.diferenciaTotal) > 0.01) {
        notificarEventoCritico(
          token,
          "💰 Cierre con diferencia",
          `Turno ${turno.codigo_turno} (${caja.nombre}): diferencia de ${fmtMxn(r.diferenciaTotal)} en el corte.`,
          "/reportes/z-historico",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el corte");
    } finally {
      setProcesando(false);
    }
  }

  function payloadCierre(): PayloadAutorizacion {
    return {
      accion: "cerrar_turno", permisoCodigo: "turno.cerrar_propio",
      entidadTipo: "turno", entidadId: turno.id, monto: null,
      motivo: "Cierre de turno", cajaId: turno.caja_id, turnoId: turno.id,
    };
  }

  async function ejecutarCierre(a: Autorizacion) {
    setProcesando(true);
    setError(null);
    try {
      const z = await cerrarTurnoZ(token, {
        turnoId: turno.id, efectivoDeclarado, autorizacionPinId: a.autorizacionPinId, usuarioId: empleado.id,
      });
      setCierre(z);
      setPaso("z");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el turno");
      setProcesando(false);
      setPidiendoPin(false);
    }
  }

  async function cerrar() {
    setError(null);
    if (ROLES_CIERRE.includes(empleado.rol)) {
      setProcesando(true);
      try {
        const a = await autorizacionPropia(token, payloadCierre());
        await ejecutarCierre(a);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo autorizar el cierre");
        setProcesando(false);
      }
    } else {
      setPidiendoPin(true);
    }
  }

  // ── Paso Z (recibo del corte, auto-impreso) ─────────────────────────────────
  if (paso === "z" && cierre && resumen && stats) {
    const p = cierre.payload;
    const tk = (p.tickets ?? {}) as Record<string, unknown>;
    const dev = (p.devoluciones ?? {}) as Record<string, unknown>;
    const propinasDist = ((p.propinas_distribuidas ?? []) as Record<string, unknown>[])
      .map((d) => ({
        nombre: String(d.nombre ?? d.usuario_nombre ?? d.usuario_id ?? "—"),
        monto: Number(d.monto_mxn ?? d.monto ?? 0),
      }));
    const sello = cierre.reporteZId.replace(/-/g, "").slice(0, 12);
    const ticketsPagados = Number(tk.total_tickets_pagados ?? 0);
    const ticketsCancelados = Number(tk.total_tickets_cancelados ?? 0);
    const ticketsAbiertos = Number(tk.total_tickets_abiertos ?? 0);
    // Ventas en efectivo (suma de pagos en efectivo en el turno) y desglose de tarjeta/vales/otros.
    const efeRow = resumen.pagosPorMetodo.find((m) => m.metodo === "EFECTIVO");
    const tarjetas = resumen.pagosPorMetodo
      .filter((m) => m.metodo === "TARJETA_CREDITO" || m.metodo === "TARJETA_DEBITO")
      .reduce((s, m) => s + m.total, 0);
    const vales = 0; // no manejamos vales en MVP
    const otrosNoEfe = resumen.pagosPorMetodo
      .filter((m) => m.metodo !== "EFECTIVO" && m.metodo !== "TARJETA_CREDITO" && m.metodo !== "TARJETA_DEBITO")
      .reduce((s, m) => s + m.total, 0);
    // Declaración de cajero por método (la que el cajero ya ingresó en la pantalla de arqueo).
    const declaracionPorMetodo = filas.map((f) => ({
      metodo: labelSoft(f.metodo),
      declarado: Number(declarado[f.metodo] ?? 0),
    }));
    const totalDeclarado = round2(declaracionPorMetodo.reduce((s, d) => s + d.declarado, 0));
    const diferenciaTotal = corte?.diferenciaTotal ?? round2(totalDeclarado - resumen.efectivoEsperado);
    const zData: DatosReporteZ = {
      negocio,
      razonSocial: fiscales?.razonSocial ?? "",
      rfc: fiscales?.rfc ?? "",
      direccionSucursal: fiscales?.direccionSucursal ?? "",
      sucursal: caja.sucursalNombre,
      folioZ: cierre.folioZ ?? "—",
      codigoTurno: turno.codigo_turno,
      estacionCaja: caja.nombre,
      fechaApertura: resumen.fechaApertura,
      fechaCierre: (p.fecha_cierre as string) ?? new Date().toISOString(),
      cajero: empleado.nombre,
      caja: caja.nombre,
      // CAJA — flujo efectivo
      efectivoInicial: resumen.fondoApertura,
      ventasEfectivo: efeRow?.total ?? 0,
      ventasTarjeta: tarjetas,
      ventasVales: vales,
      ventasOtros: otrosNoEfe,
      depositosEfectivo: movs?.depositosEntrantes ?? 0,
      retirosEfectivo: movs?.retirosSalientes ?? 0,
      propinasPagadas: 0,
      // Pagos
      pagosPorMetodo: resumen.pagosPorMetodo.map((m) => ({ metodo: labelSoft(m.metodo), total: m.total, cantidad: m.cantidad })),
      pagosPropinaPorMetodo: resumen.propinaTotal > 0 && efeRow
        ? [{ metodo: labelSoft("EFECTIVO"), total: resumen.propinaTotal }]
        : [],
      ventaPorModoServicio: stats.ventaPorModoServicio,
      // Subtotales
      ventaNeta: Number(tk.total_neto_mxn ?? 0),
      iva: Number(tk.iva_neto_mxn ?? 0),
      descuentos: Number(tk.descuentos_manuales_mxn ?? 0),
      propinaTotal: Number(tk.propina_total_mxn ?? 0),
      // Estadísticas
      ticketsPagados,
      ticketsEmitidos: ticketsPagados + ticketsCancelados + ticketsAbiertos,
      ticketsCancelados,
      cuentasConDescuento: stats.cuentasConDescuento,
      comensales: stats.cuentasNormales,
      ticketPromedio: stats.ticketPromedio,
      folioInicial: stats.folioInicial,
      folioFinal: stats.folioFinal,
      devolucionesCantidad: Number(dev.cantidad ?? 0),
      devolucionesMonto: Number(dev.total_mxn ?? 0),
      propinasDistribuidas: propinasDist,
      // Declaración + arqueo
      declaracionPorMetodo,
      totalDeclarado,
      efectivoEsperado: resumen.efectivoEsperado,
      efectivoDeclarado,
      diferenciaEfectivo: Math.round((efectivoDeclarado - resumen.efectivoEsperado) * 100) / 100,
      diferenciaTotal,
      sello,
      ancho: 80,
    };
    // Imprimir: Epson recibe el job ESC/POS; Preview imprime el recibo visible vía window.print().
    return (
      <ReciboPreview
        datosZ={zData}
        onImprimir={() => { obtenerImpresora({ onMostrar: () => window.print() }).imprimir(construirReporteZJob(zData)); }}
        onCerrar={onCerrado}
        onNuevoTicket={onCerrado}
      />
    );
  }

  const input = "h-11 w-[150px] rounded border border-line-strong px-3 text-right font-display text-[17px] font-bold outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Subbar */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancelar} className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-display text-[17px] font-semibold tracking-tight">{paso === "resultado" ? "Resultado del corte" : "Arqueo / Cierre de turno"}</h1>
        </div>
        <span className="text-[12.5px] text-ink-3">Turno <b className="text-ink-2">{turno.codigo_turno}</b> · Cajero <b className="text-ink-2">{empleado.nombre}</b></span>
      </div>

      {error && <p className="mx-6 mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {!resumen && <p className="p-6 text-sm text-ink-3">Cargando turno…</p>}

      {resumen && paso === "arqueo" && (
        <div className="flex min-h-0 flex-1">
          {/* Tabla de declaración */}
          <div className="flex-1 overflow-y-auto p-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                  <th className="pb-3 text-left">Método de pago</th>
                  <th className="pb-3 text-right">Esperado</th>
                  <th className="pb-3 text-center">Declarado</th>
                  <th className="pb-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const d = dif(f.metodo, f.esperado);
                  return (
                    <tr key={f.metodo} className="border-b border-line">
                      <td className="py-4">
                        <div className="text-[15px] font-semibold">{label(f.metodo)}</div>
                        {f.metodo === "EFECTIVO" && <div className="text-[11.5px] text-ink-3">Incluye fondo, ventas y movimientos</div>}
                      </td>
                      <td className="py-4 text-right font-display text-[15px] font-semibold tabular-nums text-ink-2">{fmtMxn(f.esperado)}</td>
                      <td className="py-4 text-center">
                        <input
                          className={input}
                          inputMode="decimal"
                          placeholder="$0.00"
                          value={declarado[f.metodo] ?? ""}
                          onChange={(e) => setDeclarado((s) => ({ ...s, [f.metodo]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        />
                      </td>
                      <td className="py-4 text-right font-display text-[15px] font-bold tabular-nums">
                        {d == null ? <span className="text-ink-3">—</span>
                          : d === 0 ? <span className="text-success">$0.00 ✓</span>
                          : d < 0 ? <span className="text-danger">−{fmtMxn(Math.abs(d))} faltante</span>
                          : <span className="text-warning">+{fmtMxn(d)} sobrante</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumen del turno */}
          <aside className="flex w-[360px] flex-shrink-0 flex-col border-l border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-semibold">Resumen del turno</h2></div>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-[13.5px]">
              <Row l="Tickets pagados" v={String(resumen.ticketsPagados)} />
              <Row l="Tickets cancelados" v={String(resumen.ticketsCancelados)} />
              <Row l="Venta neta" v={fmtMxn(resumen.ventaNeta)} />
              <Row l="IVA" v={fmtMxn(resumen.iva)} />
              {resumen.descuentos > 0 && <Row l="Descuentos" v={`−${fmtMxn(resumen.descuentos)}`} />}
              <Row l="Propinas" v={fmtMxn(resumen.propinaTotal)} />
              <Row l="Fondo de apertura" v={fmtMxn(resumen.fondoApertura)} />
              <div className="mt-3 flex items-center justify-between border-t-2 border-ink pt-3">
                <span className="font-display text-[15px] font-bold">Efectivo esperado</span>
                <span className="font-display text-[18px] font-bold tabular-nums">{fmtMxn(resumen.efectivoEsperado)}</span>
              </div>
            </div>
            <div className="border-t border-line p-4">
              {/* B3 — turno de evento: comisión del organizador */}
              {turno.evento_nombre && (
                <div className="mb-3 rounded-lg border border-line bg-sel px-3.5 py-3">
                  <div className="text-[12px] font-semibold text-ink-2">Evento: {turno.evento_nombre}</div>
                  <label className="mt-1.5 block text-[12px] text-ink-3" htmlFor="comision-evento">
                    Comisión del organizador (MXN) · opcional
                  </label>
                  <input
                    id="comision-evento"
                    className="mt-1 h-10 w-full rounded border border-line-strong px-3 text-sm tabular-nums outline-none focus:border-ink"
                    inputMode="decimal"
                    value={comisionEvento}
                    onChange={(e) => setComisionEvento(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                  />
                </div>
              )}
              {ticketsAbiertos > 0 && (
                <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3" role="alert">
                  <div className="flex items-start gap-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="mt-px h-[18px] w-[18px] flex-shrink-0 text-danger"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                    <div className="text-[12.5px] leading-snug">
                      <span className="font-semibold text-danger">{ticketsAbiertos} {ticketsAbiertos === 1 ? "cuenta abierta" : "cuentas abiertas"} sin cobrar.</span>
                      <span className="text-ink-2"> Cóbralas o cancélalas antes de cerrar el turno; si no, quedarían sin registrar y la mesa trabada.</span>
                    </div>
                  </div>
                </div>
              )}
              <Button className="w-full" onClick={generarCorte} disabled={!puedeGenerar || procesando}>
                {procesando ? "Generando…" : "Generar corte"}
              </Button>
            </div>
          </aside>
        </div>
      )}

      {resumen && paso === "resultado" && corte && (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-6">
          <div className="w-full max-w-[560px] rounded-lg border border-line bg-surface p-6">
            <div className="mb-4 text-center">
              <div className={["mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full", corte.diferenciaTotal === 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"].join(" ")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-6 w-6"><path d="M20 6 9 17l-5-5" /></svg>
              </div>
              <h2 className="font-display text-[20px] font-semibold">Corte generado</h2>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              {corte.detalle.map((d) => (
                <div key={d.metodo} className="flex items-center justify-between border-b border-line px-4 py-3 text-[14px] last:border-b-0">
                  <span className="font-semibold">{label(d.metodo)}</span>
                  <span className="flex items-center gap-4 tabular-nums">
                    <span className="text-ink-3">esp {fmtMxn(d.esperado)}</span>
                    <span className="text-ink-2">dec {fmtMxn(d.declarado)}</span>
                    <span className={["font-display font-bold", d.diferencia === 0 ? "text-success" : d.diferencia < 0 ? "text-danger" : "text-warning"].join(" ")}>
                      {d.diferencia === 0 ? "$0.00" : d.diferencia < 0 ? `−${fmtMxn(Math.abs(d.diferencia))}` : `+${fmtMxn(d.diferencia)}`}
                    </span>
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-sel px-4 py-3">
                <span className="font-display text-[15px] font-bold uppercase tracking-wide">Diferencia total</span>
                <span className={["font-display text-[18px] font-bold tabular-nums", corte.diferenciaTotal === 0 ? "text-success" : corte.diferenciaTotal < 0 ? "text-danger" : "text-warning"].join(" ")}>
                  {corte.diferenciaTotal === 0 ? "$0.00" : corte.diferenciaTotal < 0 ? `−${fmtMxn(Math.abs(corte.diferenciaTotal))}` : `+${fmtMxn(corte.diferenciaTotal)}`}
                </span>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setPaso("arqueo")} className="rounded border border-line-strong px-5 py-3 text-[14px] font-semibold text-ink-2 hover:border-ink hover:text-ink">Volver</button>
              <Button onClick={cerrar} disabled={procesando}>{procesando ? "Cerrando…" : "Cerrar turno"}</Button>
            </div>
          </div>
        </div>
      )}

      {pidiendoPin && (
        <ModalAutorizacionPin
          token={token}
          accion="cerrar_turno"
          permisoCodigo="turno.cerrar_propio"
          descripcion={`Cerrar el turno ${turno.codigo_turno}`}
          ejecutaNombre={empleado.nombre}
          monto={null}
          entidadTipo="turno"
          entidadId={turno.id}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          motivo="Cierre de turno"
          onAutorizado={ejecutarCierre}
          onCancelar={() => setPidiendoPin(false)}
        />
      )}
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-line py-2 last:border-b-0">
      <span className="text-ink-2">{l}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </div>
  );
}
