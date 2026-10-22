import { describe, expect, it } from "vitest";
import { RESERVAS_POR_OMISION, enlaceReservas, reembolsoDeFila, reglasReservasSchema, whatsappCompartir } from "../reservas";
import { BASE_TIENDA } from "../tienda-reglas";
import { NOMBRE_ADDON_TIENDA, nombreDeAddon, seccionEnLinea } from "../tienda-plan";
import { servicioSchema } from "../agenda";

describe("reglas de las reservas (los CHECK de 0224)", () => {
  const ok = (d: unknown) => reglasReservasSchema.safeParse(d).success;
  it("acepta los bordes y los de fábrica", () => {
    expect(ok({ dias: 1, intervalo: 5, avisoHoras: 0 })).toBe(true);
    expect(ok({ dias: 120, intervalo: 60, avisoHoras: 72 })).toBe(true);
    const { activo: _, ...reglas } = RESERVAS_POR_OMISION;
    expect(ok(reglas)).toBe(true);
  });
  it("rechaza fuera de rango, decimales y vacíos", () => {
    for (const dias of [0, 121, 1.5, NaN]) expect(ok({ dias, intervalo: 15, avisoHoras: 2 })).toBe(false);
    for (const avisoHoras of [-1, 73, 2.5, NaN]) expect(ok({ dias: 30, intervalo: 15, avisoHoras })).toBe(false);
  });
  it("solo los intervalos permitidos", () => {
    for (const intervalo of [5, 10, 15, 20, 30, 60]) expect(ok({ dias: 30, intervalo, avisoHoras: 2 })).toBe(true);
    for (const intervalo of [0, 7, 25, 45, 90]) expect(ok({ dias: 30, intervalo, avisoHoras: 2 })).toBe(false);
  });
});

describe("enlace para compartir", () => {
  it("usa BASE_TIENDA (no una dirección fija) y WhatsApp sin destinatario", () => {
    const e = enlaceReservas("salon-ana");
    expect(e).toBe(`https://${BASE_TIENDA}/salon-ana`);
    expect(whatsappCompartir(e)).toBe(`https://wa.me/?text=${encodeURIComponent(`Aparta tu cita en línea: ${e}`)}`);
  });
});

describe("reembolsos por resolver", () => {
  it("de la fila con su cita", () => {
    expect(reembolsoDeFila({ id: "p1", monto_mxn: "150.50", created_at: "2026-10-18T16:00:00Z", cita: { inicia: "2026-10-20T17:00:00Z", cliente_nombre: "Camila" } }))
      .toEqual({ id: "p1", cita: "2026-10-20T17:00:00Z", clienta: "Camila", monto: 150.5, fecha: "2026-10-18T16:00:00Z" });
  });
  it("sin cita a la vista (o como arreglo, o nombre vacío)", () => {
    expect(reembolsoDeFila({ id: "p2", monto_mxn: 90, created_at: "x", cita: null })).toMatchObject({ cita: null, clienta: "—", monto: 90 });
    expect(reembolsoDeFila({ id: "p3", monto_mxn: 90, created_at: "x", cita: [{ inicia: "y", cliente_nombre: " " }] })).toMatchObject({ cita: "y", clienta: "—" });
  });
});

describe("pestañas de la sección según los módulos", () => {
  const con = (efectivos: Record<string, boolean>) => ({ permitidos: {}, efectivos });
  const HOY = ["General|/tienda", "Pedidos y pagos|/tienda/pedidos", "Sucursales y horarios|/tienda/sucursales", "Menú|/tienda/menu"];
  const de = (m: Parameters<typeof seccionEnLinea>[0]) => seccionEnLinea(m).pestanas.map((p) => `${p.label}|${p.href}`);

  it("restaurante o tienda (o sin leer): exactamente lo de antes", () => {
    for (const m of [null, "error" as const, con({}), con({ tienda: true }), con({ agenda: false, tienda: true })]) {
      expect(de(m)).toEqual(HOY);
      expect(seccionEnLinea(m)).toMatchObject({ agenda: false, titulo: "Tienda en línea", conPedidos: true });
    }
  });
  it("con agenda y sin vender en línea: En línea, Reservas y Pagos, sin Menú", () => {
    expect(de(con({ agenda: true }))).toEqual(["General|/tienda", "Reservas|/tienda/reservas", "Pagos|/tienda/pedidos", "Sucursales|/tienda/sucursales"]);
    expect(seccionEnLinea(con({ agenda: true }))).toMatchObject({ agenda: true, titulo: "En línea", conPedidos: false });
  });
  it("con agenda y la tienda encendida: también pedidos y Menú", () => {
    expect(de(con({ agenda: true, tienda: true }))).toEqual([
      "General|/tienda", "Reservas|/tienda/reservas", "Pedidos y pagos|/tienda/pedidos", "Sucursales|/tienda/sucursales", "Menú|/tienda/menu",
    ]);
    expect(seccionEnLinea(con({ agenda: true, tienda: true })).conPedidos).toBe(true);
  });
});

describe("etiqueta del add-on", () => {
  it("TIENDA se llama En línea (tienda y reservas); los demás, como vienen", () => {
    expect(NOMBRE_ADDON_TIENDA).toBe("En línea (tienda y reservas)");
    expect(nombreDeAddon("TIENDA", "Tienda en línea")).toBe(NOMBRE_ADDON_TIENDA);
    expect(nombreDeAddon("LEALTAD", "Programa de lealtad")).toBe("Programa de lealtad");
  });
});

describe("servicio: se reserva en línea", () => {
  const BASE = { nombre: "Corte", categoria_id: "99999999-0000-0000-0000-0000000000aa", precio_base_mxn: 180, duracion_min: 30, tipo_espacio_id: null, comision: null, anticipo: null };
  it("de fábrica en línea, como la base; se puede apagar", () => {
    expect(servicioSchema.parse(BASE).en_linea).toBe(true);
    expect(servicioSchema.parse({ ...BASE, en_linea: false }).en_linea).toBe(false);
    expect(servicioSchema.safeParse({ ...BASE, en_linea: "no" }).success).toBe(false);
  });
});
