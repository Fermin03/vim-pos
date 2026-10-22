// Cotización impresa (retail 2, entrega 3). Molde de devolucion-builder: mismo PrintJob para el
// preview y la térmica. Sin pagos, sin QR de factura y sin lealtad: una cotización no es venta.
import type { Bloque, PrintJob } from "./tipos";
import type { Cotizacion, Encabezado } from "../cotizaciones";
import { aGranel, fmtCantidad, precioConUnidad, tipoDesdeSat } from "../unidades";
import { fechaCorta } from "../lealtad-reglas";

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/** «18/10/2026 12:00», en la hora de la caja. */
export function fechaHora(iso: string): string {
  const f = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

export function construirCotizacionJob(c: Cotizacion, e: Encabezado, ancho: 58 | 80): PrintJob {
  const bloques: Bloque[] = [
    { t: "texto", valor: e.negocio, align: "centro", size: 2, bold: true },
    ...(e.direccion ? [{ t: "texto", valor: e.direccion, align: "centro" } as Bloque] : []),
    ...(e.telefono ? [{ t: "texto", valor: `Tel. ${e.telefono}`, align: "centro" } as Bloque] : []),
    ...(e.rfc ? [{ t: "texto", valor: `RFC ${e.rfc}`, align: "centro" } as Bloque] : []),
    { t: "separador", estilo: "solido" },
    { t: "texto", valor: "COTIZACIÓN", align: "centro", bold: true },
    { t: "separador", estilo: "punteado" },
    { t: "fila", izq: "Folio:", der: c.folio },
    { t: "fila", izq: "Fecha:", der: fechaHora(c.creadaIso) },
    { t: "fila", izq: "Válida hasta:", der: fechaCorta(c.vigenteHasta) },
    ...(c.cliente ? [{ t: "fila", izq: "Cliente:", der: c.cliente.nombre } as Bloque] : []),
    { t: "separador", estilo: "punteado" },
  ];
  // Como el ticket: a granel «1.250 kg Jitomate» y debajo «$28.00/kg»; una pieza, «2x Playera».
  for (const i of c.items) {
    const tipo = tipoDesdeSat(i.unidadSat);
    bloques.push({ t: "fila", izq: `${aGranel(tipo) ? fmtCantidad(i.cantidad, tipo) : `${i.cantidad}x`} ${i.nombre}`, der: fmt(i.total) });
    if (aGranel(tipo)) bloques.push({ t: "texto", valor: `   ${precioConUnidad(fmt(i.precioUnitario), tipo)}`, size: 1 });
  }
  bloques.push(
    { t: "separador", estilo: "solido" },
    { t: "fila", izq: "Subtotal", der: fmt(c.subtotal) },
    { t: "fila", izq: "IVA", der: fmt(c.iva) },
    { t: "fila", izq: "TOTAL", der: fmt(c.total), bold: true },
    { t: "separador", estilo: "punteado" },
    { t: "texto", valor: "Precios sujetos a cambio después de la vigencia.", align: "centro" },
    { t: "corte" },
  );
  return { tipo: "TICKET", ancho, destino: "CAJA", bloques };
}
