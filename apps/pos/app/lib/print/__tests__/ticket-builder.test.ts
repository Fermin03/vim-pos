import { describe, it, expect } from "vitest";
import { debeImprimirTicketAlCobrar, construirTicketJob } from "../ticket-builder";
import type { DatosTicketImpresion } from "../tipos";

const DATOS: DatosTicketImpresion = {
  negocio: { nombre: "Knock-Out Burger", razonSocial: "Knock-Out SA de CV", rfc: "KOB210101AAA" },
  sucursal: { nombre: "León Centro", direccion: "Av. Insurgentes 234, Centro, León, Gto. CP 37000", telefono: "477 712 5500" },
  meta: { folio: "KC-2026-000001", fechaIso: "2026-06-03T00:14:00.000Z", cajero: "María G.", caja: "Caja 01", modoServicio: "Para llevar", modo: "PARA_LLEVAR" },
  lineas: [
    { cantidad: 1, nombre: "Hamburguesa Clásica", totalMxn: 120, modificadores: ["Tres cuartos", "Extra queso"], notaCocina: null },
  ],
  totales: { subtotal: 103.45, descuentos: 12, iva: 16.55, total: 108, propina: 18 },
  pagos: [{ metodo: "Efectivo", montoMxn: 126, recibidoMxn: 200, cambioMxn: 74 }],
  entrega: null,
  qrUrl: "https://factura.vimpos.com.mx/knockout?folio=KC-2026-000001",
  ancho: 80,
};

describe("construirTicketJob", () => {
  it("arma el PrintJob TICKET con encabezado, líneas, totales, pago y QR", () => {
    const job = construirTicketJob(DATOS);
    expect(job.tipo).toBe("TICKET");
    expect(job.ancho).toBe(80);
    expect(job.destino).toBe("CAJA");
    expect(job.abrir_cajon).toBe(false);

    // Encabezado
    expect(job.bloques[0]).toEqual({ t: "texto", valor: "Knock-Out Burger", align: "centro", size: 2, bold: true });
    // Folio corto (mismo criterio que ReciboTicket en pantalla)
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Ticket", der: "#2026-000001" });
    // La línea aparece como fila nombre/precio
    expect(job.bloques).toContainEqual({ t: "fila", izq: "1x Hamburguesa Clásica", der: "$120.00" });
    // Modificadores prefijados "+" (igual que ReciboTicket)
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  + Tres cuartos", size: 1 });
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  + Extra queso", size: 1 });
    // Totales
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Subtotal", der: "$103.45" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Descuento", der: "-$12.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "IVA (16%)", der: "$16.55" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "TOTAL", der: "$108.00", bold: true });
    // Pago — igual que ReciboTicket: forma de pago (no el monto), luego recibido/cambio
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Forma de pago", der: "Efectivo" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Recibido", der: "$200.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Cambio", der: "$74.00" });
    expect(job.bloques).toContainEqual({ t: "fila", izq: "Propina", der: "$18.00" });
    // QR + corte
    expect(job.bloques).toContainEqual({ t: "qr", valor: "https://factura.vimpos.com.mx/knockout?folio=KC-2026-000001" });
    expect(job.bloques[job.bloques.length - 1]).toEqual({ t: "corte" });
  });

  it("omite la línea de descuento cuando es 0", () => {
    const sinDesc = { ...DATOS, totales: { ...DATOS.totales, descuentos: 0 } };
    const job = construirTicketJob(sinDesc);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Descuento")).toBeUndefined();
  });

  it("omite Propina cuando es 0", () => {
    const sinProp = { ...DATOS, totales: { ...DATOS.totales, propina: 0 } };
    const job = construirTicketJob(sinProp);
    expect(job.bloques.find((b) => b.t === "fila" && b.izq === "Propina")).toBeUndefined();
  });

  it("imprime la nota de cocina de la línea (antes se perdía en papel)", () => {
    const conNota = {
      ...DATOS,
      lineas: [{ ...DATOS.lineas[0]!, notaCocina: "Sin cebolla" }],
    };
    const job = construirTicketJob(conNota);
    expect(job.bloques).toContainEqual({ t: "texto", valor: "  > Sin cebolla", size: 1 });
  });
});

