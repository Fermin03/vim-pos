import { describe, it, expect } from "vitest";
import { accesoDe, recordarDirectivas, ultimasDirectivas } from "../acceso-recordado";
import type { Directivas } from "../directivas";

const foodTruck: Directivas = {
  servidor_hora: null,
  acceso: { estado: "ACTIVO", bloqueado: false, bloquea_desde: null, mensaje: null },
  modulos: { comedor: false, domicilio: false, eventos: true },
  limites: {},
  avisos: [],
  version: {},
};

describe("acceso recordado entre montajes", () => {
  it("al cargar la app no hay nada recordado: arranca como siempre", () => {
    expect(ultimasDirectivas()).toBeNull();
    expect(accesoDe(ultimasDirectivas())).toEqual({
      nivel: "ok", mensaje: "", desde: null, motivo: "suscripcion", modulos: {}, actualizacion: null,
    });
  });

  it("una lectura buena se recuerda y el siguiente montaje arranca con sus módulos", () => {
    recordarDirectivas(foodTruck);
    expect(accesoDe(ultimasDirectivas()).modulos).toEqual({ comedor: false, domicilio: false, eventos: true });
  });

  it("una lectura fallida (null) no borra lo último que se supo", () => {
    recordarDirectivas(null);
    expect(ultimasDirectivas()).toBe(foodTruck);
  });
});
