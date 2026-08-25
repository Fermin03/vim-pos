// Pruebas del armado de conceptos. Se corren con el runner de Node, sin dependencias:
//
//   node --test --experimental-strip-types supabase/functions/_shared/pac/conceptos.test.ts
//
// Node y no Vitest porque este módulo vive en `supabase/functions/`, que es código de Deno y no
// pertenece al workspace de pnpm. El módulo es puro a propósito —ni fetch ni Deno— justamente para
// poder probarlo en cualquier runtime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { armarConceptos, armarConceptosGlobal, ConceptosIncoherentes, type LineaTicket } from "./conceptos.ts";

/** Un renglón con los valores que `recalcular_totales_ticket` habría dejado. */
function linea(p: Partial<LineaTicket> & { totalItemMxn: number; ivaItemMxn: number }): LineaTicket {
  return {
    descripcion: "Hamburguesa",
    cantidad: 1,
    claveSat: null,
    unidadSat: null,
    tasaIva: 16,
    ivaIncluidoEnPrecio: true,
    subtotalBrutoMxn: p.totalItemMxn,
    montoModificadoresMxn: 0,
    descuentoItemMxn: 0,
    promocionItemMxn: 0,
    ...p,
  };
}

/** La invariante que el SAT valida y que ningún caso puede romper. */
function cuadra(r: ReturnType<typeof armarConceptos>): void {
  assert.equal(
    Math.round((r.subtotal - r.descuento + r.iva) * 100),
    Math.round(r.total * 100),
    "subtotal − descuento + IVA debe dar el total",
  );
  const suma = r.conceptos.reduce((a, c) => a + Math.round(c.total * 100), 0);
  assert.equal(suma, Math.round(r.total * 100), "los conceptos deben sumar el total");
}

test("un renglón con IVA incluido separa base e impuesto", () => {
  const r = armarConceptos([linea({ totalItemMxn: 116, ivaItemMxn: 16 })], 116);
  assert.equal(r.conceptos.length, 1);
  assert.equal(r.conceptos[0].importe, 100);
  assert.equal(r.conceptos[0].iva, 16);
  assert.equal(r.subtotal, 100);
  assert.equal(r.total, 116);
  cuadra(r);
});

test("sin clave del SAT capturada usa la genérica del giro", () => {
  const r = armarConceptos([linea({ totalItemMxn: 116, ivaItemMxn: 16 })], 116);
  assert.equal(r.conceptos[0].claveProdServ, "90101500");
  assert.equal(r.conceptos[0].claveUnidad, "E48");
});

test("respeta la clave del SAT del producto cuando existe", () => {
  const r = armarConceptos(
    [linea({ totalItemMxn: 116, ivaItemMxn: 16, claveSat: "50202306", unidadSat: "H87" })],
    116,
  );
  assert.equal(r.conceptos[0].claveProdServ, "50202306");
  assert.equal(r.conceptos[0].claveUnidad, "H87");
});

test("el IVA por fuera no vuelve a descontarse del precio", () => {
  const r = armarConceptos(
    [linea({ subtotalBrutoMxn: 100, totalItemMxn: 116, ivaItemMxn: 16, ivaIncluidoEnPrecio: false })],
    116,
  );
  assert.equal(r.conceptos[0].importe, 100);
  assert.equal(r.conceptos[0].iva, 16);
  cuadra(r);
});

test("tasa 0 viaja como tasa 0 y no como 16 %", () => {
  // Es el caso que el concepto agregado falsificaba: comida para llevar a tasa 0.
  const r = armarConceptos([linea({ totalItemMxn: 100, ivaItemMxn: 0, tasaIva: 0 })], 100);
  assert.equal(r.conceptos[0].tasaIva, 0);
  assert.equal(r.conceptos[0].iva, 0);
  assert.equal(r.conceptos[0].importe, 100);
  cuadra(r);
});

test("un ticket con dos tasas distintas conserva cada una", () => {
  const r = armarConceptos(
    [
      linea({ descripcion: "Consumo en mesa", totalItemMxn: 116, ivaItemMxn: 16 }),
      linea({ descripcion: "Pan para llevar", totalItemMxn: 50, ivaItemMxn: 0, tasaIva: 0 }),
    ],
    166,
  );
  assert.deepEqual(r.conceptos.map((c) => c.tasaIva), [16, 0]);
  assert.equal(r.iva, 16);
  assert.equal(r.subtotal, 150);
  cuadra(r);
});

