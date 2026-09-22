import { describe, it, expect } from "vitest";
import { zonaSchema } from "../zonas-envio";

describe("zonaSchema", () => {
  it("acepta una zona válida", () => {
    const r = zonaSchema.safeParse({ nombre: "Centro", costoMxn: 25, orden: 0 });
    expect(r.success).toBe(true);
  });

  it("rechaza el nombre vacío", () => {
    const r = zonaSchema.safeParse({ nombre: "", costoMxn: 25, orden: 0 });
    expect(r.success).toBe(false);
  });

  it("rechaza el costo negativo", () => {
    const r = zonaSchema.safeParse({ nombre: "Centro", costoMxn: -1, orden: 0 });
    expect(r.success).toBe(false);
  });
});
