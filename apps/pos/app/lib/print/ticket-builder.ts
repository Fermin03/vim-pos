import type { Bloque, DatosTicketImpresion, PrintJob } from "./tipos";

/** Formatea pesos sin depender de módulos cliente (testeable en node). */
export function pesos(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

/** Construye el PrintJob TICKET (P-222) desde datos planos. Función PURA. */
export function construirTicketJob(d: DatosTicketImpresion): PrintJob {
  const b: Bloque[] = [];

  // 1. Encabezado del negocio
  b.push({ t: "texto", valor: d.negocio.nombre, align: "centro", size: 2, bold: true });
  if (d.sucursal.direccion) b.push({ t: "texto", valor: d.sucursal.direccion, align: "centro", size: 1 });
  if (d.sucursal.telefono) b.push({ t: "texto", valor: `Tel. ${d.sucursal.telefono}`, align: "centro", size: 1 });
  if (d.negocio.rfc) b.push({ t: "texto", valor: `RFC ${d.negocio.rfc}`, align: "centro", size: 1 });

  b.push({ t: "separador", estilo: "punteado" });

  // 2. Meta
  b.push({ t: "fila", izq: "Fecha", der: formatoFecha(d.meta.fechaIso) });
  b.push({ t: "fila", izq: "Ticket", der: d.meta.folio });
  b.push({ t: "fila", izq: "Cajero", der: d.meta.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.meta.caja });
  b.push({ t: "fila", izq: "Servicio", der: d.meta.modoServicio });

  b.push({ t: "separador", estilo: "punteado" });

  // 3. Líneas
  for (const l of d.lineas) {
    b.push({ t: "fila", izq: `${l.cantidad}x ${l.nombre}`, der: pesos(l.totalMxn) });
    for (const m of l.modificadores) b.push({ t: "texto", valor: `  ${m}`, size: 1 });
  }

  b.push({ t: "separador", estilo: "punteado" });

  // 4. Totales
  b.push({ t: "fila", izq: "Subtotal", der: pesos(d.totales.subtotal) });
  if (d.totales.descuentos > 0) b.push({ t: "fila", izq: "Descuento", der: `-${pesos(d.totales.descuentos)}` });
  b.push({ t: "fila", izq: "IVA (16%)", der: pesos(d.totales.iva) });
  b.push({ t: "fila", izq: "TOTAL", der: pesos(d.totales.total) });

  b.push({ t: "separador", estilo: "punteado" });

  // 5. Pago(s)
  for (const p of d.pagos) {
    b.push({ t: "fila", izq: p.metodo, der: pesos(p.montoMxn) });
    if (p.recibidoMxn != null) {
      b.push({ t: "fila", izq: "Recibido", der: pesos(p.recibidoMxn) });
      b.push({ t: "fila", izq: "Cambio", der: pesos(p.cambioMxn) });
    }
  }
  if (d.totales.propina > 0) b.push({ t: "fila", izq: "Propina", der: pesos(d.totales.propina) });

  b.push({ t: "separador", estilo: "solido" });

  // 6. Pie fiscal
  b.push({ t: "texto", valor: "¡Gracias por su compra!", align: "centro" });
  b.push({ t: "texto", valor: "¿Necesitas factura? Escanea el código:", align: "centro", size: 1 });
  b.push({ t: "qr", valor: d.qrUrl });
  b.push({ t: "texto", valor: d.qrUrl.replace(/^https?:\/\//, ""), align: "centro", size: 1 });

  b.push({ t: "corte" });

  return { tipo: "TICKET", ancho: d.ancho, destino: "CAJA", abrir_cajon: false, bloques: b };
}

function formatoFecha(iso: string): string {
  const f = new Date(iso);
  const dd = String(f.getDate()).padStart(2, "0");
  const mm = String(f.getMonth() + 1).padStart(2, "0");
  const yyyy = f.getFullYear();
  const hh = String(f.getHours()).padStart(2, "0");
  const mi = String(f.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}