describe("construirTicketJob — datos de entrega (domicilio)", () => {
  const CON_ENTREGA: DatosTicketImpresion = {
    ...DATOS,
    meta: { ...DATOS.meta, modoServicio: "Domicilio" },
    entrega: {
      cliente: "Fermín Villalobos",
      telefono: "477 100 2030",
      direccion: "Blvd. Adolfo López Mateos 1500 int. 4, Jardines del Moral, León, Gto., CP 37160",
      referencias: "Portón negro frente al parque",
      notasRepartidor: "El timbre no sirve, hablar por teléfono",
    },
  };

  it("imprime nombre, teléfono, dirección, referencias y notas del repartidor", () => {
    const texto = construirTicketJob(CON_ENTREGA)
      .bloques.filter((b) => b.t === "texto")
      .map((b) => (b as { valor: string }).valor);
    expect(texto).toContain("DATOS DE ENTREGA");
    expect(texto).toContain("Fermín Villalobos");
    expect(texto).toContain("Tel. 477 100 2030");
    expect(texto.some((v) => v.includes("Jardines del Moral"))).toBe(true);
    expect(texto).toContain("Ref: Portón negro frente al parque");
    expect(texto).toContain("Nota: El timbre no sirve, hablar por teléfono");
  });

  it("imprime la dirección en el mismo tamaño que el nombre y el teléfono", () => {
    // El repartidor lee esto en la calle, de noche y sobre papel térmico. Estuvo en tamaño normal
    // —el más pequeño de los tres— hasta que la caja pidió agrandarlo.
    const bloques = construirTicketJob(CON_ENTREGA).bloques.filter((b) => b.t === "texto") as {
      valor: string; size?: number;
    }[];
    const dir = bloques.find((b) => b.valor.includes("Jardines del Moral"));
    // Por número, no por "Tel.": el encabezado del ticket ya trae el teléfono de la SUCURSAL y
    // sale antes, así que buscar por prefijo devolvía ese y no el del cliente.
    const tel = bloques.find((b) => b.valor.includes("477 100 2030"));
    expect(dir?.size).toBe(2);
    expect(dir?.size).toBe(tel?.size);
  });

  it("pone la entrega ANTES de los productos, para que el repartidor la lea primero", () => {
    const b = construirTicketJob(CON_ENTREGA).bloques;
    const iEntrega = b.findIndex((x) => x.t === "texto" && (x as { valor: string }).valor === "DATOS DE ENTREGA");
    const iProducto = b.findIndex((x) => x.t === "fila" && (x as { izq: string }).izq.includes("Hamburguesa"));
    expect(iEntrega).toBeGreaterThan(-1);
    expect(iEntrega).toBeLessThan(iProducto);
  });

  it("no imprime datos del cliente cuando no es domicilio", () => {
    const texto = construirTicketJob(DATOS)
      .bloques.filter((b) => b.t === "texto")
      .map((b) => (b as { valor: string }).valor);
    expect(texto).not.toContain("DATOS DE ENTREGA");
  });

  it("omite los renglones que vengan vacíos sin romper el ticket", () => {
    const texto = construirTicketJob({
      ...CON_ENTREGA,
      entrega: { cliente: "Ana", telefono: null, direccion: null, referencias: null, notasRepartidor: null },
    }).bloques.filter((b) => b.t === "texto").map((b) => (b as { valor: string }).valor);
    expect(texto).toContain("Ana");
    expect(texto.some((v) => v.startsWith("Tel. 477 100"))).toBe(false);
    expect(texto.some((v) => v.startsWith("Ref: "))).toBe(false);
  });
});

describe("construirTicketJob — nombre suelto de la cuenta (Pick-up)", () => {
  it("imprime el nombre debajo del servicio, para identificar el pedido al entregarlo", () => {
    const job = construirTicketJob({
      ...DATOS,
      meta: { ...DATOS.meta, modoServicio: "Pick-up", nombreCliente: "Juan" },
    });
    const filas = job.bloques.filter((b) => b.t === "fila") as { izq: string; der: string }[];
    const i = filas.findIndex((f) => f.izq === "Cliente");
    expect(i).toBeGreaterThan(-1);
    expect(filas[i].der).toBe("Juan");
    expect(filas[i - 1].izq).toBe("Servicio");
  });

  it("no imprime la fila cuando no se capturó nombre", () => {
    const filas = construirTicketJob(DATOS).bloques.filter((b) => b.t === "fila") as { izq: string }[];
    expect(filas.some((f) => f.izq === "Cliente")).toBe(false);
  });
});

describe("construirTicketJob — QR de autofacturación opcional", () => {
  it("lo imprime cuando el negocio lo tiene activado", () => {
    const b = construirTicketJob(DATOS).bloques;
    expect(b.some((x) => x.t === "qr")).toBe(true);
    expect(b.some((x) => x.t === "texto" && (x as { valor: string }).valor.includes("¿Necesitas factura?"))).toBe(true);
  });

  it("apagado: ni QR ni la leyenda que lo acompaña", () => {
    // Sin portal detrás, ofrecer factura es prometer algo que nadie puede cumplir.
    const b = construirTicketJob({ ...DATOS, qrUrl: null }).bloques;
    expect(b.some((x) => x.t === "qr")).toBe(false);
    expect(b.some((x) => x.t === "texto" && (x as { valor: string }).valor.includes("factura"))).toBe(false);
  });

  it("apagado, el ticket sigue completo: gracias y corte", () => {
    const b = construirTicketJob({ ...DATOS, qrUrl: null }).bloques;
    expect(b.some((x) => x.t === "texto" && (x as { valor: string }).valor.includes("¡Gracias por su compra!"))).toBe(true);
    expect(b[b.length - 1]!.t).toBe("corte");
  });
});

describe("debeImprimirTicketAlCobrar — qué modo saca papel al cobrar", () => {
  it("Para llevar SÍ: va del carrito al cobro y no hay otro momento para imprimirlo", () => {
    expect(debeImprimirTicketAlCobrar("PARA_LLEVAR")).toBe(true);
  });

  it("comedor, Pick-up y domicilio NO: su ticket ya se imprimió desde la cuenta", () => {
    // Imprimirlo aquí sacaba un segundo papel idéntico del mismo pedido.
    for (const modo of ["COMER_AQUI", "MESA", "DRIVE_THRU", "DELIVERY_PROPIO"]) {
      expect(debeImprimirTicketAlCobrar(modo)).toBe(false);
    }
  });

  it("un modo desconocido no imprime: ante la duda, no se gasta papel de más", () => {
    expect(debeImprimirTicketAlCobrar("")).toBe(false);
    expect(debeImprimirTicketAlCobrar("MODO_NUEVO")).toBe(false);
  });
});
