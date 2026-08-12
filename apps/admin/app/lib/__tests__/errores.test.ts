import { describe, it, expect } from "vitest";
import { mensajeError } from "../errores";

describe("mensajeError", () => {
  it("traduce el error de red de supabase-js, que es el más común y el más críptico", () => {
    expect(mensajeError(new Error("Failed to fetch"))).toMatch(/No hay conexión con el servidor/);
    expect(mensajeError(new Error("NetworkError when attempting to fetch resource."))).toMatch(/No hay conexión/);
  });

  it("traduce sesión expirada, permisos y llaves duplicadas", () => {
    expect(mensajeError(new Error("JWT expired"))).toMatch(/Tu sesión expiró/);
    expect(mensajeError(new Error('new row violates row-level security policy for table "productos"')))
      .toMatch(/No tienes permiso/);
    expect(mensajeError(new Error('duplicate key value violates unique constraint "productos_sku_key"')))
      .toMatch(/Ya existe un registro/);
    expect(mensajeError(new Error("update or delete on table violates foreign key constraint")))
      .toMatch(/hay otros registros que dependen/);
  });

  it("conserva los mensajes de negocio en español que vienen de las funciones SQL", () => {
    // Un RAISE EXCEPTION del backend ya explica exactamente el porqué: no hay que taparlo.
    const msg = "El turno ya fue cerrado; no se puede aplicar el pago.";
    expect(mensajeError(new Error(msg))).toBe(msg);
  });

  it("usa el texto por defecto cuando no hay nada útil que mostrar", () => {
    expect(mensajeError(null, "No se pudo guardar")).toBe("No se pudo guardar");
    expect(mensajeError(new Error(""), "No se pudo cargar")).toBe("No se pudo cargar");
    expect(mensajeError(undefined)).toMatch(/Algo salió mal/);
  });

  it("nunca devuelve cadena vacía (dejaría al usuario sin ninguna pista)", () => {
    for (const entrada of [null, undefined, "", new Error(""), {}, 0]) {
      expect(mensajeError(entrada).length).toBeGreaterThan(0);
    }
  });
});