test("los modificadores entran en el importe del renglón", () => {
  // Hamburguesa 116 + queso extra 23.20 = 139.20, IVA incluido.
  const r = armarConceptos(
    [linea({ subtotalBrutoMxn: 116, montoModificadoresMxn: 23.2, totalItemMxn: 139.2, ivaItemMxn: 19.2 })],
    139.2,
  );
  assert.equal(r.conceptos[0].importe, 120);
  assert.equal(r.conceptos[0].total, 139.2);
  cuadra(r);
});

test("el descuento de un renglón se expresa sin IVA", () => {
  // 116 con 10 % de descuento: neto 104.40, IVA 14.40. En el CFDI: importe 100, descuento 10.
  const r = armarConceptos(
    [linea({ subtotalBrutoMxn: 116, descuentoItemMxn: 11.6, totalItemMxn: 104.4, ivaItemMxn: 14.4 })],
    104.4,
  );
  assert.equal(r.conceptos[0].importe, 100);
  assert.equal(r.conceptos[0].descuento, 10);
  assert.equal(r.conceptos[0].iva, 14.4);
  cuadra(r);
});

test("el descuento del ticket completo se reparte y cuadra al centavo", () => {
  // Tres renglones de 116 y $50 de descuento sobre el ticket: 348 − 50 = 298.
  const lineas = [
    linea({ descripcion: "A", totalItemMxn: 116, ivaItemMxn: 16 }),
    linea({ descripcion: "B", totalItemMxn: 116, ivaItemMxn: 16 }),
    linea({ descripcion: "C", totalItemMxn: 116, ivaItemMxn: 16 }),
  ];
  const r = armarConceptos(lineas, 298);
  assert.equal(r.total, 298);
  cuadra(r);
});

test("una cantidad que no divide exacto no descuadra el importe", () => {
  // 3 piezas por $100 en total: el valor unitario no es representable con dos decimales.
  const r = armarConceptos(
    [linea({ cantidad: 3, subtotalBrutoMxn: 100, totalItemMxn: 100, ivaItemMxn: 13.79 })],
    100,
  );
  assert.equal(r.conceptos[0].importe, 86.21);
  assert.equal(Number((r.conceptos[0].valorUnitario * 3).toFixed(2)), 86.21);
  cuadra(r);
});

test("un renglón a tasa 0 nunca lleva descuento por separado", () => {
  // Facturama rechaza tasa 0 + descuento; el descuento tiene que ir absorbido en el precio.
  const r = armarConceptos(
    [
      linea({ descripcion: "Consumo", totalItemMxn: 116, ivaItemMxn: 16 }),
      linea({ descripcion: "Pan para llevar", totalItemMxn: 60, ivaItemMxn: 0, tasaIva: 0 }),
    ],
    150, // $26 de descuento sobre el ticket completo, que toca a los dos renglones
  );
  const sinIva = r.conceptos[1];
  assert.equal(sinIva.descuento, 0, "no debe llevar campo descuento");
  assert.equal(sinIva.importe, sinIva.total, "el importe ya viene neto");
  cuadra(r);
});

test("se niega a facturar un ticket sin renglones", () => {
  assert.throws(() => armarConceptos([], 100), ConceptosIncoherentes);
});

test("se niega cuando el total cobrado supera a los renglones", () => {
  assert.throws(
    () => armarConceptos([linea({ totalItemMxn: 116, ivaItemMxn: 16 })], 200),
    ConceptosIncoherentes,
  );
});

