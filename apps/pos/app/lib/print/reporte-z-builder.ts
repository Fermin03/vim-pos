import type { Bloque, PrintJob } from "./tipos";
import { pesos } from "./ticket-builder";

export type DatosReporteZ = {
  negocio: string;
  sucursal: string;
  folioZ: string;
  /** Código del turno (P-226 lo muestra como "Turno: Tarde / 2026-…-C01-01"). */
  codigoTurno: string;
  /** Hora de apertura del turno (ISO). Si null → se omite. */
  fechaApertura: string | null;
  fechaCierre: string;
  cajero: string;
  caja: string;
  ticketsPagados: number;
  /** Tickets emitidos durante el turno (pagados + cancelados + en espera). P-226 muestra "Tickets emitidos". */
  ticketsEmitidos: number;
  ticketsCancelados: number;
  /** Devoluciones del turno: cantidad y monto neto. */
  devolucionesCantidad: number;
  devolucionesMonto: number;
  ventaNeta: number;
  iva: number;
  descuentos: number;
  propinaTotal: number;
  pagosPorMetodo: { metodo: string; total: number; cantidad: number }[];
  /** Propinas distribuidas por usuario (del payload del Z). */
  propinasDistribuidas: { nombre: string; monto: number }[];
  efectivoEsperado: number;
  efectivoDeclarado: number;
  diferenciaEfectivo: number;
  /** Hash corto del sello del Z (8–16 chars). Derivado del reporte_z_id. */
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
