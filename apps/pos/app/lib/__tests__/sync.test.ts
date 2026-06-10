import { describe, it, expect } from "vitest";
import { clientIdsAceptados, totalesDe } from "../sync";

const resp = {
  totales: { total: 4, exitosas: 1, idempotentes: 1, conflictos: 1, errores: 1 },
  operaciones: [
    { client_id_local: "a", estado: "EXITO" },
    { client_id_local: "b", estado: "IDEMPOTENTE" },
    { client_id_local: "c", estado: "CONFLICTO" },
    { client_id_local: "d", estado: "ERROR" },
  ],
  sync_evento_id: "evt-1",
};

describe("Fase 3 — motor de sync (parser de la respuesta del push)", () => {
  it("acepta EXITO e IDEMPOTENTE para quitar del outbox; deja CONFLICTO y ERROR", () => {
    expect(clientIdsAceptados(resp)).toEqual(["a", "b"]);
  });

  it("totales agregados de la respuesta", () => {
    expect(totalesDe(resp)).toEqual({ exitosas: 1, idempotentes: 1, conflictos: 1, errores: 1 });
  });

  it("respuesta vacía o inválida no rompe", () => {
    expect(clientIdsAceptados(null)).toEqual([]);
    expect(clientIdsAceptados({})).toEqual([]);
    expect(totalesDe(undefined)).toEqual({ exitosas: 0, idempotentes: 0, conflictos: 0, errores: 0 });
  });
});
