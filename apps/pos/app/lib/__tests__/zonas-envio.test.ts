import { describe, expect, it } from "vitest";
import { zonaVigente, type ZonaEnvio } from "../zonas-envio";

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
