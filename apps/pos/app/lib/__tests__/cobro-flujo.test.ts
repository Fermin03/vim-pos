import { describe, expect, it } from "vitest";
import { debePreguntarPropina, montosSugeridosEfectivo, propinaPreguntadaAlVolver, totalCobrado, vistaAlRegresar } from "../cobro-flujo";

describe("montosSugeridosEfectivo", () => {
  it("616 → 620, 650, 700, 1000", () => expect(montosSugeridosEfectivo(616)).toEqual([620, 650, 700, 1000]));
  it("siempre mayores al total: 620 → 630, 650, 700, 1000", () =>
    expect(montosSugeridosEfectivo(620)).toEqual([630, 650, 700, 1000]));
  it("con centavos: 616.5 → 620, 650, 700, 1000", () =>
    expect(montosSugeridosEfectivo(616.5)).toEqual([620, 650, 700, 1000]));
  it("sin repetidos y máximo cuatro: 560 → 570, 600, 1000", () =>
    expect(montosSugeridosEfectivo(560)).toEqual([570, 600, 1000]));
  it("1000 → 1010, 1050, 1100, 1500", () => expect(montosSugeridosEfectivo(1000)).toEqual([1010, 1050, 1100, 1500]));
});

describe("debePreguntarPropina", () => {
  const base = { capturar: true, propinaFijada: false, destino: "EFECTIVO" as const, propinaEnLector: false };
  it("efectivo con propina activa → sí", () => expect(debePreguntarPropina(base)).toBe(true));
  it("sucursal sin propina → no", () => expect(debePreguntarPropina({ ...base, capturar: false })).toBe(false));
  it("ya fijada al abrir o ya contestada → no", () => expect(debePreguntarPropina({ ...base, propinaFijada: true })).toBe(false));
  it("terminal con lector que pregunta → no", () =>
    expect(debePreguntarPropina({ ...base, destino: "terminal", propinaEnLector: true })).toBe(false));
  it("terminal con lector que NO pregunta → sí", () =>
    expect(debePreguntarPropina({ ...base, destino: "terminal" })).toBe(true));
  it("lector que pregunta pero se cobra en efectivo → sí", () =>
    expect(debePreguntarPropina({ ...base, propinaEnLector: true })).toBe(true));
  it("dividido y atajo también la preguntan", () => {
    expect(debePreguntarPropina({ ...base, destino: "dividido" })).toBe(true);
    expect(debePreguntarPropina({ ...base, destino: "atajo" })).toBe(true);
  });
});

describe("vistaAlRegresar", () => {
  const libre = { ocupado: false, preguntoPropinaAqui: true };
  it("ocupado no hace nada", () => expect(vistaAlRegresar("efectivo", { ...libre, ocupado: true })).toBeNull());
  it("terminal y atajo no hacen nada", () => {
    expect(vistaAlRegresar("terminal", libre)).toBeNull();
    expect(vistaAlRegresar("atajo", libre)).toBeNull();
  });
  it("método con propina preguntada → propina", () => {
    for (const v of ["efectivo", "otro", "dividido", "credito", "saldo"] as const) expect(vistaAlRegresar(v, libre)).toBe("propina");
  });
  it("método sin propina preguntada → selector", () =>
    expect(vistaAlRegresar("efectivo", { ...libre, preguntoPropinaAqui: false })).toBe("selector"));
  it("propina y más → selector", () => {
    expect(vistaAlRegresar("propina", libre)).toBe("selector");
    expect(vistaAlRegresar("mas", libre)).toBe("selector");
  });
  it("selector → cerrar", () => expect(vistaAlRegresar("selector", libre)).toBe("cerrar"));
});

describe("totalCobrado", () => {
  it("suma la propina, que el total de la base no trae", () =>
    expect(totalCobrado({ total: 250, propina: 25 })).toBe(275));
  it("sin propina es el total", () => expect(totalCobrado({ total: 55 })).toBe(55));
  it("redondea a centavos", () => expect(totalCobrado({ total: 0.1, propina: 0.2 })).toBe(0.3));
});

describe("propinaPreguntadaAlVolver", () => {
  it("con un pago ya registrado la propina es firme aunque sea $0: no se vuelve a preguntar", () =>
    expect(propinaPreguntadaAlVolver({ firme: true, inicial: 0 })).toBe(true));
  it("propina que venía en el ticket: no se pregunta", () =>
    expect(propinaPreguntadaAlVolver({ firme: false, inicial: 20 })).toBe(true));
  it("sin pago ni propina previa: se vuelve a preguntar con el método nuevo", () =>
    expect(propinaPreguntadaAlVolver({ firme: false, inicial: 0 })).toBe(false));
});
