// Fase 2 del CFDI — convierte los renglones del ticket en los conceptos del comprobante.
//
// Hasta ahora el CFDI llevaba UN concepto agregado ("Consumo en restaurante") con el total y un IVA
// fijo del 16 %. Servía para que timbrara, pero es incorrecto: el SAT quiere el detalle, y el 16 %
// fijo miente en cuanto un producto lleva tasa 0 (comida para llevar, por ejemplo).
//
// TODO EL DINERO SE OPERA EN CENTAVOS ENTEROS. No es purismo: un CFDI cuyo total no cuadra al
// centavo lo rechaza el PAC, y si cuadra por poco puede dejar una factura que no coincide con lo
// que el cliente pagó. Los flotantes garantizan que eso pase tarde o temprano.
//
// La regla que manda sobre todas las demás: **el total del CFDI tiene que ser exactamente el total
// que el cliente pagó**. Todo lo que sigue está construido para que esa igualdad sea cierta por
// construcción y no por casualidad de redondeo.

/** Un renglón de `ticket_items`, ya calculado por `recalcular_totales_ticket`. */
export type LineaTicket = {
  descripcion: string;
  cantidad: number;
  claveSat: string | null;
  unidadSat: string | null;
  /** Porcentaje, como lo guarda la base: 16.00, no 0.16. */
  tasaIva: number;
  ivaIncluidoEnPrecio: boolean;
  subtotalBrutoMxn: number;
  montoModificadoresMxn: number;
  descuentoItemMxn: number;
  promocionItemMxn: number;
  ivaItemMxn: number;
  totalItemMxn: number;
};

/** Un concepto listo para el CFDI. Los importes ya son pesos exactos (múltiplos de un centavo). */
export type ConceptoCfdi = {
  claveProdServ: string;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  /** Importe ANTES de descuento y SIN IVA — que es lo que el SAT llama Importe. */
  importe: number;
  descuento: number;
  tasaIva: number;
  iva: number;
  total: number;
};

export type ConceptosArmados = {
  conceptos: ConceptoCfdi[];
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
};

/**
 * Claves por omisión cuando el producto no las tiene capturadas.
 *
 * `90101500` es «servicios de restaurantes» y `E48` la unidad de servicio. La mayoría de los
 * catálogos de nuestros clientes tienen `clave_sat` en NULL, y negarse a timbrar por eso sería
 * peor que timbrar con la clave genérica del giro: es la que un contador pondría a mano de todos
 * modos. Cuando el negocio capture su clave real, esta deja de usarse sola.
 */
export const CLAVE_SAT_POR_DEFECTO = "90101500";
export const UNIDAD_SAT_POR_DEFECTO = "E48";

/** Los errores de armado son datos incoherentes, no fallos de red: no tiene sentido reintentar. */
export class ConceptosIncoherentes extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ConceptosIncoherentes";
  }
}

const aCentavos = (pesos: number): number => Math.round(pesos * 100);
const aPesos = (centavos: number): number => centavos / 100;

type LineaEnCentavos = {
  origen: LineaTicket;
  /** Importe sin IVA y antes de descuento. */
  importe: number;
  descuento: number;
  base: number;
  iva: number;
  total: number;
};

/**
 * Arma los conceptos del CFDI a partir de los renglones del ticket.
 *
 * @param lineas         Renglones NO cancelados del ticket.
 * @param totalTicketMxn `tickets.total_mxn` — el total que el cliente pagó, sin propina.
 *
 * Lanza `ConceptosIncoherentes` cuando los renglones no pueden producir ese total. Es deliberado
 * que falle en vez de ajustar a la fuerza: un CFDI con un total inventado es un problema fiscal
 * del cliente, y prefiero un timbrado que no sale y se investiga a uno que sale mal y se descubre
 * en una auditoría.
 */