test("aguanta cualquier ticket: 5000 casos al azar cuadran al centavo", () => {
  // La prueba que de verdad importa. El redondeo del dinero falla en los casos que a nadie se le
  // ocurre escribir a mano, así que se generan a lo bruto.
  let semilla = 20260824;
  const azar = () => {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };
  const centavos = (n: number) => Math.round(n * 100) / 100;

  for (let caso = 0; caso < 5000; caso++) {
    const cuantas = 1 + Math.floor(azar() * 6);
    const lineas: LineaTicket[] = [];
    let totalTicket = 0;

    for (let i = 0; i < cuantas; i++) {
      const tasa = [16, 0, 8][Math.floor(azar() * 3)];
      const incluido = azar() < 0.8;
      const cantidad = 1 + Math.floor(azar() * 4);
      const precio = centavos(10 + azar() * 500);
      const bruto = centavos(precio * cantidad);
      const modif = azar() < 0.3 ? centavos(azar() * 50) : 0;
      const descuento = azar() < 0.25 ? centavos((bruto + modif) * azar() * 0.5) : 0;

      const neto = centavos(bruto + modif - descuento);
      const iva = incluido
        ? centavos(neto - neto / (1 + tasa / 100))
        : centavos(neto * (tasa / 100));
      const total = incluido ? neto : centavos(neto + iva);

      lineas.push({
        descripcion: `Producto ${i}`,
        cantidad,
        claveSat: null,
        unidadSat: null,
        tasaIva: tasa,
        ivaIncluidoEnPrecio: incluido,
        subtotalBrutoMxn: bruto,
        montoModificadoresMxn: modif,
        descuentoItemMxn: descuento,
        promocionItemMxn: 0,
        ivaItemMxn: iva,
        totalItemMxn: total,
      });
      totalTicket = centavos(totalTicket + total);
    }

    // En uno de cada tres tickets, además, un descuento sobre el total.
    const conDescuentoTicket = azar() < 0.33;
    const totalFinal = conDescuentoTicket
      ? centavos(totalTicket * (0.5 + azar() * 0.49))
      : totalTicket;

    const r = armarConceptos(lineas, totalFinal);
    assert.equal(Math.round(r.total * 100), Math.round(totalFinal * 100), `caso ${caso}: total`);
    cuadra(r);
    for (const c of r.conceptos) {
      assert.ok(c.importe >= 0 && c.descuento >= 0 && c.iva >= 0, `caso ${caso}: negativos`);
      assert.ok(c.descuento <= c.importe, `caso ${caso}: descuento mayor que el importe`);
      if (c.tasaIva === 0) assert.equal(c.descuento, 0, `caso ${caso}: tasa 0 con descuento`);
    }
  }
});

test("la global emite un concepto por ticket y por tasa", () => {
  const r = armarConceptosGlobal([
    { folio: "A-001", totalMxn: 116, lineas: [linea({ totalItemMxn: 116, ivaItemMxn: 16 })] },
    {
      folio: "A-002",
      totalMxn: 166,
      lineas: [
        linea({ descripcion: "Consumo", totalItemMxn: 116, ivaItemMxn: 16 }),
        linea({ descripcion: "Pan", totalItemMxn: 50, ivaItemMxn: 0, tasaIva: 0 }),
      ],
    },
  ]);
  // A-001 aporta una línea (16 %); A-002 aporta dos (16 % y 0 %).
  assert.equal(r.conceptos.length, 3);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), [
    "Venta folio A-001", "Venta folio A-002", "Venta folio A-002",
  ]);
  assert.equal(r.total, 282);
  cuadra(r);
});

test("la global junta en una línea los renglones del ticket con la misma tasa", () => {
  const r = armarConceptosGlobal([{
    folio: "B-010",
    totalMxn: 232,
    lineas: [
      linea({ descripcion: "Hamburguesa", totalItemMxn: 116, ivaItemMxn: 16 }),
      linea({ descripcion: "Papas", totalItemMxn: 116, ivaItemMxn: 16 }),
    ],
  }]);
  assert.equal(r.conceptos.length, 1, "dos renglones al 16 % son un solo concepto");
  assert.equal(r.conceptos[0].importe, 200);
  assert.equal(r.conceptos[0].iva, 32);
  cuadra(r);
});

test("la global cuadra al centavo con 500 tickets al azar", () => {
  // El riesgo real de la global es el redondeo acumulado: cientos de tickets sumados.
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  const centavos = (n: number) => Math.round(n * 100) / 100;

  const tickets = [];
  let esperado = 0;
  for (let i = 0; i < 500; i++) {
    const tasa = azar() < 0.7 ? 16 : 0;
    const neto = centavos(20 + azar() * 900);
    const iva = centavos(neto - neto / (1 + tasa / 100));
    tickets.push({
      folio: `T-${i}`,
      totalMxn: neto,
      lineas: [linea({ subtotalBrutoMxn: neto, totalItemMxn: neto, ivaItemMxn: iva, tasaIva: tasa })],
    });
    esperado = centavos(esperado + neto);
  }
  const r = armarConceptosGlobal(tickets);
  assert.equal(Math.round(r.total * 100), Math.round(esperado * 100));
  cuadra(r);
});

test("se niega a amparar un periodo sin ventas", () => {
  assert.throws(() => armarConceptosGlobal([]), ConceptosIncoherentes);
});
