"use client";
import { etiquetaMetodoPago } from "@vim/db/metodos-pago";
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
import { listarCuentasQueBloqueanCorte, type CuentaBloqueante } from "../lib/cuentas-abiertas";


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
const label = etiquetaMetodoPago;
const ROLES_CIERRE = ["CAJERO", "SUPERVISOR", "ADMIN", "DUENO"];
/** Roles con `turno.recontar_arqueo` (0127): se autorizan solos para volver a contar. */
const ROLES_RECONTAR = ["SUPERVISOR", "ADMIN", "DUENO"];

type Fila = { metodo: string; esperado: number };
type Paso = "arqueo" | "resultado" | "z";

export function PantallaCierre({
  token,
  empleado,
  caja,
  turno,
  onCancelar,
  onCerrado,
  onIrACuenta,
}: {
  token: string;
  empleado: Empleado;
  caja: DatosCaja;
  turno: Turno;
  onCancelar: () => void;
  onCerrado: () => void;
  /** Lleva a la cuenta que bloquea el corte, para cobrarla o cancelarla ahí mismo. */
  onIrACuenta?: (ticketId: string) => void;
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
  // Corte ciego (0.4.94): volver a contar después de ver la diferencia pide autorización. La del
  // recuento viaja con el corte siguiente, así queda ligada a él; el corte anterior no se borra.
  const [pidiendoPinRecuento, setPidiendoPinRecuento] = useState(false);
  const [autorizacionRecuento, setAutorizacionRecuento] = useState<string | null>(null);
  // ¿Este turno ya tiene un conteo? Salir del resultado (flecha o Escape) y volver a entrar no
  // puede ser la forma de contar otra vez sin autorización: el corte se generó y quedó registrado.
  const [hayCortePrevio, setHayCortePrevio] = useState(false);
  // Autorizar ANTES de generar (cuando se entró de nuevo a un turno con conteo): el PIN llega y
  // el corte se genera con él.
  const [pidiendoPinGenerar, setPidiendoPinGenerar] = useState(false);
  useEffect(() => {
    let vivo = true;
    employeeClient(token).from("cortes_caja").select("id").eq("turno_id", turno.id).eq("motivo", "CIERRE_TURNO").limit(1)
      .then(({ data }) => { if (vivo && (data?.length ?? 0) > 0) setHayCortePrevio(true); });
    return () => { vivo = false; };
  }, [token, turno.id]);
  const necesitaAutorizacion = hayCortePrevio && !autorizacionRecuento;
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

  // Qué cuentas bloquean, no solo cuántas. Se cargan solo cuando estorban: si el corte sale
  // limpio, esta consulta no tiene por qué correr.
  const [bloqueantes, setBloqueantes] = useState<CuentaBloqueante[] | null>(null);
  useEffect(() => {
    if (ticketsAbiertos === 0) { setBloqueantes(null); return; }
    let vivo = true;
    listarCuentasQueBloqueanCorte(token, turno.id)
      .then((c) => { if (vivo) setBloqueantes(c); })
      .catch(() => { if (vivo) setBloqueantes([]); }); // el aviso ya se dio; su detalle no debe romper el cierre
    return () => { vivo = false; };
  }, [ticketsAbiertos, token, turno.id]);

  const efectivoDeclarado = Number(declarado["EFECTIVO"] || 0);
  // BUG B: no se puede cerrar el turno con cuentas abiertas (quedarían huérfanas).
  const puedeGenerar = (declarado["EFECTIVO"] ?? "").trim() !== "" && ticketsAbiertos === 0;

  async function generarCorte(autorizacionDada?: string) {
    if (!resumen || !puedeGenerar) return;
    const autorizacion = autorizacionDada ?? autorizacionRecuento;
    if (hayCortePrevio && !autorizacion) {
      setError(null);
      if (!ROLES_RECONTAR.includes(empleado.rol)) { setPidiendoPinGenerar(true); return; }
      try {
        const a = await autorizacionPropia(token, payloadRecuento());
        return generarCorte(a.autorizacionPinId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo autorizar el recuento");
        return;
      }
    }
    setProcesando(true);
    setError(null);
    try {
      // B3 — turno de evento: registrar la comisión del organizador antes del corte.
      if (turno.evento_nombre && comisionEvento.trim() !== "") {
        await registrarComisionEvento(token, turno.id, Number(comisionEvento) || 0);
      }
      const declaraciones = filas.map((f) => ({ metodoPago: f.metodo, montoDeclarado: Number(declarado[f.metodo] || 0) }));
      const r = await arquearCaja(token, { turnoId: turno.id, declaraciones, usuarioId: empleado.id, autorizacionPinId: autorizacion });
      setCorte(r);
      // Ya hay un conteo registrado: el siguiente, si lo hay, vuelve a pedir autorización.
      setHayCortePrevio(true);
      setAutorizacionRecuento(null);
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

  // El cajón se abre al ENTRAR, no al confirmar: para declarar el efectivo hay que contarlo
  // primero, y contarlo exige tenerlo a la mano. Abrirlo después del cierre llegaría tarde.
  useEffect(() => {
    obtenerImpresora("CAJA", { onMostrar: () => {} }).abrirCajon().catch(() => {});
  }, []);

  function payloadRecuento(): PayloadAutorizacion {
    return {
      accion: "recontar_arqueo", permisoCodigo: "turno.recontar_arqueo",
      entidadTipo: "turno", entidadId: turno.id, monto: corte?.diferenciaTotal ?? null,
      motivo: "Volver a contar el arqueo", cajaId: turno.caja_id, turnoId: turno.id,
    };
  }

  /** Regresa al conteo con el efectivo en blanco: se cuenta otra vez, no se corrige la cifra. */
  function volverAContar(a: Autorizacion) {
    setAutorizacionRecuento(a.autorizacionPinId);
    setPidiendoPinRecuento(false);
    setDeclarado((d) => ({ ...d, EFECTIVO: "" }));
    setCorte(null);
    setPaso("arqueo");
  }

  async function pedirRecuento() {
    setError(null);
    if (!ROLES_RECONTAR.includes(empleado.rol)) { setPidiendoPinRecuento(true); return; }
    try {
      volverAContar(await autorizacionPropia(token, payloadRecuento()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo autorizar el recuento");
    }
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
      lealtad: Number(tk.lealtad_mxn ?? 0),
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
    /* El corte sale SOLO, y el botón dice "Volver".
     *
     * Se imprime al aparecer porque un corte Z siempre se imprime: se firma y se guarda
     * con el efectivo. Pedírselo al cajero era un paso de más al final de la jornada,
     * y si se le olvidaba, el turno quedaba cerrado sin papel. La vista se queda en
     * pantalla para reimprimir si la impresora falló.
     *
     * Y ya no dice "Nuevo ticket": aquí el turno ACABA de cerrarse, así que ese botón
     * ofrecía justo lo único que en ese momento no se puede hacer.
     *
     * Imprimir: Epson recibe el job ESC/POS; Preview usa window.print() sobre lo visible. */
    return (
      <ReciboPreview
        datosZ={zData}
        autoImprimir
        etiquetaCerrar="Volver"
        onImprimir={() => { obtenerImpresora("CAJA", { onMostrar: () => window.print() }).imprimir(construirReporteZJob(zData)); }}
        onCerrar={onCerrado}
      />
    );
  }

  const input = "h-11 w-[150px] rounded border border-line-strong px-3 text-right font-display text-18 font-bold outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Subbar */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-line bg-surface px-6">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancelar} className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-2 hover:border-ink hover:text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="font-display text-18 font-semibold tracking-tight">{paso === "resultado" ? "Resultado del corte" : "Arqueo / Cierre de turno"}</h1>
        </div>
        <span className="text-13 text-ink-3">Turno <b className="text-ink-2">{turno.codigo_turno}</b> · Cajero <b className="text-ink-2">{empleado.nombre}</b></span>
      </div>

      {error && <p className="mx-6 mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      {!resumen && <p className="p-6 text-sm text-ink-3">Cargando turno…</p>}

      {resumen && paso === "arqueo" && (
        <div className="flex min-h-0 flex-1">
          {/* Tabla de declaración */}
          <div className="flex-1 overflow-y-auto p-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-11 font-bold uppercase tracking-wide text-ink-3">
                  <th className="pb-3 text-left">Método de pago</th>
                  <th className="pb-3 text-right">Contado</th>
                </tr>
              </thead>
              <tbody>
                {/* CORTE CIEGO: aquí no hay "Esperado" ni "Diferencia". Con la cifra a la vista, el
                    conteo se ajusta a ella (cuentas hasta que te da) y el faltante desaparece del
                    corte. La diferencia sale en el resultado, cuando ya no se puede acomodar. */}
                {filas.map((f) => {
                  return (
                    <tr key={f.metodo} className="border-b border-line">
                      <td className="py-4">
                        <div className="text-15 font-semibold">{label(f.metodo)}</div>
                        {f.metodo === "EFECTIVO"
                          ? <div className="text-12 text-ink-3">Cuenta todo lo que hay en el cajón, fondo incluido</div>
                          : <div className="text-12 text-ink-3">Del sistema: confírmalo con el cierre de tu terminal</div>}
                      </td>
                      <td className="py-4 text-right">
                        <input
                          className={input}
                          inputMode="decimal"
                          placeholder="$0.00"
                          value={declarado[f.metodo] ?? ""}
                          onChange={(e) => setDeclarado((s) => ({ ...s, [f.metodo]: e.target.value.replace(/[^0-9.]/g, "") }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumen del turno */}
          <aside className="flex w-[360px] flex-shrink-0 flex-col border-l border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="font-display text-15 font-semibold">Resumen del turno</h2></div>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-14">
              <Row l="Tickets pagados" v={String(resumen.ticketsPagados)} />
              <Row l="Tickets cancelados" v={String(resumen.ticketsCancelados)} />
              <Row l="Fondo de apertura" v={fmtMxn(resumen.fondoApertura)} />
              {/* Venta, propinas y efectivo esperado se ven en el resultado: con ellos a la vista
                  se puede sacar la cuenta del cajón y el conteo deja de ser ciego. */}
              <p className="mt-4 rounded border border-line bg-sel px-3 py-2.5 text-13 leading-snug text-ink-2">
                Cuenta el efectivo y escríbelo. Lo que debería haber aparece al generar el corte.
              </p>
            </div>
            <div className="border-t border-line p-4">
              {/* B3 — turno de evento: comisión del organizador */}
              {turno.evento_nombre && (
                <div className="mb-3 rounded-lg border border-line bg-sel px-3.5 py-3">
                  <div className="text-12 font-semibold text-ink-2">Evento: {turno.evento_nombre}</div>
                  <label className="mt-1.5 block text-12 text-ink-3" htmlFor="comision-evento">
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
                    <div className="text-13 leading-snug">
                      <span className="font-semibold text-danger">{ticketsAbiertos} {ticketsAbiertos === 1 ? "cuenta abierta" : "cuentas abiertas"} sin cobrar.</span>
                      <span className="text-ink-2"> Cóbralas o cancélalas antes de cerrar el turno; si no, quedarían sin registrar y la mesa trabada.</span>
                    </div>
                  </div>

                  {/* CUÁLES son. Antes solo se decía cuántas, y hay modos sin lista propia
                      —"Para llevar" no tiene dónde verse—, así que una cuenta olvidada ahí no
                      aparecía en ninguna pantalla: el corte quedaba trabado sin pista de por qué. */}
                  {bloqueantes === null ? (
                    <div className="mt-2.5 pl-[26px] text-12 text-ink-3">Buscando cuáles son…</div>
                  ) : bloqueantes.length === 0 ? (
                    <div className="mt-2.5 pl-[26px] text-12 text-ink-3">
                      No se pudo listar cuáles. Revisa las cuentas abiertas de cada modo y los pedidos en espera.
                    </div>
                  ) : (
                    <ul className="mt-2.5 flex flex-col gap-1.5 pl-[26px]">
                      {bloqueantes.map((c) => (
                        <li key={c.ticketId} className="flex items-center gap-2 rounded border border-line bg-surface px-2.5 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-13 font-semibold">
                              {c.folio ?? "Sin folio"} · {c.modo}
                              {c.enEspera && <span className="ml-1.5 rounded bg-sel px-1.5 py-px text-11 font-semibold text-ink-3">en espera</span>}
                            </span>
                            <span className="block text-12 text-ink-3">
                              {c.nItems} {c.nItems === 1 ? "producto" : "productos"} · {fmtMxn(c.total)}
                            </span>
                          </span>
                          {onIrACuenta && (
                            <button
                              type="button"
                              onClick={() => onIrACuenta(c.ticketId)}
                              className="flex-shrink-0 rounded border border-line-strong px-2.5 py-1 text-12 font-semibold text-ink-2 transition hover:border-ink hover:text-ink"
                            >
                              Ir a la cuenta
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {necesitaAutorizacion && (
                <p className="mb-3 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning">
                  Este turno ya tiene un conteo registrado. Contar de nuevo pide autorización de un supervisor.
                </p>
              )}
              <Button className="w-full" onClick={() => void generarCorte()} disabled={!puedeGenerar || procesando}>
                {procesando ? "Generando…" : necesitaAutorizacion ? "Autorizar y generar corte" : "Generar corte"}
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
              <h2 className="font-display text-20 font-semibold">Corte generado</h2>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              {corte.detalle.map((d) => (
                <div key={d.metodo} className="flex items-center justify-between border-b border-line px-4 py-3 text-14 last:border-b-0">
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
                <span className="font-display text-15 font-bold uppercase tracking-wide">Diferencia total</span>
                <span className={["font-display text-18 font-bold tabular-nums", corte.diferenciaTotal === 0 ? "text-success" : corte.diferenciaTotal < 0 ? "text-danger" : "text-warning"].join(" ")}>
                  {corte.diferenciaTotal === 0 ? "$0.00" : corte.diferenciaTotal < 0 ? `−${fmtMxn(Math.abs(corte.diferenciaTotal))}` : `+${fmtMxn(corte.diferenciaTotal)}`}
                </span>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              {/* Sin diferencia no hay nada que recontar. Con diferencia, volver pide autorización:
                  si no, el corte ciego se vuelve "ver la cifra y corregir". */}
              {corte.diferenciaTotal !== 0 ? (
                <button type="button" onClick={() => void pedirRecuento()} disabled={procesando} className="rounded border border-line-strong px-5 py-3 text-14 font-semibold text-ink-2 hover:border-ink hover:text-ink">
                  Volver a contar
                </button>
              ) : <span />}
              <Button onClick={cerrar} disabled={procesando}>{procesando ? "Cerrando…" : "Cerrar turno"}</Button>
            </div>
          </div>
        </div>
      )}

      {pidiendoPinGenerar && (
        <ModalAutorizacionPin
          token={token}
          accion="recontar_arqueo"
          permisoCodigo="turno.recontar_arqueo"
          descripcion={`Contar de nuevo el arqueo del turno ${turno.codigo_turno}`}
          ejecutaNombre={empleado.nombre}
          monto={null}
          entidadTipo="turno"
          entidadId={turno.id}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          motivo="Volver a contar el arqueo"
          onAutorizado={(a) => { setPidiendoPinGenerar(false); void generarCorte(a.autorizacionPinId); }}
          onCancelar={() => setPidiendoPinGenerar(false)}
        />
      )}
      {pidiendoPinRecuento && (
        <ModalAutorizacionPin
          token={token}
          accion="recontar_arqueo"
          permisoCodigo="turno.recontar_arqueo"
          descripcion={`Volver a contar el arqueo del turno ${turno.codigo_turno}`}
          ejecutaNombre={empleado.nombre}
          monto={corte?.diferenciaTotal ?? null}
          entidadTipo="turno"
          entidadId={turno.id}
          cajaId={turno.caja_id}
          turnoId={turno.id}
          motivo="Volver a contar el arqueo"
          onAutorizado={volverAContar}
          onCancelar={() => setPidiendoPinRecuento(false)}
        />
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