export function armarConceptos(lineas: LineaTicket[], totalTicketMxn: number): ConceptosArmados {
  if (lineas.length === 0) {
    throw new ConceptosIncoherentes("El ticket no tiene renglones que facturar");
  }

  const totalTicket = aCentavos(totalTicketMxn);
  const enCentavos = lineas.map(desglosarLinea);

  // El descuento a nivel TICKET (el que no cuelga de ningún renglón) no viene en los renglones:
  // se deduce de la diferencia. Deducirlo en vez de leerlo de otra tabla hace que este cálculo
  // absorba cualquier ajuste que el POS haya hecho al total, venga de donde venga.
  const sumaLineas = enCentavos.reduce((acc, l) => acc + l.total, 0);
  const descuentoTicket = sumaLineas - totalTicket;

  if (descuentoTicket < 0) {
    throw new ConceptosIncoherentes(
      `El total del ticket (${aPesos(totalTicket)}) supera la suma de sus renglones ` +
        `(${aPesos(sumaLineas)}). Falta un renglón o el ticket quedó a medio recalcular.`,
    );
  }
  if (descuentoTicket > 0) repartirDescuentoDeTicket(enCentavos, descuentoTicket, sumaLineas);

  enCentavos.forEach(absorberDescuentoSinIva);

  const conceptos = enCentavos.map(aConcepto);
  const total = enCentavos.reduce((acc, l) => acc + l.total, 0);

  // Red de seguridad. Si esto salta, el bug está aquí arriba y no en los datos: mejor que reviente
  // en nuestra cara que timbrar un comprobante descuadrado.
  if (total !== totalTicket) {
    throw new ConceptosIncoherentes(
      `Los conceptos suman ${aPesos(total)} y el ticket cobró ${aPesos(totalTicket)}`,
    );
  }

  return {
    conceptos,
    subtotal: aPesos(enCentavos.reduce((acc, l) => acc + l.importe, 0)),
    descuento: aPesos(enCentavos.reduce((acc, l) => acc + l.descuento, 0)),
    iva: aPesos(enCentavos.reduce((acc, l) => acc + l.iva, 0)),
    total: aPesos(total),
  };
}

/**
 * Pasa un renglón a la forma del CFDI: importe sin IVA, descuento sin IVA e IVA aparte.
 *
 * El CFDI exige `Total = Importe − Descuento + Impuestos`, y el POS guarda lo contrario: precios
 * con IVA dentro y el descuento aplicado sobre el precio con IVA. Si se mandaran esos números tal
 * cual, la aritmética del comprobante no cerraría.
 *
 * El descuento se obtiene RESTANDO (importe − base) en lugar de convertirlo por su cuenta. Así los
 * dos redondeos —el del importe y el de la base— se cancelan y el renglón cuadra al centavo
 * siempre, en vez de casi siempre.
 */
function desglosarLinea(linea: LineaTicket): LineaEnCentavos {
  const bruto = aCentavos(linea.subtotalBrutoMxn) + aCentavos(linea.montoModificadoresMxn);
  const iva = aCentavos(linea.ivaItemMxn);
  const neto = aCentavos(linea.totalItemMxn);

  if (neto < 0 || iva < 0 || bruto < 0) {
    throw new ConceptosIncoherentes(`El renglón "${linea.descripcion}" tiene importes negativos`);
  }

  let importe: number;
  let base: number;

  if (linea.ivaIncluidoEnPrecio) {
    // El precio ya trae IVA: hay que sacárselo tanto al importe como al neto.
    base = neto - iva;
    importe = Math.round(bruto / (1 + linea.tasaIva / 100));
  } else {
    // El IVA va por fuera: el importe ES el bruto y el neto ya lo incluye.
    base = neto - iva;
    importe = bruto;
  }

  const descuento = importe - base;
  if (descuento < 0) {
    throw new ConceptosIncoherentes(
      `El renglón "${linea.descripcion}" cobra más de lo que vale: importe ${aPesos(importe)}, ` +
        `base ${aPesos(base)}`,
    );
  }

  return { origen: linea, importe, descuento, base, iva, total: base + iva };
}

