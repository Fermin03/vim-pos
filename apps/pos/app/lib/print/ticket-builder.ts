import type { Bloque, DatosTicketImpresion, PrintJob } from "./tipos";

/** Formatea pesos sin depender de módulos cliente (testeable en node). */
export function pesos(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

/** Folio corto: quita el prefijo "XX-" y los ceros a la izquierda. Igual que ReciboTicket en pantalla. */
function folioCorto(folio: string): string {
  return folio.replace(/^[^-]+-/, "").replace(/^0+/, "");
}

/** Construye el PrintJob TICKET (P-222) desde datos planos. Función PURA.
 *  Debe quedar idéntico —contenido y orden— a ReciboTicket (recibo-ticket.tsx), que es
 *  lo que ve el cajero en pantalla. Solo cambia cómo se expresa cada bloque en papel. */
export function construirTicketJob(d: DatosTicketImpresion, logo?: Bloque | null): PrintJob {
  const b: Bloque[] = [];

  // 0. Logo del negocio, si la caja alcanzó a rasterizarlo. Va ANTES del nombre: es lo primero
  //    que el cliente ve del ticket. Si falta (sin logo, o imagen ilegible) el ticket sale igual.
  if (logo) b.push(logo);

  // 1. Encabezado del negocio
  b.push({ t: "texto", valor: d.negocio.nombre, align: "centro", size: 2, bold: true });
  if (d.sucursal.direccion) b.push({ t: "texto", valor: d.sucursal.direccion, align: "centro", size: 1 });
  if (d.sucursal.telefono) b.push({ t: "texto", valor: `Tel. ${d.sucursal.telefono}`, align: "centro", size: 1 });
  if (d.negocio.rfc) b.push({ t: "texto", valor: `RFC ${d.negocio.rfc}`, align: "centro", size: 1 });

  b.push({ t: "separador", estilo: "punteado" });

  // 2. Meta
  b.push({ t: "fila", izq: "Fecha", der: formatoFecha(d.meta.fechaIso) });
  b.push({ t: "fila", izq: "Ticket", der: `#${folioCorto(d.meta.folio)}` });
  b.push({ t: "fila", izq: "Cajero", der: d.meta.cajero });
  b.push({ t: "fila", izq: "Caja", der: d.meta.caja });
  if (d.meta.modoServicio) b.push({ t: "fila", izq: "Servicio", der: d.meta.modoServicio });
  // Nombre suelto de la cuenta (Pick-up): es como se identifica el pedido al entregarlo.
  if (d.meta.nombreCliente) b.push({ t: "fila", izq: "Cliente", der: d.meta.nombreCliente, bold: true });

  // 2.b Datos de entrega (solo domicilio). Va ANTES de los productos y en tamaño grande:
  //      el repartidor lee la dirección de un vistazo, sin buscarla entre los renglones.
  if (d.entrega) {
    b.push({ t: "separador", estilo: "punteado" });
    b.push({ t: "texto", valor: "DATOS DE ENTREGA", align: "centro", bold: true, invertido: true });
    if (d.entrega.cliente) b.push({ t: "texto", valor: d.entrega.cliente, size: 2, bold: true });
    if (d.entrega.telefono) b.push({ t: "texto", valor: `Tel. ${d.entrega.telefono}`, size: 2, bold: true });
    // La dirección va en el MISMO tamaño que el nombre y el teléfono. Estaba en tamaño normal, es
    // decir el dato más pequeño de los tres siendo el único que el repartidor tiene que leer en la
    // calle, muchas veces de noche y sobre papel térmico. Si no cabe en el renglón, la impresora la
    // parte sola: se lee en dos líneas, no se recorta.
    if (d.entrega.direccion) b.push({ t: "texto", valor: d.entrega.direccion, size: 2, bold: true });
    if (d.entrega.referencias) b.push({ t: "texto", valor: `Ref: ${d.entrega.referencias}`, size: 1 });
    if (d.entrega.notasRepartidor) b.push({ t: "texto", valor: `Nota: ${d.entrega.notasRepartidor}`, size: 1 });
  }

  b.push({ t: "separador", estilo: "punteado" });

  // 3. Líneas
  for (const l of d.lineas) {
    b.push({ t: "fila", izq: `${l.cantidad}x ${l.nombre}`, der: pesos(l.totalMxn) });
    for (const m of l.modificadores) b.push({ t: "texto", valor: `  + ${m}`, size: 1 });
    if (l.notaCocina && l.notaCocina.trim().length > 0) {
      b.push({ t: "texto", valor: `  > ${l.notaCocina.trim()}`, size: 1 });
    }
  }

  b.push({ t: "separador", estilo: "punteado" });

  // 4. Totales
  b.push({ t: "fila", izq: "Subtotal", der: pesos(d.totales.subtotal) });
  if (d.totales.descuentos > 0) b.push({ t: "fila", izq: "Descuento", der: `-${pesos(d.totales.descuentos)}` });
  b.push({ t: "fila", izq: "IVA (16%)", der: pesos(d.totales.iva) });
  b.push({ t: "fila", izq: "TOTAL", der: pesos(d.totales.total), bold: true });

  b.push({ t: "separador", estilo: "punteado" });

  // 5. Pago(s) — misma info que ReciboTicket: forma de pago, y si es efectivo, recibido/cambio.
  for (const p of d.pagos) {
    b.push({ t: "fila", izq: "Forma de pago", der: p.metodo });
    if (p.recibidoMxn != null) {
      b.push({ t: "fila", izq: "Recibido", der: pesos(p.recibidoMxn) });
      b.push({ t: "fila", izq: "Cambio", der: pesos(p.cambioMxn) });
    }
  }
  if (d.totales.propina > 0) b.push({ t: "fila", izq: "Propina", der: pesos(d.totales.propina) });

  b.push({ t: "separador", estilo: "solido" });

  // 6. Pie fiscal
  b.push({ t: "texto", valor: "¡Gracias por su compra!", align: "centro" });
  // El QR solo si el negocio lo activó. Imprimir "¿Necesitas factura?" sin portal detrás es
  // prometerle algo al cliente que nadie puede cumplir.
  if (d.qrUrl) {
    b.push({ t: "texto", valor: "¿Necesitas factura? Escanea el código:", align: "centro", size: 1 });
    b.push({ t: "qr", valor: d.qrUrl });
    b.push({ t: "texto", valor: d.qrUrl.replace(/^https?:\/\//, ""), align: "centro", size: 1 });
  }

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

/**
 * ¿Se imprime el ticket del cliente al COBRAR? Solo en "Para llevar".
 *
 *  · PARA LLEVAR — el pedido va del carrito al cobro directo, sin pasar por la lista de cuentas.
 *    No hay un momento anterior donde el cajero pueda darle a "Imprimir ticket": si no sale aquí,
 *    el cliente se va sin comprobante.
 *
 *  · COMEDOR, PICK-UP y DOMICILIO — el ticket se imprime antes desde la cuenta y se entrega; solo
 *    entonces se cobra. Volver a imprimirlo al cobrar sacaba un segundo papel idéntico.
 *
 * Vive aquí, con nombre y con pruebas, porque es una regla de operación del negocio que se cambió
 * tres veces en dos días: la 0.4.39 la puso en todos los modos y la 0.4.40 la quitó de todos.
 * Escondida dentro de un `if` en la pantalla, cada giro costaba una versión y un servicio.
 */
export function debeImprimirTicketAlCobrar(modo: string): boolean {
  return modo === "PARA_LLEVAR";
}
