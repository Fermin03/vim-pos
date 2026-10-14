import { describe, expect, it } from "vitest";
import { accesosInicio } from "../accesos-inicio";

const SIN = { comedor: 0, pickup: 0, domicilio: 0, barra: 0 };

describe("accesosInicio", () => {
  it("cargando o caja vieja ({}): los cuatro, como siempre", () => {
    expect(accesosInicio({}, SIN)).toEqual({ comedor: true, paraLlevar: true, pickup: true, domicilio: true, barra: false });
  });
  it("food truck: sin comedor ni domicilio", () => {
    const m = { mostrador: true, comedor: false, domicilio: false };
    expect(accesosInicio(m, SIN)).toEqual({ comedor: false, paraLlevar: true, pickup: true, domicilio: false, barra: false });
  });
  it("mostrador apagado esconde Para llevar y Pick-up", () => {
    const r = accesosInicio({ mostrador: false }, SIN);
    expect([r.paraLlevar, r.pickup]).toEqual([false, false]);
  });
  it("con cuentas abiertas el acceso se queda aunque el módulo se haya apagado (spec §6.4)", () => {
    const m = { comedor: false, mostrador: false, domicilio: false };
    expect(accesosInicio(m, { comedor: 2, pickup: 1, domicilio: 3, barra: 0 })).toEqual(
      { comedor: true, paraLlevar: false, pickup: true, domicilio: true, barra: false });
  });
  it("barra se enciende con el módulo", () => {
    expect(accesosInicio({ cuentas_barra: true }, SIN).barra).toBe(true);
  });
  it("barra se queda con cuentas abiertas aunque el módulo esté apagado", () => {
    expect(accesosInicio({ cuentas_barra: false }, { ...SIN, barra: 2 }).barra).toBe(true);
  });
});
