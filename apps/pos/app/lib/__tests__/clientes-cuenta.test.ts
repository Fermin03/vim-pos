import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble mínimo de PostgREST sobre filas en memoria: aplica los filtros de verdad, inserta y
// actualiza, para probar QUÉ queda escrito y no solo qué métodos se llamaron.
type Fila = Record<string, unknown>;
const { tablas } = vi.hoisted(() => ({ tablas: {} as Record<string, Fila[]> }));

function consulta(tabla: string) {
  let filtros: ((f: Fila) => boolean)[] = [];
  let cambios: Fila | null = null;
  let nueva: Fila | null = null;
  const vivas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
  const resolver = () => {
    if (nueva) {
      const fila = { id: `id-${(tablas[tabla] ?? []).length + 1}`, deleted_at: null, ...nueva };
      (tablas[tabla] ??= []).push(fila);
      return { data: [fila], error: null };
    }
    const filas = vivas();
    if (cambios) for (const f of filas) Object.assign(f, cambios);
    return { data: filas, error: null };
  };
  const q = {
    insert: (v: Fila) => { nueva = v; return q; },
    update: (v: Fila) => { cambios = v; return q; },
    select: () => q,
    eq: (col: string, v: unknown) => { filtros = [...filtros, (f) => f[col] === v]; return q; },
    in: (col: string, vs: unknown[]) => { filtros = [...filtros, (f) => vs.includes(f[col])]; return q; },
    is: (col: string, v: unknown) => { filtros = [...filtros, (f) => (f[col] ?? null) === v]; return q; },
    limit: () => q,
    single: async () => { const r = resolver(); return { data: r.data[0] ?? null, error: null }; },
    maybeSingle: async () => { const r = resolver(); return { data: r.data[0] ?? null, error: null }; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
  };
  return q;
}

vi.mock("../supabase", () => ({ employeeClient: () => ({ from: consulta }) }));

import {
  TelefonoDuplicado, asignarClienteTicket, filtroBusquedaCliente, normalizarTelefono, registrarClienteCuenta, validarRegistro,
} from "../clientes-cuenta";

const BASE = { nombre: "Ana", apellido: "", telefono: "477 123 4567", email: "", notas: "" };

describe("validar el registro de un cliente", () => {
  it("nombre y teléfono son obligatorios", () => {
    expect(validarRegistro({ ...BASE, nombre: "  " })).toMatch(/nombre/i);
    expect(validarRegistro({ ...BASE, telefono: "" })).toMatch(/teléfono/i);
    expect(validarRegistro(BASE)).toBeNull();
  });

  it("el teléfono necesita 10 dígitos, sin importar espacios o guiones", () => {
    expect(validarRegistro({ ...BASE, telefono: "477 12" })).toMatch(/10 dígitos/);
    expect(validarRegistro({ ...BASE, telefono: "477-123-4567" })).toBeNull();
  });

  it("el correo es opcional, pero si se escribe debe ser válido", () => {
    expect(validarRegistro({ ...BASE, email: "ana@" })).toMatch(/correo/i);
    expect(validarRegistro({ ...BASE, email: "ana@correo.com" })).toBeNull();
  });

  it("el teléfono se guarda solo con dígitos, para que el mismo número no quede dos veces", () => {
    expect(normalizarTelefono("477 123-4567")).toBe("4771234567");
    expect(normalizarTelefono("(477) 123 4567")).toBe("4771234567");
  });
});

describe("registrar un cliente desde la cuenta", () => {
  beforeEach(() => {
    tablas.clientes = [{ id: "c-existente", tenant_id: "t", nombre: "Luis", apellido_paterno: "Pérez", telefono: "4779998888", deleted_at: null }];
  });

  it("guarda nombre, apellido, correo y notas con el teléfono normalizado", async () => {
    const c = await registrarClienteCuenta("tk", {
      ...BASE, apellido: "Gómez", email: "ana@correo.com", notas: "Sin cebolla",
      tenantId: "t", sucursalId: "s", dir: null,
    });
    const fila = tablas.clientes.find((f) => f.id === c.clienteId)!;
    expect(fila).toMatchObject({ nombre: "Ana", apellido_paterno: "Gómez", telefono: "4771234567", email: "ana@correo.com", notas_internas: "Sin cebolla" });
    expect(c).toEqual({ clienteId: c.clienteId, nombre: "Ana Gómez", telefono: "4771234567" });
  });

  it("un teléfono que ya existe no crea un duplicado: devuelve al cliente que ya lo tiene", async () => {
    const intento = registrarClienteCuenta("tk", { ...BASE, telefono: "477 999 8888", tenantId: "t", sucursalId: "s", dir: null });
    await expect(intento).rejects.toBeInstanceOf(TelefonoDuplicado);
    await intento.catch((e: TelefonoDuplicado) => {
      expect(e.cliente).toEqual({ clienteId: "c-existente", nombre: "Luis Pérez", telefono: "4779998888" });
    });
    expect(tablas.clientes).toHaveLength(1);
  });
});

describe("asignar el cliente a una cuenta abierta", () => {
  beforeEach(() => {
    tablas.tickets = [
      { id: "abierta", estado_fiscal: "ABIERTO", cliente_id: null },
      { id: "pagada", estado_fiscal: "PAGADO", cliente_id: null },
    ];
  });

  it("pone y quita el cliente de una cuenta abierta", async () => {
    await asignarClienteTicket("tk", "abierta", "c1");
    expect(tablas.tickets[0].cliente_id).toBe("c1");
    await asignarClienteTicket("tk", "abierta", null);
    expect(tablas.tickets[0].cliente_id).toBeNull();
  });

  it("no toca una cuenta ya cobrada, y lo dice", async () => {
    await expect(asignarClienteTicket("tk", "pagada", "c1")).rejects.toThrow(/ya se cobró/);
    expect(tablas.tickets[1].cliente_id).toBeNull();
  });
});

describe("filtro de búsqueda de clientes", () => {
  it("nombre y apellido juntos, en cualquier orden y sin acentos: cada palabra debe aparecer en el nombre completo", () => {
    expect(filtroBusquedaCliente("Ana Pru")).toBe("and(nombre_completo_busqueda.ilike.%ana%,nombre_completo_busqueda.ilike.%pru%)");
    expect(filtroBusquedaCliente("José")).toBe("nombre_completo_busqueda.ilike.%jose%");
  });

  it("con dígitos también busca por teléfono, sin espacios ni guiones", () => {
    expect(filtroBusquedaCliente("477 555")).toBe(
      "and(nombre_completo_busqueda.ilike.%477%,nombre_completo_busqueda.ilike.%555%),telefono.ilike.%477555%",
    );
  });

  it("los caracteres que rompen el filtro .or() no llegan a PostgREST", () => {
    expect(filtroBusquedaCliente("a,b(c)")).toBe("and(nombre_completo_busqueda.ilike.%a%,nombre_completo_busqueda.ilike.%b%,nombre_completo_busqueda.ilike.%c%)");
  });
});
