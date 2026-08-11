import type { Bloque, PrintJob } from "./tipos";
import { pesos } from "./ticket-builder";

export type DatosReporteZ = {
  // ── Encabezado fiscal ──
  negocio: string;
  /** Razón social (puede ir vacía si tenant TRIAL). Se imprime si está presente. */
  razonSocial: string;
  rfc: string;
  /** Dirección fiscal/operativa de la sucursal (línea formateada). */
  direccionSucursal: string;
  sucursal: string;
  // ── Identificación del reporte ──
  folioZ: string;
  codigoTurno: string;
  /** Estación de caja (en Soft sale "DESKTOP-CLBS4T5"; nosotros usamos el nombre de la caja). */
  estacionCaja: string;
  fechaApertura: string | null;
  fechaCierre: string;
  cajero: string;
  caja: string;
  // ── CAJA: flujo de efectivo ──
  /** Fondo de apertura. */
  efectivoInicial: number;
  /** Ventas pagadas en efectivo (suma de pagos EFECTIVO en el turno). */
  ventasEfectivo: number;
  /** Ventas en tarjeta + otros no-efectivo (informativo en la sección CAJA de Soft). */
  ventasTarjeta: number;
  ventasVales: number;
  ventasOtros: number;
  /** Movimientos de caja (F7 — aún 0). */
  depositosEfectivo: number;
  retirosEfectivo: number;
  propinasPagadas: number;
  // ── Formas de pago ──
  /** Pagos por método (ventas), con etiqueta Soft (EFECTIVO/VISA/TRANSFERENCIA/…). */
  pagosPorMetodo: { metodo: string; total: number; cantidad: number }[];
  /** Propinas por método (en VIM la propina viaja DENTRO del pago; total = propinaTotal). */
  pagosPropinaPorMetodo: { metodo: string; total: number }[];
  // ── Venta por modo de servicio (con %) ──
  ventaPorModoServicio: { modo: string; total: number; cantidad: number; porcentaje: number }[];
  // ── Subtotales fiscales ──
  ventaNeta: number;
  iva: number;
  descuentos: number;
  propinaTotal: number;
  // ── Operación: estadísticas ──
  ticketsPagados: number;
  ticketsEmitidos: number;
  ticketsCancelados: number;
  /** Tickets con descuento aplicado. */
  cuentasConDescuento: number;
  /** Comensales (Quick Service: no aplica — se reporta como cantidad de tickets pagados). */
  comensales: number;
  ticketPromedio: number;
  folioInicial: string | null;
  folioFinal: string | null;
  // ── Devoluciones ──
  devolucionesCantidad: number;
  devolucionesMonto: number;
  // ── Propinas distribuidas (legado de P-226; queda para auditoría) ──
  propinasDistribuidas: { nombre: string; monto: number }[];
  // ── Declaración de cajero (por método) + arqueo ──
  declaracionPorMetodo: { metodo: string; declarado: number }[];
  totalDeclarado: number;
  efectivoEsperado: number;
  efectivoDeclarado: number;
  diferenciaEfectivo: number;
  diferenciaTotal: number;
  // ── Sello inmutable VIM ──
  sello: string;
  ancho: 58 | 80;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtFechaHoraLarga(iso: string): string {
  const f = new Date(iso);
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const yyyy = f.getFullYear();
  let hh = f.getHours();
  const am = hh < 12;
  hh = hh % 12 || 12;
  const min = String(f.getMinutes()).padStart(2, "0");
  const ss = String(f.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${String(hh).padStart(2, "0")}:${min}:${ss} ${am ? "AM" : "PM"}`;
}

function fmtFechaCompleta(iso: string): string {
  const f = new Date(iso);
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}:${String(f.getSeconds()).padStart(2, "0")}`;
}

function tit(valor: string): Bloque {
  return { t: "texto", valor, align: "centro", bold: true, size: 1 };
}

/** Construye el PrintJob del Corte Z (P-226) desde el payload del cierre. Función PURA.
 *  Debe quedar idéntico —contenido, secciones y orden— a ReciboZ (recibo-z.tsx), formato
 *  "Soft Restaurant" que ya conoce el equipo de Knock-Out. */
export function construirReporteZJob(d: DatosReporteZ): PrintJob {
  const saldoFinal = round2(
    d.efectivoInicial + d.ventasEfectivo + d.depositosEfectivo - d.retirosEfectivo - d.propinasPagadas,
  );
  const totalFormasPago = round2(d.pagosPorMetodo.reduce((s, p) => s + p.total, 0));
  const totalFormasPagoPropina = round2(d.pagosPropinaPorMetodo.reduce((s, p) => s + p.total, 0));
  const subtotalSinIva = round2(d.ventaNeta - d.iva);
  const ventaConImp = d.ventaNeta;
  const diff = d.diferenciaTotal;
  const diffTxt = diff === 0 ? pesos(0) : `${diff > 0 ? "+" : "-"}${pesos(Math.abs(diff))}`;

  const b: Bloque[] = [];

  // 1) Encabezado fiscal
  b.push({ t: "texto", valor: d.negocio.toUpperCase(), bold: true, size: 1 });
  if (d.razonSocial) b.push({ t: "texto", valor: d.razonSocial.toUpperCase(), bold: true, size: 1 });
  if (d.rfc) b.push({ t: "texto", valor: `RFC: ${d.rfc}` });
  if (d.direccionSucursal) b.push({ t: "texto", valor: d.direccionSucursal, size: 1 });

  // 2) Identificación
  b.push(tit("CORTE DE CAJA Z"));
  b.push({ t: "texto", valor: `DEL ${fmtFechaHoraLarga(d.fechaApertura ?? d.fechaCierre)}` });
  b.push({ t: "texto", valor: `AL ${fmtFechaHoraLarga(d.fechaCierre)}` });
  b.push({ t: "texto", valor: `TURNO: ${d.codigoTurno} CAJA - ESTACION: ${d.estacionCaja}` });

  b.push({ t: "separador", estilo: "solido" });

  // 3) CAJA — flujo de efectivo
  b.push(tit("CAJA"));
  b.push({ t: "fila", izq: "+EFECTIVO INICIAL:", der: pesos(d.efectivoInicial) });
  b.push({ t: "fila", izq: "+EFECTIVO:", der: pesos(d.ventasEfectivo) });
  b.push({ t: "fila", izq: "+TARJETA:", der: pesos(d.ventasTarjeta) });
  b.push({ t: "fila", izq: "+VALES:", der: pesos(d.ventasVales) });
  b.push({ t: "fila", izq: "+OTROS:", der: pesos(d.ventasOtros) });
  b.push({ t: "fila", izq: "+DEPOSITOS EFECTIVO:", der: pesos(d.depositosEfectivo) });
  b.push({ t: "fila", izq: "-RETIROS EFECTIVO:", der: pesos(d.retirosEfectivo) });
  b.push({ t: "fila", izq: "-PROPINAS PAGADAS:", der: pesos(d.propinasPagadas) });
  b.push({ t: "fila", izq: "=SALDO FINAL:", der: pesos(saldoFinal), bold: true });
  b.push({ t: "fila", izq: "EFECTIVO FINAL:", der: pesos(saldoFinal), bold: true });

  b.push({ t: "separador", estilo: "solido" });

  // 4) FORMA DE PAGO VENTAS
  b.push(tit("FORMA DE PAGO VENTAS"));
  for (const p of d.pagosPorMetodo) b.push({ t: "fila", izq: `${p.metodo}:`, der: pesos(p.total) });
  b.push({ t: "fila", izq: "TOTAL FORMAS DE PAGO", der: pesos(totalFormasPago), bold: true });

  b.push({ t: "separador", estilo: "solido" });

  // 5) FORMA DE PAGO PROPINA
  b.push(tit("FORMA DE PAGO PROPINA"));
  b.push({ t: "fila", izq: "TOTAL FORMAS PAGO PROPINA", der: pesos(totalFormasPagoPropina), bold: true });

  b.push({ t: "separador", estilo: "solido" });

  // 6) POR TIPO DE SERVICIO + subtotales fiscales
  b.push(tit("VENTA (NO INCLUYE IMPUESTOS)"));
  b.push(tit("POR TIPO DE SERVICIO"));
  if (d.ventaPorModoServicio.length === 0) {
    b.push({ t: "texto", valor: "— sin ventas —", align: "centro", size: 1 });
  } else {
    for (const m of d.ventaPorModoServicio) {
      b.push({ t: "fila", izq: `${m.modo}:`, der: `${pesos(m.total)}  (${m.porcentaje}%)` });
    }
  }
  b.push({ t: "fila", izq: "SUBTOTAL    :", der: pesos(subtotalSinIva) });
  b.push({ t: "fila", izq: "-DESCUENTOS :", der: pesos(d.descuentos) });
  b.push({ t: "fila", izq: "VENTA NETA  :", der: pesos(ventaConImp), bold: true });
  b.push({ t: "fila", izq: "VENTA 16%   :", der: pesos(subtotalSinIva) });
  b.push({ t: "fila", izq: "IMPUESTO 16%:", der: pesos(d.iva) });
  b.push({ t: "fila", izq: "IMPUESTOS TOTAL:", der: pesos(d.iva), bold: true });
  b.push({ t: "fila", izq: "VENTAS CON IMP.:", der: pesos(ventaConImp), bold: true });

  // 7) VENTA RAPIDA POR TIPO (solo si aplica)
  const rapidas = d.ventaPorModoServicio.filter((m) => /LLEVAR|RAPIDO|DRIVE/i.test(m.modo));
  if (rapidas.length > 0) {
    b.push({ t: "separador", estilo: "punteado" });
    b.push(tit("VENTA RAPIDA POR TIPO"));
    for (const m of rapidas) b.push({ t: "fila", izq: m.modo, der: pesos(m.total) });
  }

  b.push({ t: "separador", estilo: "punteado" });

  // 8) Estadísticas
  b.push({ t: "fila", izq: "CUENTAS NORMALES", der: `: ${d.ticketsPagados}` });
  b.push({ t: "fila", izq: "CUENTAS CANCELADAS", der: `: ${d.ticketsCancelados}` });
  b.push({ t: "fila", izq: "CUENTAS CON DESCUENTO", der: `: ${d.cuentasConDescuento}` });
  b.push({ t: "fila", izq: "CUENTA PROMEDIO", der: `: ${pesos(d.ticketPromedio)}` });
  b.push({ t: "fila", izq: "CONSUMO PROMEDIO", der: `: ${pesos(d.ticketPromedio)}` });
  b.push({ t: "fila", izq: "COMENSALES", der: `: ${d.comensales}` });
  b.push({ t: "fila", izq: "PROPINAS", der: `: ${pesos(d.propinaTotal)}` });
  if (d.folioInicial) b.push({ t: "fila", izq: "FOLIO INICIAL", der: `: ${d.folioInicial}` });
  if (d.folioFinal) b.push({ t: "fila", izq: "FOLIO FINAL", der: `: ${d.folioFinal}` });

  // Devoluciones (si las hubo)
  if (d.devolucionesCantidad > 0) {
    b.push({ t: "separador", estilo: "punteado" });
    b.push(tit("DEVOLUCIONES"));
    b.push({ t: "fila", izq: `${d.devolucionesCantidad} ticket(s)`, der: `-${pesos(d.devolucionesMonto)}` });
  }

  b.push({ t: "separador", estilo: "solido" });

  // 9) DECLARACION DE CAJERO + arqueo
  b.push(tit("DECLARACION DE CAJERO"));
  for (const p of d.declaracionPorMetodo) b.push({ t: "fila", izq: `${p.metodo}:`, der: pesos(p.declarado) });
  b.push({ t: "fila", izq: "TOTAL:", der: pesos(d.totalDeclarado), bold: true });
  b.push({ t: "fila", izq: "SOBRANTE(+) O FALTANTE(-):", der: diffTxt, bold: true });

  b.push({ t: "separador", estilo: "solido" });

  // 10) Firma
  b.push({ t: "fila", izq: "_______________", der: "_______________" });
  b.push({ t: "fila", izq: "GERENTE", der: `CAJERO: ${d.cajero}` });

  // 11) Sello inmutable VIM
  b.push({ t: "separador", estilo: "punteado" });
  b.push({ t: "texto", valor: "* TURNO CERRADO - VIM POS *", align: "centro", bold: true, size: 1 });
  b.push({ t: "texto", valor: `Folio Z: ${d.folioZ}`, align: "centro" });
  b.push({ t: "texto", valor: `SHA: ${d.sello}`, align: "centro", size: 1 });
  b.push({ t: "texto", valor: `Sellado ${fmtFechaCompleta(d.fechaCierre)}`, align: "centro", size: 1 });

  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}
