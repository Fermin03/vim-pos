import { describe, expect, it } from "vitest";
import { etiquetaModo } from "@vim/db/modos-servicio";
import { preguntaServicio } from "../tienda";
import { estadoInicial, reducerCarrito } from "../carrito";

const APAGADO = { pedirNombre: false, tieneDondeComer: false };
const CON_NOMBRE = { pedirNombre: true, tieneDondeComer: false };

describe("preguntaServicio — «¿Es para llevar o para comer aquí?» al cobrar", () => {
  it("servicio rápido pregunta siempre, con o sin nombre", () => {
    expect(preguntaServicio("QUICK_SERVICE", APAGADO, "PARA_LLEVAR")).toBe("PREGUNTA");
    expect(preguntaServicio("QUICK_SERVICE", CON_NOMBRE, "PARA_LLEVAR")).toBe("PREGUNTA");
  });

  it("food truck pregunta solo si tiene dónde comer; si no, solo el nombre (si se pide)", () => {
    expect(preguntaServicio("FOODTRUCK", { pedirNombre: false, tieneDondeComer: true }, "PARA_LLEVAR")).toBe("PREGUNTA");
    expect(preguntaServicio("FOODTRUCK", APAGADO, "PARA_LLEVAR")).toBeNull();
    expect(preguntaServicio("FOODTRUCK", CON_NOMBRE, "PARA_LLEVAR")).toBe("NOMBRE");
  });

  it("pick-up, domicilio y apps ya traen su modo: no se pregunta", () => {
    for (const modo of ["DRIVE_THRU", "DELIVERY_PROPIO"] as const) {
      expect(preguntaServicio("QUICK_SERVICE", CON_NOMBRE, modo)).toBeNull();
    }
  });

  it("café, servicio completo, bar y la tienda no ven la ventana", () => {
    for (const giro of ["CAFETERIA", "FULL_SERVICE", "BAR", "TAQUERIA", "RETAIL", null]) {
      expect(preguntaServicio(giro, { pedirNombre: true, tieneDondeComer: true }, "PARA_LLEVAR")).toBeNull();
    }
  });
});

describe("etiquetaModo por giro", () => {
  it("comida rápida dice «Comer aquí»", () => {
    expect(etiquetaModo("COMER_AQUI", "QUICK_SERVICE")).toBe("Comer aquí");
    expect(etiquetaModo("COMER_AQUI", "FOODTRUCK")).toBe("Comer aquí");
  });
  it("los demás siguen con «Comedor», y los otros modos no cambian", () => {
    expect(etiquetaModo("COMER_AQUI", "CAFETERIA")).toBe("Comedor");
    expect(etiquetaModo("COMER_AQUI")).toBe("Comedor");
    expect(etiquetaModo("PARA_LLEVAR", "QUICK_SERVICE")).toBe("Para llevar");
  });
});

describe("carrito — modo con nombre", () => {
  it("el nombre que viaja con el modo sobrevive al cambio", () => {
    const e = reducerCarrito({ ...estadoInicial, modoServicio: "PARA_LLEVAR" }, { tipo: "modo", modo: "COMER_AQUI", nombre: "Ana" });
    expect(e.modoServicio).toBe("COMER_AQUI");
    expect(e.nombreCuenta).toBe("Ana");
  });
  it("sin nombre, el cambio de modo lo sigue borrando como antes", () => {
    const e = reducerCarrito({ ...estadoInicial, nombreCuenta: "Ana" }, { tipo: "modo", modo: "PARA_LLEVAR" });
    expect(e.nombreCuenta).toBeNull();
  });
});
