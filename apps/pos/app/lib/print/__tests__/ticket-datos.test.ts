import { describe, it, expect } from "vitest";
import { foldearHijosEnPadre, SELECCION_TICKET_ITEMS_IMPRESION, urlAutofactura, resumenLealtadTicket } from "../ticket-datos";
import type { LineaImpresion } from "../tipos";

/** Fixture mínima: solo llena lo que cada caso necesita, el resto son valores neutros. */
const L = (x: Partial<LineaImpresion> & { id: string; nombre: string; totalMxn: number }): LineaImpresion => ({
  cantidad: 1,
  modificadores: [],
  notaCocina: null,
  comboRol: null,
  parentId: null,
  grupoNombre: null,
  extras: [],
  ...x,
});

describe("foldearHijosEnPadre", () => {
  it("suma al PADRE el extra de un HIJO con costo", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" }),
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(185);
    expect(out.find((l) => l.id === "H1")!.totalMxn).toBe(15); // el hijo no cambia
  });

  it("dos hijos, solo uno con extra: suma solo lo que corresponde", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" }), // trae extra
      L({ id: "H2", nombre: "Refresco", totalMxn: 0, comboRol: "HIJO", parentId: "P" }), // sin extra
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(185);
  });

  it("dos combos en el mismo ticket: cada padre suma solo lo de sus propios hijos", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P1", nombre: "Combo A", totalMxn: 170, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Doble", totalMxn: 10, comboRol: "HIJO", parentId: "P1" }),
      L({ id: "P2", nombre: "Combo B", totalMxn: 130, comboRol: "PADRE" }),
      L({ id: "H2", nombre: "Tocino", totalMxn: 20, comboRol: "HIJO", parentId: "P2" }),
    ]);
    expect(out.find((l) => l.id === "P1")!.totalMxn).toBe(180);
    expect(out.find((l) => l.id === "P2")!.totalMxn).toBe(150);
  });

  it("ticket sin combos: no toca nada", () => {
    const lineas = [
      L({ id: "A", nombre: "Hamburguesa Clásica", totalMxn: 120 }),
      L({ id: "B", nombre: "Papas", totalMxn: 45 }),
    ];
    const out = foldearHijosEnPadre(lineas);
    expect(out.map((l) => l.totalMxn)).toEqual([120, 45]);
  });

  it("hijo huérfano (padre ausente de la lista): no revienta y no inventa un total", () => {
    const out = foldearHijosEnPadre([
      L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P-QUE-NO-ESTA" }),
      L({ id: "P2", nombre: "Combo B", totalMxn: 130, comboRol: "PADRE" }),
    ]);
    expect(out.find((l) => l.id === "H1")!.totalMxn).toBe(15);
    // El padre que sí existe no recibe nada del huérfano de otro combo.
    expect(out.find((l) => l.id === "P2")!.totalMxn).toBe(130);
  });

  it("PADRE sin ningún hijo: se queda igual (?? 0, no NaN ni undefined)", () => {
    const out = foldearHijosEnPadre([L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" })]);
    expect(out[0]!.totalMxn).toBe(170);
  });

  it("no muta el arreglo recibido ni los objetos que contiene", () => {
    const padre = L({ id: "P", nombre: "Combo", totalMxn: 170, comboRol: "PADRE" });
    const hijo = L({ id: "H1", nombre: "Doble", totalMxn: 15, comboRol: "HIJO", parentId: "P" });
    const lineas = [padre, hijo];
    const copiaJson = JSON.parse(JSON.stringify(lineas));

    const out = foldearHijosEnPadre(lineas);

    expect(lineas).toEqual(copiaJson); // el arreglo original, intacto
    expect(padre.totalMxn).toBe(170); // el objeto original del padre, intacto
    expect(out).not.toBe(lineas); // devuelve un arreglo nuevo
    expect(out.find((l) => l.id === "P")).not.toBe(padre); // el padre modificado es una copia nueva
  });

  it("redondea a centavos (evita arrastrar errores de punto flotante)", () => {
    const out = foldearHijosEnPadre([
      L({ id: "P", nombre: "Combo", totalMxn: 100.1, comboRol: "PADRE" }),
      L({ id: "H1", nombre: "Extra", totalMxn: 0.2, comboRol: "HIJO", parentId: "P" }),
    ]);
    expect(out.find((l) => l.id === "P")!.totalMxn).toBe(100.3);
  });
});

describe("SELECCION_TICKET_ITEMS_IMPRESION — la proyección que pide leerTicketParaImpresion", () => {
  it("incluye cargo_tipo: sin este campo el ticket pierde de dónde sale cargoTipo", () => {
    expect(SELECCION_TICKET_ITEMS_IMPRESION).toContain("cargo_tipo");
  });
});

