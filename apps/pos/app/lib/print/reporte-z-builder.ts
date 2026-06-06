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

/** Construye el PrintJob del Corte Z (P-226) desde el payload del cierre. Función PURA. */
export function construirReporteZJob(d: DatosReporteZ): PrintJob {
  const f = new Date(d.fechaCierre);
  const fecha = `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;

  const b: Bloque[] = [];
  b.push({ t: "texto", valor: d.negocio, align: "centro", size: 2, bold: true });
  b.push({ t: "texto", valor: d.sucursal, align: "centro", size: 1 });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "texto", valor: "CORTE Z", align: "centro", size: 2, bold: true });
  b.push({ t: "fila", izq: "Folio Z", der: d.folioZ });
  b.push({ t: "fila", izq: "Cierre", der: fecha });
  b.push({ t: "fila", izq: "Cajero", der: d.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.caja });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "fila", izq: "Tickets pagados", der: String(d.ticketsPagados) });
  b.push({ t: "fila", izq: "Venta neta", der: pesos(d.ventaNeta) });
  b.push({ t: "fila", izq: "IVA", der: pesos(d.iva) });
  if (d.descuentos > 0) b.push({ t: "fila", izq: "Descuentos", der: `-${pesos(d.descuentos)}` });
  b.push({ t: "fila", izq: "Propinas", der: pesos(d.propinaTotal) });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "texto", valor: "Cobrado por método", align: "izq", size: 1 });
  for (const p of d.pagosPorMetodo) b.push({ t: "fila", izq: p.metodo, der: pesos(p.total) });
  b.push({ t: "separador", estilo: "punteado" });

  b.push({ t: "fila", izq: "Efectivo esperado", der: pesos(d.efectivoEsperado) });
  b.push({ t: "fila", izq: "Efectivo declarado", der: pesos(d.efectivoDeclarado) });
  b.push({ t: "fila", izq: "Diferencia", der: pesos(d.diferenciaEfectivo) });
  b.push({ t: "separador", estilo: "solido" });

  b.push({ t: "texto", valor: "Reporte Z · inmutable", align: "centro", size: 1 });
  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}
