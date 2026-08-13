import { describe, it, expect } from "vitest";
import { esSesionDispositivoInvalida } from "../supabase";

/**
 * Distinguir "el token del dispositivo ya no vale" de "falló la red" decide si la caja se
 * recupera sola o se queda atorada. Confundirlos en cualquiera de los dos sentidos es malo:
 *   - tratar un corte de red como sesión muerta manda a re-vincular sin necesidad (y sin
 *     credenciales a la mano, eso deja la caja peor que antes);
 *   - tratar una sesión muerta como error de red deja al cajero reintentando para siempre,
 *     que es exactamente lo que pasó al actualizar a 0.4.1.
 */
describe("esSesionDispositivoInvalida", () => {
  it("detecta el 401 de PostgREST cuando el JWT ya no verifica (caso 0.4.1)", () => {
    expect(esSesionDispositivoInvalida({ status: 401, message: "Unauthorized" })).toBe(true);
    expect(esSesionDispositivoInvalida({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(esSesionDispositivoInvalida(new Error("invalid claim: missing sub claim"))).toBe(true);
    expect(esSesionDispositivoInvalida(new Error("JWSError JWSInvalidSignature"))).toBe(true);
  });

  it("NO confunde una caída de red con una sesión muerta", () => {
    // La caja offline es normal (es local-first): re-vincular ahí sería un error grave.
    expect(esSesionDispositivoInvalida(new Error("Failed to fetch"))).toBe(false);
    expect(esSesionDispositivoInvalida(new Error("NetworkError when attempting to fetch"))).toBe(false);
    expect(esSesionDispositivoInvalida({ message: "connect ECONNREFUSED 127.0.0.1:54350" })).toBe(false);
  });

  it("NO confunde un error de datos con una sesión muerta", () => {
    expect(esSesionDispositivoInvalida({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(esSesionDispositivoInvalida({ code: "PGRST116", message: "no rows returned" })).toBe(false);
    expect(esSesionDispositivoInvalida(new Error("El turno ya fue cerrado"))).toBe(false);
  });

  it("tolera cualquier basura sin explotar", () => {
    for (const e of [null, undefined, "", 0, {}, [], new Error("")]) {
      expect(typeof esSesionDispositivoInvalida(e)).toBe("boolean");
    }
  });
});