describe("urlAutofactura — el QR lleva el token del ticket (auditoría 30/09/2026, C1-4)", () => {
  it("con token: folio + t, sin más", () => {
    expect(urlAutofactura("knockout-dev", "KO1C-2026-000130", "oHXZ0mOEW2qggLEN")).toBe(
      "https://factura.vimpos.com.mx/knockout-dev?folio=KO1C-2026-000130&t=oHXZ0mOEW2qggLEN",
    );
  });
  it("sin token (escritorio sin secreto o fallo de la consulta): solo el folio; el portal pide el total", () => {
    expect(urlAutofactura("knockout-dev", "KO1C-2026-000130", null)).toBe(
      "https://factura.vimpos.com.mx/knockout-dev?folio=KO1C-2026-000130",
    );
  });
  it("un token con otra forma no se imprime (no se promete un QR que el portal va a rechazar)", () => {
    expect(urlAutofactura("knockout-dev", "F-1", "corto")).toBe("https://factura.vimpos.com.mx/knockout-dev?folio=F-1");
  });
  it("escapa el código y el folio", () => {
    expect(urlAutofactura(null, "A&B", null)).toBe("https://factura.vimpos.com.mx/negocio?folio=A%26B");
  });
});

describe("resumenLealtadTicket — el pie de lealtad del ticket", () => {
  const programa = { mecanica: "PUNTOS_DINERO" as const, version: 2, porcentaje: 5, pesosPorPunto: null, compraMinima: 0, topeComprasDia: 3 };
  const base = {
    programa, clienteNombre: "Ana Gómez", cobrada: true, baseComida: 200, esApp: false,
    movimientos: [{ tipo: "GANADO", puntos: 10, saldo_visto: 130, programa_version: 2, fecha: "2026-10-06T18:00:00+00:00" }],
    saldo: { saldo: 500, vence_el: "2027-04-05", programa_version: 2 },
  };

  it("cuenta cobrada: lo ganado y el saldo que quedó ESE día, para que la reimpresión salga idéntica", () => {
    expect(resumenLealtadTicket(base)).toEqual({ cliente: "Ana", unidad: "puntos", ganado: 10, porGanar: 0, saldo: 130, venceEl: "2027-04-05" });
  });

  it("una devolución parcial baja lo ganado; nunca sale negativo", () => {
    const movimientos = [
      ...base.movimientos,
      { tipo: "REVERSA_GANADO", puntos: -4, saldo_visto: 126, programa_version: 2, fecha: "2026-10-06T19:00:00+00:00" },
    ];
    expect(resumenLealtadTicket({ ...base, movimientos })).toMatchObject({ ganado: 6, saldo: 126 });
    expect(resumenLealtadTicket({ ...base, movimientos: [{ ...movimientos[1] }] })).toMatchObject({ ganado: 0 });
  });

  it("cuenta sin cobrar: dice lo que ganará al pagar y el saldo de hoy", () => {
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [] }))
      .toEqual({ cliente: "Ana", unidad: "puntos", ganado: 0, porGanar: 10, saldo: 500, venceEl: "2027-04-05" });
  });

  it("un canje sin cobrar no cuenta como ganado, pero el saldo ya lo refleja", () => {
    const movimientos = [{ tipo: "CANJE", puntos: -50, saldo_visto: 450, programa_version: 2, fecha: "2026-10-06T18:00:00+00:00" }];
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos, saldo: { ...base.saldo, saldo: 450 } }))
      .toMatchObject({ ganado: 0, saldo: 450 });
  });

  it("los movimientos y el saldo de otra versión del programa no valen", () => {
    const r = resumenLealtadTicket({
      ...base,
      movimientos: [{ ...base.movimientos[0], programa_version: 1 }],
      saldo: { saldo: 500, vence_el: "2027-04-05", programa_version: 1 },
    });
    expect(r).toMatchObject({ ganado: 0, saldo: 0, venceEl: null });
  });

  it("cliente nuevo, sin fila de saldo: saldo 0, no null", () => {
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [], saldo: null })).toMatchObject({ saldo: 0, venceEl: null });
  });

  it("los sellos se llaman sellos, y un pedido de app no promete ganar", () => {
    const sellos = { ...programa, mecanica: "SELLOS" as const };
    expect(resumenLealtadTicket({ ...base, programa: sellos, cobrada: false, movimientos: [] })).toMatchObject({ unidad: "sellos", porGanar: 1 });
    expect(resumenLealtadTicket({ ...base, cobrada: false, movimientos: [], esApp: true })).toMatchObject({ porGanar: 0 });
  });

  it("del cliente solo sale el nombre de pila", () => {
    expect(resumenLealtadTicket({ ...base, clienteNombre: "  María José Pérez " }).cliente).toBe("María");
    expect(resumenLealtadTicket({ ...base, clienteNombre: null }).cliente).toBeNull();
  });
});
