import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Ruta de "Liberar un correo" (0154). Lo que importa: que la clave compartida no pase, que la
 * cuenta se vuelva a buscar en el servidor antes de eliminarla (no se confía en el id que manda el
 * navegador), que el motivo llegue a la base y que sus rechazos salgan con su texto y no como 500.
 */

type Rpc = { fn: string; args: Record<string, unknown> };
let rpcs: Rpc[] = [];
let via: "cuenta" | "clave" = "cuenta";
let previa: unknown;
let errorEliminar: { message: string; code?: string } | null = null;

const U = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const CUENTA = {
  encontrado: true, usuario_id: U, nombre: "María López", tenant_id: T,
  accesos: [{ tenant_id: T, negocio: "Tacos El Güero", estado_negocio: "ACTIVO", rol: "CAJERO", activo: false }],
  bloqueos: [], puede_eliminar: true,
};

const sb = {
  rpc: (fn: string, args: Record<string, unknown>) => {
    rpcs.push({ fn, args });
    if (fn === "usuario_por_correo") return Promise.resolve({ data: previa, error: null });
    return Promise.resolve(errorEliminar ? { data: null, error: errorEliminar } : { data: { ok: true, nombre: "María López (cuenta eliminada)" }, error: null });
  },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb, actor: { id: "op1", nombre: "Operador", via } }),
  ipDeCliente: () => "203.0.113.7",
}));

const { POST } = await import("../../api/correos/route");
const pedir = (body: unknown) => POST(new Request("http://x/api/correos", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => { rpcs = []; via = "cuenta"; previa = { ...CUENTA }; errorEliminar = null; });

describe("POST /api/correos", () => {
  it("buscar devuelve de quién es el correo, sin escribir nada", async () => {
    const res = await pedir({ accion: "buscar", email: " maria@correo.com " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ encontrado: true, nombre: "María López", puede_eliminar: true });
    expect(rpcs).toEqual([{ fn: "usuario_por_correo", args: { p_email: "maria@correo.com", p_actor: "op1" } }]);
  });

  it("un correo libre contesta que no hay cuenta", async () => {
    previa = { encontrado: false };
    const res = await pedir({ accion: "buscar", email: "nadie@correo.com" });
    expect(await res.json()).toEqual({ encontrado: false });
  });

  it("la clave compartida no busca ni libera", async () => {
    via = "clave";
    const res = await pedir({ accion: "buscar", email: "maria@correo.com" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("REQUIERE_CUENTA");
    expect(rpcs).toHaveLength(0);
  });

  it("rechaza un correo mal formado y un motivo corto antes de tocar la base", async () => {
    expect((await pedir({ accion: "buscar", email: "no-es-correo" })).status).toBe(400);
    const res = await pedir({ accion: "liberar", email: "maria@correo.com", usuario_id: U, motivo: "corto" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MOTIVO_REQUERIDO");
    expect(rpcs).toHaveLength(0);
  });

  it("liberar elimina la cuenta que el servidor encontró, con motivo, operador e IP", async () => {
    const res = await pedir({ accion: "liberar", email: "maria@correo.com", usuario_id: U, motivo: "Pidió liberar su correo por WhatsApp" });
    expect(res.status).toBe(200);
    expect(rpcs[1]).toEqual({
      fn: "eliminar_usuario",
      args: { p_usuario_id: U, p_tenant_id: T, p_actor: "op1", p_origen: "PLATAFORMA", p_motivo: "Pidió liberar su correo por WhatsApp", p_ip: "203.0.113.7" },
    });
  });

  it("si el correo ya es de otra cuenta, no elimina a nadie", async () => {
    const res = await pedir({ accion: "liberar", email: "maria@correo.com", usuario_id: "33333333-3333-4333-8333-333333333333", motivo: "Pidió liberar su correo" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("CUENTA_CAMBIO");
    expect(rpcs.map((r) => r.fn)).toEqual(["usuario_por_correo"]);
  });

  it("un rechazo de la base sale con su texto; uno desconocido, con texto fijo", async () => {
    errorEliminar = { message: "SIGUE_ACTIVO: El usuario sigue activo. Primero hay que desactivarlo." };
    let res = await pedir({ accion: "liberar", email: "maria@correo.com", usuario_id: U, motivo: "Pidió liberar su correo" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "SIGUE_ACTIVO", detalle: "El usuario sigue activo. Primero hay que desactivarlo." });

    errorEliminar = { message: 'relation "auth.identities" does not exist', code: "42P01" };
    res = await pedir({ accion: "liberar", email: "maria@correo.com", usuario_id: U, motivo: "Pidió liberar su correo" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("auth.identities");
  });
});