/**
 * Reparte el descuento aplicado al ticket completo entre los renglones, proporcional a lo que pesa
 * cada uno.
 *
 * Hay que repartirlo porque el CFDI no tiene un campo de "descuento del comprobante": el descuento
 * vive en los conceptos y el del comprobante es su suma. Se reparte en proporción al total de cada
 * renglón, y el sobrante del redondeo cae en el renglón más grande, que es donde menos se nota y
 * donde no puede volverse negativo.
 *
 * OJO — aquí el CFDI se separa a propósito de `tickets.iva_mxn`: un descuento a nivel ticket baja
 * el total pero el POS **no** le baja el IVA, así que su `iva_mxn` queda inflado. Fiscalmente el
 * descuento sí reduce la base gravable. El comprobante lleva el IVA correcto, no el del ticket.
 */
function repartirDescuentoDeTicket(
  lineas: LineaEnCentavos[],
  descuentoTicket: number,
  sumaLineas: number,
): void {
  if (sumaLineas <= 0) {
    throw new ConceptosIncoherentes("Hay un descuento de ticket pero los renglones no suman nada");
  }

  const partes = lineas.map((l) => Math.round((descuentoTicket * l.total) / sumaLineas));
  const repartido = partes.reduce((a, b) => a + b, 0);

  let mayor = 0;
  for (let i = 1; i < lineas.length; i++) if (lineas[i].total > lineas[mayor].total) mayor = i;
  partes[mayor] += descuentoTicket - repartido;

  lineas.forEach((l, i) => {
    const parte = partes[i];
    if (parte === 0) return;
    if (parte > l.total) {
      throw new ConceptosIncoherentes(
        `El descuento del ticket deja el renglón "${l.origen.descripcion}" en negativo`,
      );
    }
    // El descuento baja base e IVA en la misma proporción en que el renglón los tenía.
    const parteBase = Math.round(parte / (1 + l.origen.tasaIva / 100));
    const parteIva = parte - parteBase;
    l.descuento += parteBase;
    l.base -= parteBase;
    l.iva -= parteIva;
    l.total -= parte;
  });
}

/**
 * En los renglones a tasa 0, el descuento se mete en el precio en lugar de ir en su propio campo.
 *
 * Facturama rechaza un concepto que lleve tasa 0 y descuento a la vez, y encima con un mensaje que
 * manda a buscar en el lado equivocado: «El TipoDeComprobante no es I, E o N, y un concepto incluye
 * el campo descuento» — cuando el comprobante SÍ es I. Verificado aislando el caso contra el
 * sandbox: gravado con descuento pasa, tasa 0 sin descuento pasa, tasa 0 con descuento no.
 *
 * Absorberlo es inocuo: sin IVA de por medio, un importe de $60 con $5.45 de descuento y uno de
 * $54.55 sin descuento declaran exactamente la misma base y el mismo impuesto (cero). Lo único que
 * se pierde es que el descuento aparezca desglosado en ese renglón del PDF.
 */
function absorberDescuentoSinIva(l: LineaEnCentavos): void {
  if (l.origen.tasaIva !== 0 || l.descuento === 0) return;
  l.importe -= l.descuento;
  l.descuento = 0;
}

