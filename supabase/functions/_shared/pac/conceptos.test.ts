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
  // La OTRA invariante que el SAT valida y que ningun caso puede romper: la tasa que el concepto
  // DECLARA tiene que explicar el impuesto que TRASLADA. Un comprobante que declara 0.00 % sobre
  // una base de $185 y traslada $1.60 cuadra en pesos y es fiscalmente invalido: cuadrar al
  // centavo no basta. (Revision final, hallazgo 1: asi se timbraba un combo con hijos de tasa
  // mixta, en silencio, porque la red de seguridad solo miraba el total.)
  for (const c of r.conceptos) {
    const base = Math.round((c.importe - c.descuento) * 100);
    const iva = Math.round(c.iva * 100);
    if (c.tasaIva === 0) {
      assert.equal(iva, 0, `el concepto "${c.descripcion}" declara tasa 0 y traslada ${c.iva}`);
      continue;
    }
    // Hasta 2 centavos de holgura: el reparto del descuento de ticket redondea base e IVA aparte.
    const esperado = Math.round((base * c.tasaIva) / 100);
    assert.ok(
      Math.abs(iva - esperado) <= 2,
      `el concepto "${c.descripcion}" declara tasa ${c.tasaIva} sobre base ${base / 100} ` +
        `pero traslada ${c.iva} (esperado ~${esperado / 100})`,
    );
  }
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

test("un combo timbra como un solo concepto con el nombre de sus hijos", () => {
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, claveSat: "90101503", id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({ descripcion: "Doble", totalItemMxn: 0, ivaItemMxn: 0, subtotalBrutoMxn: 0, id: "h1", parentId: "p1", comboRol: "HIJO" });
  const h2 = linea({ descripcion: "Papas", totalItemMxn: 0, ivaItemMxn: 0, subtotalBrutoMxn: 0, id: "h2", parentId: "p1", comboRol: "HIJO" });
  const r = armarConceptos([padre, h1, h2], 175);
  assert.equal(r.conceptos.length, 1);
  assert.equal(r.conceptos[0].descripcion, "Combo (Doble, Papas)");
  assert.equal(r.conceptos[0].claveProdServ, "90101503");
  assert.equal(r.conceptos[0].total, 175);
  cuadra(r);
});

test("el extra con costo de un hijo entra al importe del combo", () => {
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({ descripcion: "Doble", subtotalBrutoMxn: 0, montoModificadoresMxn: 15, totalItemMxn: 15, ivaItemMxn: 2.07, id: "h1", parentId: "p1", comboRol: "HIJO" });
  const r = armarConceptos([padre, h1], 190);
  assert.equal(r.conceptos.length, 1);
  assert.equal(r.conceptos[0].descripcion, "Combo (Doble)");
  assert.equal(r.conceptos[0].total, 190);
  cuadra(r);
});

test("dos combos y un producto suelto dan tres conceptos y cuadran", () => {
  const lineas = [
    linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" }),
    linea({ descripcion: "Doble", subtotalBrutoMxn: 0, totalItemMxn: 0, ivaItemMxn: 0, id: "h1", parentId: "p1", comboRol: "HIJO" }),
    linea({ descripcion: "Brownie", totalItemMxn: 45, ivaItemMxn: 6.21, id: "s1", parentId: null, comboRol: null }),
    linea({ descripcion: "Combo", totalItemMxn: 140, ivaItemMxn: 19.31, id: "p2", parentId: null, comboRol: "PADRE" }),
    linea({ descripcion: "Clásica", subtotalBrutoMxn: 0, totalItemMxn: 0, ivaItemMxn: 0, id: "h2", parentId: "p2", comboRol: "HIJO" }),
  ];
  const r = armarConceptos(lineas, 360);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo (Doble)", "Brownie", "Combo (Clásica)"]);
  cuadra(r);
});

test("un hijo sin padre en la lista se factura como renglón normal (no se pierde dinero)", () => {
  // El PADRE de OTRO combo va en la lista a propósito: sin él, esta prueba pasaba igual con el
  // plegado anulado (una lista sin padres no se colapsa nunca) y por tanto no discriminaba nada.
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" });
  const propio = linea({ descripcion: "Clásica", subtotalBrutoMxn: 0, totalItemMxn: 0, ivaItemMxn: 0, id: "h0", parentId: "p1", comboRol: "HIJO" });
  const h1 = linea({ descripcion: "Doble", subtotalBrutoMxn: 0, montoModificadoresMxn: 15, totalItemMxn: 15, ivaItemMxn: 2.07, id: "h1", parentId: "zz", comboRol: "HIJO" });
  const r = armarConceptos([padre, propio, h1], 190);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo (Clásica)", "Doble"]);
  assert.equal(r.conceptos[1].total, 15);
  cuadra(r);
});

// -- Tasas mixtas dentro de un combo (revisión final, hallazgo 1) ---------------------------
//
// El spec 8 decía "hijos con tasa distinta al padre: se asume la del padre". No se puede: el
// impuesto del hijo se calculó A SU TASA, y meterlo dentro de un concepto que declara la tasa del
// padre rompe la correspondencia entre tasa declarada e impuesto trasladado. Un hijo a precio 0 y
// sin extras no aporta nada y da igual; uno con extra pagado sí. Por eso solo se absorbe al hijo
// que comparte tasa Y régimen (IVA dentro/fuera) con su padre.
//
// TODAS las fixtures de arriba usan una sola tasa uniforme: por eso esto pasó desapercibido.

