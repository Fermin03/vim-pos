import { describe, it, expect } from "vitest";
import { agruparComandaPorArea, construirComandaJob, debeImprimirComandaAlCobrar, type DatosComanda } from "../comanda-builder";

const D: DatosComanda = {
  folio: "KC-2026-000001",
  modoServicio: "PARA LLEVAR",
  cajero: "María G.",
  caja: "Caja 01",
  fechaIso: "2026-06-04T14:32:00.000Z",
  lineas: [
    { cantidad: 1, nombre: "Hamburguesa Clásica", modificadores: ["Tres cuartos", "Extra queso"], notaCocina: "Sin cebolla" },
    { cantidad: 2, nombre: "Papas Gajo", modificadores: [], notaCocina: null },
  ],
  ancho: 80,
};

describe("construirComandaJob", () => {
  it("arma el PrintJob de la comanda (encabezado, líneas grandes, modificadores, nota, sin precios)", () => {
    const job = construirComandaJob(D);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);

    // Encabezado: modo invertido (bloque negro en pantalla) + orden (folio corto) + hora
    expect(job.bloques).toContainEqual({ t: "texto", valor: "PARA LLEVAR", align: "centro", size: 3, bold: true, invertido: true });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Orden", der: "#0001", bold: true });

    // Líneas grandes con cantidad+nombre
    expect(job.bloques).toContainEqual({ t: "texto", valor: "1x Hamburguesa Clásica", size: 2, bold: true });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "2x Papas Gajo", size: 2, bold: true });

    // Modificadores "add" prefijados "+" (igual que ReciboComanda)
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  + Tres cuartos", size: 1, bold: false });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  + Extra queso", size: 1, bold: false });

    // Nota cocina prominente
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  > Sin cebolla", size: 1, bold: true });

    // Pie con cajero
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Cajero", der: "María G." });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Caja", der: "Caja 01" });

    // SIN precios, SIN QR, SIN totales
    expect(job.bloques.find((b) => b.t === "qr")).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "fila" && /TOTAL|Subtotal|IVA/.test(b.izq))).toBeUndefined();
    expect(job.bloques.find((b) => b.t === "texto" && /\$/.test(b.valor))).toBeUndefined();

    // Termina con corte
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("omite la línea de nota cuando no hay nota", () => {
    const sinNota: DatosComanda = { ...D, lineas: [{ cantidad: 1, nombre: "X", modificadores: [], notaCocina: null }] };
    const job = construirComandaJob(sinNota);
    expect(job.bloques.find((b) => b.t === "texto" && b.valor.startsWith("  >"))).toBeUndefined();
  });

  it("resalta un modificador de quita (Sin/No/Quitar) en mayúsculas y negrita", () => {
    const conQuita: DatosComanda = {
      ...D,
      lineas: [{ cantidad: 1, nombre: "Hamburguesa", modificadores: ["Sin cebolla"], notaCocina: null }],
    };
    const job = construirComandaJob(conQuita);
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  SIN CEBOLLA", size: 1, bold: true });
  });
});

describe("construirComandaJob — a nombre de quién", () => {
  it("imprime el cliente debajo de la hora, para rotular la bolsa", () => {
    const filas = construirComandaJob({ ...D, cliente: "Juan" })
      .bloques.filter((b) => b.t === "fila") as { izq: string; der: string }[];
    const i = filas.findIndex((f) => f.izq === "Cliente");
    expect(i).toBeGreaterThan(-1);
    expect(filas[i].der).toBe("Juan");
    expect(filas[i - 1].izq).toBe("Hora");
  });

  it("no imprime la fila cuando el pedido no tiene nombre", () => {
    const filas = construirComandaJob(D).bloques.filter((b) => b.t === "fila") as { izq: string }[];
    expect(filas.some((f) => f.izq === "Cliente")).toBe(false);
  });
});

describe("construirComandaJob — agregado a una orden en curso", () => {
  it("avisa que es un agregado, antes de cualquier producto", () => {
    const b = construirComandaJob({ ...D, esAgregado: true }).bloques;
    const iAviso = b.findIndex((x) => x.t === "texto" && (x as { valor: string }).valor.includes("AGREGADO"));
    const iProducto = b.findIndex((x) => x.t === "texto" && (x as { valor: string }).valor.includes("Hamburguesa"));
    expect(iAviso).toBeGreaterThan(-1);
    expect(iAviso).toBeLessThan(iProducto);
  });

  it("no lo avisa en la primera comanda: ahí no hay nada previo que la cocina confunda", () => {
    const hay = construirComandaJob(D).bloques.some((x) => x.t === "texto" && (x as { valor: string }).valor.includes("AGREGADO"));
    expect(hay).toBe(false);
  });
});

