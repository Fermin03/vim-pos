import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Migración 0132: la base rechaza a quien no puede tocar un rol o los permisos de un usuario. El
 * INSERT rechazado trae error 42501, pero el DELETE rechazado no trae error: el RLS no ve la fila y
 * borra cero. Estas pruebas fijan que la pantalla lo diga en vez de "guardar" en silencio.
 */
const doble = vi.hoisted(() => ({
  insertError: null as { code?: string; message: string } | null,
  deleteFilas: [] as { id: string }[],
  deleteError: null as { code?: string; message: string } | null,
  actuales: [] as { permiso_id: string }[],
}));

vi.mock("../supabase", () => {
  // Cadena mínima de PostgREST: cada filtro devuelve la misma cadena; `select` tras `delete`
  // resuelve con las filas borradas; `select` como lectura resuelve al terminar los `eq`.
  const cadenaDelete = () => {
    const c = {
      eq: () => c,
      in: () => c,
      select: async () => ({ data: doble.deleteError ? null : doble.deleteFilas, error: doble.deleteError }),
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ error: doble.insertError })),
        delete: vi.fn(() => cadenaDelete()),
        select: vi.fn(() => ({ eq: async () => ({ data: doble.actuales, error: null }) })),
      })),
    },
    leerSesion: vi.fn(async () => ({ email: "a@a.com", userId: "u1", tenantId: "t1", tipoIdentidad: "ADMIN_WEB" })),
  };
});

import {
  asignarPermisosUsuario,
  MSG_SIN_PERMISO_ROL,
  MSG_SIN_PERMISO_USUARIO,
  quitarPermiso,
  restaurarPermiso,
} from "../roles-permisos";

beforeEach(() => {
  doble.insertError = null;
  doble.deleteFilas = [];
  doble.deleteError = null;
  doble.actuales = [];
});

describe("quitarPermiso", () => {
  it("un rechazo por RLS se explica en español", async () => {
    doble.insertError = { code: "42501", message: 'new row violates row-level security policy for table "rol_permiso_overrides"' };
    await expect(quitarPermiso("rol", "perm")).rejects.toThrow(MSG_SIN_PERMISO_ROL);
  });

  it("un duplicado no es error (ya estaba quitado)", async () => {
    doble.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    await expect(quitarPermiso("rol", "perm")).resolves.toBeUndefined();
  });
});

describe("restaurarPermiso", () => {
  it("cero filas borradas = el RLS lo impidió; no se finge éxito", async () => {
    doble.deleteFilas = [];
    await expect(restaurarPermiso("rol", "perm")).rejects.toThrow(MSG_SIN_PERMISO_ROL);
  });

  it("con la fila borrada, termina bien", async () => {
    doble.deleteFilas = [{ id: "x" }];
    await expect(restaurarPermiso("rol", "perm")).resolves.toBeUndefined();
  });
});

describe("asignarPermisosUsuario", () => {
  it("si no se pudieron quitar todos, avisa", async () => {
    doble.actuales = [{ permiso_id: "p1" }, { permiso_id: "p2" }];
    doble.deleteFilas = [];
    await expect(asignarPermisosUsuario("u2", [])).rejects.toThrow(MSG_SIN_PERMISO_USUARIO);
  });

  it("un INSERT rechazado por RLS se explica", async () => {
    doble.insertError = { code: "42501", message: "new row violates row-level security policy" };
    await expect(asignarPermisosUsuario("u2", ["p1"])).rejects.toThrow(MSG_SIN_PERMISO_USUARIO);
  });
});