test("hijo a tasa 0 con extra pagado bajo un padre al 16 %: se factura aparte, no revienta", () => {
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({
    descripcion: "Pan para llevar", tasaIva: 0, subtotalBrutoMxn: 0, montoModificadoresMxn: 10,
    totalItemMxn: 10, ivaItemMxn: 0, id: "h1", parentId: "p1", comboRol: "HIJO",
  });
  // Antes: el plegado sumaba $10 al bruto del padre sin sumar IVA, el descuento salía negativo y
  // armarConceptos lanzaba ConceptosIncoherentes. El cliente no podía facturar su consumo.
  const r = armarConceptos([padre, h1], 185);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo", "Pan para llevar"]);
  assert.equal(r.conceptos[0].tasaIva, 16);
  assert.equal(r.conceptos[1].tasaIva, 0);
  assert.equal(r.conceptos[1].iva, 0);
  assert.equal(r.total, 185);
  cuadra(r);
});

test("hijo al 16 % con extra pagado bajo un padre a tasa 0: no se timbra tasa 0 con IVA", () => {
  const padre = linea({ descripcion: "Combo", tasaIva: 0, totalItemMxn: 175, ivaItemMxn: 0, id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({
    descripcion: "Cerveza", tasaIva: 16, subtotalBrutoMxn: 0, montoModificadoresMxn: 11.6,
    totalItemMxn: 11.6, ivaItemMxn: 1.6, id: "h1", parentId: "p1", comboRol: "HIJO",
  });
  // Este es el que fallaba EN SILENCIO: la aritmética cerraba, la red de seguridad no saltaba y
  // salía un concepto único que declaraba tasa 0.00 sobre $185 de base con $1.60 de traslado.
  const r = armarConceptos([padre, h1], 186.6);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo", "Cerveza"]);
  assert.equal(r.conceptos[0].tasaIva, 0);
  assert.equal(r.conceptos[0].iva, 0);
  assert.equal(r.conceptos[1].tasaIva, 16);
  assert.equal(r.conceptos[1].iva, 1.6);
  cuadra(r);
});

test("mismo porcentaje pero distinto régimen (IVA dentro vs. fuera) tampoco se absorbe", () => {
  const padre = linea({ descripcion: "Combo", totalItemMxn: 116, ivaItemMxn: 16, id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({
    descripcion: "Ensalada", ivaIncluidoEnPrecio: false, subtotalBrutoMxn: 0, montoModificadoresMxn: 20,
    totalItemMxn: 23.2, ivaItemMxn: 3.2, id: "h1", parentId: "p1", comboRol: "HIJO",
  });
  const r = armarConceptos([padre, h1], 139.2);
  assert.equal(r.conceptos.length, 2);
  assert.equal(r.conceptos[0].importe, 100);
  assert.equal(r.conceptos[1].importe, 20);
  cuadra(r);
});

test("un hijo a precio cero y tasa distinta va en el nombre igual que sus hermanos", () => {
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" });
  const h1 = linea({ descripcion: "Doble", subtotalBrutoMxn: 0, totalItemMxn: 0, ivaItemMxn: 0, id: "h1", parentId: "p1", comboRol: "HIJO" });
  const h2 = linea({ descripcion: "Refresco", tasaIva: 0, subtotalBrutoMxn: 0, totalItemMxn: 0, ivaItemMxn: 0, id: "h2", parentId: "p1", comboRol: "HIJO" });
  const r = armarConceptos([padre, h1, h2], 175);
  // La tasa del hijo solo importa cuando hay impuesto que declarar. Aquí no cobra nada, así que se
  // pliega igual que el hermano al 16 % y el combo sigue siendo UN concepto, como manda el ADR 0015.
  assert.equal(r.total, 175);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo (Doble, Refresco)"]);
  cuadra(r);
});

test("el hijo sin dinero y con tasa distinta se pliega en el nombre del padre", () => {
  // El caso que el diseño tenía en mente: combo al 16 % con IVA dentro cuyo bolillo va a tasa 0.
  // El bolillo no cobra un peso —los hijos van a precio 0 por construcción— así que separarlo en
  // su propio concepto no protege ninguna tasa: solo agrega un renglón con base 0, y el Anexo 20
  // exige que la base de un traslado sea mayor que cero. Sin dinero de por medio, el hijo aporta
  // únicamente su nombre, y ahí es donde tiene que ir.
  const padre = linea({ descripcion: "Combo", totalItemMxn: 175, ivaItemMxn: 24.14, id: "p1", parentId: null, comboRol: "PADRE" });
  const bolillo = linea({
    descripcion: "Bolillo", tasaIva: 0, subtotalBrutoMxn: 0, montoModificadoresMxn: 0,
    totalItemMxn: 0, ivaItemMxn: 0, id: "h1", parentId: "p1", comboRol: "HIJO",
  });
  const r = armarConceptos([padre, bolillo], 175);
  assert.deepEqual(r.conceptos.map((c) => c.descripcion), ["Combo (Bolillo)"]);
  assert.equal(r.conceptos[0].tasaIva, 16);
  assert.equal(r.conceptos[0].importe, 150.86);
  assert.equal(r.conceptos[0].iva, 24.14);
  assert.equal(r.total, 175);
  cuadra(r);
});
