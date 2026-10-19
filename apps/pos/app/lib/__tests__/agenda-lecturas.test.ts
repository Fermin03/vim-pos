import { describe, expect, it, vi } from "vitest";

// Cada tabla responde lo que diga `tablas`, sin importar los filtros (esos los aplica la base).
const tablas = vi.hoisted(() => ({ datos: {} as Record<string, unknown[]> }));
vi.mock("../supabase", () => ({
  employeeClient: () => ({
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "lte", "gte", "order"]) q[m] = () => q;
      q.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => ok({ data: tablas.datos[t] ?? [], error: null });
      return q;
    },
  }),
}));

import { colaboradoresDelDia, horaSeFijaAlGuardar, serviciosAgenda, type ServicioAgenda } from "../agenda";

describe("colaboradoresDelDia", () => {
  it("deja fuera a quien ya no es empleado: acceso inactivo o perfil borrado", async () => {
    tablas.datos = {
      colaboradores_agenda: [
        { usuario_id: "ana", color_hex: "#111111", usuarios_perfil: { nombre: "Ana", deleted_at: null } },
        { usuario_id: "beto", color_hex: "#222222", usuarios_perfil: { nombre: "Beto", deleted_at: null } },
        { usuario_id: "caro", color_hex: "#333333", usuarios_perfil: { nombre: "Caro", deleted_at: "2026-10-01T00:00:00Z" } },
      ],
      usuarios_acceso: [{ usuario_id: "ana" }, { usuario_id: "caro" }],
    };
    expect((await colaboradoresDelDia("t", "s", "2026-11-06")).map((c) => c.usuarioId)).toEqual(["ana"]);
  });
});

describe("serviciosAgenda", () => {
  it("sin los de un producto borrado o pausado", async () => {
    const p = (nombre: string, extra: object = {}) => ({ nombre, precio_base_mxn: 100, deleted_at: null, estado: "ACTIVO", ...extra });
    tablas.datos = {
      servicios_agenda: [
        { producto_id: "a", duracion_min: 30, productos: p("Corte"), servicio_colaborador: [] },
        { producto_id: "b", duracion_min: 30, productos: p("Tinte", { deleted_at: "2026-10-01T00:00:00Z" }), servicio_colaborador: [] },
        { producto_id: "c", duracion_min: 30, productos: p("Uñas", { estado: "PAUSADO" }), servicio_colaborador: [] },
        { producto_id: "d", duracion_min: 30, productos: null, servicio_colaborador: [] },
      ],
    };
    expect((await serviciosAgenda("t")).map((s) => s.productoId)).toEqual(["a"]);
  });
});

describe("horaSeFijaAlGuardar", () => {
  const s: ServicioAgenda = {
    productoId: "corte", nombre: "Corte", precio: 250, duracionMin: 60,
    colaboradores: [{ usuarioId: "ana", precio: null, duracionMin: 90 }, { usuarioId: "beto", precio: null, duracionMin: null }],
  };
  const igual: ServicioAgenda = { ...s, productoId: "mani", colaboradores: [{ usuarioId: "ana", precio: 300, duracionMin: 60 }] };

  it("con «quien esté libre» y alguien con su propia duración, la hora se sabe al guardar", () => {
    expect(horaSeFijaAlGuardar([{ productoId: "corte", usuarioId: null }], [s])).toBe(true);
  });
  it("con colaborador elegido, o si nadie dura distinto, la vista previa es la hora final", () => {
    expect(horaSeFijaAlGuardar([{ productoId: "corte", usuarioId: "ana" }], [s])).toBe(false);
    expect(horaSeFijaAlGuardar([{ productoId: "mani", usuarioId: null }], [igual])).toBe(false);
  });
});
