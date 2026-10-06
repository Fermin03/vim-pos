import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble mínimo de PostgREST sobre filas en memoria (el mismo criterio que clientes-cuenta.test.ts):
// aplica los filtros de verdad e inserta, para probar QUÉ queda escrito.
type Fila = Record<string, unknown>;
const { tablas } = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]> }));

function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  let nueva: Fila | null = null;
  const resolver = () => {
    if (nueva) {
      const fila = { id: `id-${(tablas[tabla] ?? []).length + 1}`, deleted_at: null, ...nueva };
      (tablas[tabla] ??= []).push(fila);
      return { data: [fila], error: null };
    }
    return { data: (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f))), error: null };
  };
  const q = {
    insert: (v: Fila) => { nueva = v; return q; },
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    limit: () => q,
    single: async () => ({ data: resolver().data[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: resolver().data[0] ?? null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({ employeeClient: () => ({ from: consulta }) }));

import { filtroBusquedaDomicilio, registrarClienteDomicilio } from "../clientes-domicilio";
import { normalizarTelefono } from "../telefono";

const DIR = { etiqueta: "Casa", calle: "Hidalgo", numeroExterior: "12", colonia: "Centro", referencias: "", zona: null };

describe("teléfono de un cliente de domicilio", () => {
  beforeEach(() => {
    tablas.clientes = [{ id: "c-existente", tenant_id: "t", nombre: "Luis", apellido_paterno: "Pérez", telefono: "4779998888", deleted_at: null }];
    tablas.direcciones_cliente = [];
  });

  it("normalizarTelefono deja solo dígitos", () => {
    expect(normalizarTelefono("(477) 123-4567")).toBe("4771234567");
  });

  it("se guarda solo con dígitos, igual que el de una cuenta", async () => {
    // Lo que pase después con la dirección no importa aquí: el cliente ya quedó escrito.
    await registrarClienteDomicilio("tk", { nombre: "Ana", telefono: "477 123-4567", tenantId: "t", sucursalId: "s", dir: DIR as never }).catch(() => {});
    const ana = tablas.clientes.find((f) => f.nombre === "Ana");
    expect(ana?.telefono).toBe("4771234567");
  });

  it("un teléfono que ya existe no crea otro cliente: dice de quién es", async () => {
    const intento = registrarClienteDomicilio("tk", { nombre: "Otro", telefono: "477 999 8888", tenantId: "t", sucursalId: "s", dir: DIR as never });
    await expect(intento).rejects.toThrow(/ya es de Luis Pérez/);
    expect(tablas.clientes).toHaveLength(1);
  });

  it("sin teléfono se registra igual, con teléfono nulo", async () => {
    await registrarClienteDomicilio("tk", { nombre: "Sin Tel", telefono: "  ", tenantId: "t", sucursalId: "s", dir: DIR as never }).catch(() => {});
    expect(tablas.clientes.find((f) => f.nombre === "Sin Tel")?.telefono).toBeNull();
  });
});

describe("búsqueda de clientes de domicilio", () => {
  it("busca el texto tal cual y, si trae dígitos con formato, también solo los dígitos", () => {
    expect(filtroBusquedaDomicilio("477 555")).toBe("telefono.ilike.%477 555%,nombre.ilike.%477 555%,telefono.ilike.%477555%");
  });

  it("un texto sin formato no repite el filtro", () => {
    expect(filtroBusquedaDomicilio("477555")).toBe("telefono.ilike.%477555%,nombre.ilike.%477555%");
    expect(filtroBusquedaDomicilio("ana")).toBe("telefono.ilike.%ana%,nombre.ilike.%ana%");
  });

  it("los caracteres que rompen el .or() no llegan a PostgREST", () => {
    expect(filtroBusquedaDomicilio("a,b(c)")).toBe("telefono.ilike.%a b c %,nombre.ilike.%a b c %");
  });
});