function aConcepto(l: LineaEnCentavos): ConceptoCfdi {
  const cantidad = l.origen.cantidad;
  if (!(cantidad > 0)) {
    throw new ConceptosIncoherentes(`El renglón "${l.origen.descripcion}" tiene cantidad ${cantidad}`);
  }

  return {
    claveProdServ: l.origen.claveSat || CLAVE_SAT_POR_DEFECTO,
    claveUnidad: l.origen.unidadSat || UNIDAD_SAT_POR_DEFECTO,
    unidad: "Servicio",
    descripcion: l.origen.descripcion,
    cantidad,
    // Seis decimales: es lo que admite el CFDI 4.0 y evita que `valorUnitario × cantidad` se
    // separe del importe cuando la cantidad no divide exacto (3 piezas de algo que costó $100).
    valorUnitario: Number((aPesos(l.importe) / cantidad).toFixed(6)),
    importe: aPesos(l.importe),
    descuento: aPesos(l.descuento),
    tasaIva: l.origen.tasaIva,
    iva: aPesos(l.iva),
    total: aPesos(l.total),
  };
}

/** Un ticket del periodo, con sus renglones, para armar la factura global. */
export type TicketDelPeriodo = {
  folio: string;
  totalMxn: number;
  lineas: LineaTicket[];
};

/**
 * Arma los conceptos de la FACTURA GLOBAL: la que ampara todas las ventas del periodo en las que
 * nadie pidió comprobante.
 *
 * Emite **un concepto por ticket y por tasa de IVA**, descrito con el folio de la venta. Un
 * concepto por ticket a secas no alcanza: un ticket con hamburguesa (16 %) y pan para llevar
 * (0 %) no cabe en una sola línea, porque un concepto del CFDI lleva UNA tasa.
 *
 * Se prefiere el detalle a la agregación —se podría mandar todo el periodo en dos líneas, una por
 * tasa— porque ante una aclaración con el SAT es más fácil defender un comprobante que enseña sus
 * folios que uno que enseña una suma. El precio es un XML más grande; ver el aviso de volumen en
 * la habilidad `facturama-cfdi`.
 *
 * Reutiliza `armarConceptos` ticket por ticket en vez de rehacer la aritmética: el desglose de un
 * ticket dentro de una global es exactamente el mismo que el de su factura individual, y tener dos
 * implementaciones del mismo cálculo es tener dos oportunidades de equivocarse.
 */
export function armarConceptosGlobal(tickets: TicketDelPeriodo[]): ConceptosArmados {
  if (tickets.length === 0) {
    throw new ConceptosIncoherentes("El periodo no tiene ventas que amparar");
  }

  const conceptos: ConceptoCfdi[] = [];
  for (const t of tickets) {
    const armado = armarConceptos(t.lineas, t.totalMxn);

    // Agrupar por tasa dentro del ticket. Se suma en centavos para que la agrupación no reintroduzca
    // el error de redondeo que `armarConceptos` acaba de eliminar.
    const porTasa = new Map<number, { importe: number; descuento: number; iva: number; total: number }>();
    for (const c of armado.conceptos) {
      const acc = porTasa.get(c.tasaIva) ?? { importe: 0, descuento: 0, iva: 0, total: 0 };
      acc.importe += aCentavos(c.importe);
      acc.descuento += aCentavos(c.descuento);
      acc.iva += aCentavos(c.iva);
      acc.total += aCentavos(c.total);
      porTasa.set(c.tasaIva, acc);
    }

    for (const [tasa, v] of porTasa) {
      conceptos.push({
        claveProdServ: CLAVE_SAT_POR_DEFECTO,
        claveUnidad: UNIDAD_SAT_POR_DEFECTO,
        unidad: "Servicio",
        descripcion: `Venta folio ${t.folio}`,
        cantidad: 1,
        valorUnitario: aPesos(v.importe),
        importe: aPesos(v.importe),
        descuento: aPesos(v.descuento),
        tasaIva: tasa,
        iva: aPesos(v.iva),
        total: aPesos(v.total),
      });
    }
  }

  const suma = (f: (c: ConceptoCfdi) => number) =>
    aPesos(conceptos.reduce((acc, c) => acc + aCentavos(f(c)), 0));

  return {
    conceptos,
    subtotal: suma((c) => c.importe),
    descuento: suma((c) => c.descuento),
    iva: suma((c) => c.iva),
    total: suma((c) => c.total),
  };
}