describe("debeImprimirComandaAlCobrar", () => {
  it("imprime en Para llevar: es el único modo que nunca pasa por 'Enviar a cocina'", () => {
    expect(debeImprimirComandaAlCobrar("PARA_LLEVAR", true)).toBe(true);
  });

  it("NO imprime en comedor, Pick-up ni Domicilio: su comanda ya salió al enviar el pedido", () => {
    for (const modo of ["COMER_AQUI", "MESA", "DRIVE_THRU", "DELIVERY_PROPIO"]) {
      expect(debeImprimirComandaAlCobrar(modo, true)).toBe(false);
    }
  });

  it("sin estación de cocina propia no imprime: saldría por la de caja, detrás del ticket", () => {
    expect(debeImprimirComandaAlCobrar("PARA_LLEVAR", false)).toBe(false);
  });

  it("un modo desconocido no imprime: ante la duda, papel de menos y no una comanda repetida", () => {
    expect(debeImprimirComandaAlCobrar("", true)).toBe(false);
    expect(debeImprimirComandaAlCobrar("MODO_NUEVO", true)).toBe(false);
  });
});

describe("comanda de CANCELACIÓN", () => {
  const cancelada: DatosComanda = {
    folio: "KO1C-2026-000042", modoServicio: "COMER AQUÍ", cajero: "María", caja: "Caja 01",
    fechaIso: "2026-08-19T20:00:00.000Z", esCancelacion: true, ancho: 80,
    lineas: [{ cantidad: 2, nombre: "Chiken Crunch", modificadores: ["Sin cebolla"], notaCocina: null }],
  };
  const textos = (d: DatosComanda) =>
    construirComandaJob(d).bloques.filter((b) => b.t === "texto").map((b) => String((b as { valor: string }).valor));

  it("lo primero que se ve es CANCELADO y NO PREPARAR", () => {
    const t = textos(cancelada);
    expect(t[0]).toBe("CANCELADO");
    expect(t[1]).toBe("NO PREPARAR");
  });

  it("cada renglón se marca por su cuenta, por si el papel se lee a medias", () => {
    expect(textos(cancelada).some((v) => v.startsWith("CANCELA 2x Chiken Crunch"))).toBe(true);
  });

  it("una comanda normal NO dice nada de cancelación", () => {
    const t = textos({ ...cancelada, esCancelacion: false });
    expect(t.some((v) => /CANCELA/.test(v))).toBe(false);
    expect(t[0]).toBe("COMER AQUÍ");
  });

  it("cancelación y agregado no se mezclan: manda el aviso de cancelación", () => {
    const t = textos({ ...cancelada, esAgregado: true });
    expect(t.some((v) => /AGREGADO A LA ORDEN/.test(v))).toBe(false);
    expect(t[0]).toBe("CANCELADO");
  });
});

describe("agruparComandaPorArea — la comanda se parte por estación", () => {
  const L = (nombre: string, areaId: string | null, areaNombre: string | null) => ({
    cantidad: 1, nombre, modificadores: [], notaCocina: null, areaId, areaNombre,
  });

  it("manda cada producto a su estación, conservando el orden de captura", () => {
    const g = agruparComandaPorArea([
      L("Hamburguesa", "a-cocina", "Cocina"),
      L("Refresco", "a-barra", "Barra"),
      L("Papas", "a-cocina", "Cocina"),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]?.areaNombre).toBe("Cocina");
    expect(g[0]?.lineas.map((l) => l.nombre)).toEqual(["Hamburguesa", "Papas"]);
    expect(g[1]?.areaNombre).toBe("Barra");
    expect(g[1]?.lineas.map((l) => l.nombre)).toEqual(["Refresco"]);
  });

  it("un negocio sin estaciones configuradas imprime UN solo papel, sin rótulo", () => {
    // Es el caso de quien no ha tocado nada: debe seguir imprimiendo exactamente como antes.
    const g = agruparComandaPorArea([L("Hamburguesa", null, null), L("Refresco", null, null)]);
    expect(g).toHaveLength(1);
    expect(g[0]?.areaId).toBeNull();
    expect(g[0]?.areaNombre).toBeNull();
    expect(g[0]?.lineas).toHaveLength(2);
  });

  it("los productos sin estación no se pierden: salen en su propio papel", () => {
    // Si un producto nuevo se queda sin asignar, tiene que imprimirse igual. Perderlo dejaría a
    // la cocina sin enterarse de un renglón del pedido.
    const g = agruparComandaPorArea([L("Refresco", "a-barra", "Barra"), L("Producto nuevo", null, null)]);
    expect(g).toHaveLength(2);
    const sinArea = g.find((x) => x.areaId === null);
    expect(sinArea?.lineas.map((l) => l.nombre)).toEqual(["Producto nuevo"]);
  });

  it("el rótulo de la estación se imprime en el encabezado", () => {
    const job = construirComandaJob({
      folio: "KO1C-2026-000001", modoServicio: "Para llevar", cajero: "María", caja: "Caja 01",
      fechaIso: "2026-08-21T18:00:00.000Z", area: "Barra",
      lineas: [{ cantidad: 1, nombre: "Refresco", modificadores: [], notaCocina: null }], ancho: 80,
    });
    const texto = job.bloques.filter((b) => b.t === "texto").map((b) => (b as { valor: string }).valor);
    expect(texto).toContain("BARRA");
  });
});
