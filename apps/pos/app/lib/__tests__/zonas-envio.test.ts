import { describe, expect, it } from "vitest";
import { COSTO_ZONA_MAX, traducirErrorZona, validarCostoZona, zonaVigente, type ZonaEnvio } from "../zonas-envio";

// I1: la zona embebida en la dirección del cliente puede estar desactivada o borrada (el embed no
// filtra `activa`/`deleted_at`). Usarla tal cual hacía tronar `fijar_envio_ticket` al persistir.
describe("zonaVigente", () => {
  const vigentes: ZonaEnvio[] = [
    { id: "z1", nombre: "Centro", costoMxn: 0 },
    { id: "z2", nombre: "Norte", costoMxn: 40 },
  ];

  it("una zona que ya no está en la lista vigente cuenta como sin zona", () => {
    expect(zonaVigente({ id: "z9", nombre: "Vieja", costoMxn: 25 }, vigentes)).toBeNull();
  });

  it("el precio sale de la lista vigente, no del embed de la dirección", () => {
    expect(zonaVigente({ id: "z2", nombre: "Norte", costoMxn: 35 }, vigentes)).toEqual({ id: "z2", nombre: "Norte", costoMxn: 40 });
  });

  it("sin zona en la dirección, sin zona", () => {
    expect(zonaVigente(null, vigentes)).toBeNull();
  });
});

// M3: la caja usa el mismo tope que el panel y dice en español qué pasó con un nombre repetido.
describe("validarCostoZona", () => {
  it("acepta de 0 al tope del panel", () => {
    expect(validarCostoZona(0)).toBeNull();
    expect(validarCostoZona(COSTO_ZONA_MAX)).toBeNull();
    expect(COSTO_ZONA_MAX).toBe(9999);
  });
  it("rechaza negativos, de más y lo que no es número", () => {
    expect(validarCostoZona(-1)).toMatch(/negativo/);
    expect(validarCostoZona(10000)).toMatch(/9,999/);
    expect(validarCostoZona(Number.NaN)).not.toBeNull();
  });
});

describe("traducirErrorZona", () => {
  it("el choque del índice único se dice como lo diría una persona", () => {
    expect(traducirErrorZona('duplicate key value violates unique constraint "zona_envio_nombre_uq"'))
      .toBe("Ya existe una zona con ese nombre en esta sucursal.");
  });
  it("lo demás pasa tal cual", () => {
    expect(traducirErrorZona("sin red")).toBe("sin red");
  });
});
