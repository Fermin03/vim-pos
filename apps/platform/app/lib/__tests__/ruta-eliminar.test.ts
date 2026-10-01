import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { evaluarConfirmacion, nombreCoincide } from "../confirmacion";
import { agruparPorBucket, leerRechazo } from "../eliminar";

/*
 * Eliminar un cliente por completo (0144, ADR 0023). La base impone las reglas (solo CANCELADO,
 * nunca con CFDI timbrados); aquí se prueba lo que es de la ruta: que no llega a la base sin
 * autorización, sin la palabra o con otro nombre, y que un rechazo de la base sale con su motivo.
 */

type Llamada = { tipo: "rpc" | "storage" | "auditar"; nombre: string; args?: unknown };
let llamadas: Llamada[] = [];
let autorizado = true;
let tenant: { nombre_comercial: string } | null = { nombre_comercial: "Tacos Prueba Piloto" };
let rpc: Record<string, { data: unknown; error: { message: string } | null }> = {};
let storageFalla = false;

const RESUMEN = {
  sucursales: 1, cajas: 1, usuarios: 2, productos: 12, tickets: 0, clientes: 0, cfdi: 0, pagos_suscripcion: 0,
  cuentas: 2, cuentas_conservadas: 0, archivos: 0, tablas_con_datos: 9, filas: 41,
};
const ELIMINADO = {
  ok: true,
  tenant: { id: "t1", codigo: "tacos-prueba-piloto", nombre_comercial: "Tacos Prueba Piloto" },
  resumen: RESUMEN, tablas: {}, bitacora_conservada: 3, cuentas_conservadas: [], archivos: [],
};

const sb = {
  from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: tenant, error: null }) };
    return q;
  },
  rpc: (nombre: string, args: unknown) => {
    llamadas.push({ tipo: "rpc", nombre, args });
    return Promise.resolve(rpc[nombre] ?? { data: null, error: { message: "sin respuesta simulada" } });
  },
  storage: {
    from: (bucket: string) => ({
      remove: (nombres: string[]) => {
        llamadas.push({ tipo: "storage", nombre: bucket, args: nombres });
        return Promise.resolve({ error: storageFalla ? { message: "bucket caído" } : null });
      },
    }),
  },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve(autorizado ? { sb } : { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) }),
  auditar: (_sb: unknown, a: { accion: string }) => { llamadas.push({ tipo: "auditar", nombre: a.accion, args: a }); return Promise.resolve(); },
  actorDe: () => ({ id: "op-1", nombre: "Operadora", via: "cuenta" }),
  ipDeCliente: () => "10.0.0.7",
}));

const { GET, POST } = await import("../../api/tenants/[id]/eliminar/route");

const ctx = { params: Promise.resolve({ id: "t1" }) };
const URL_RUTA = "http://x/api/tenants/t1/eliminar";
const pedir = (body: unknown) => new Request(URL_RUTA, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const BUENO = { motivo: "Alta de prueba que nunca operó", nombre: "Tacos Prueba Piloto", confirmacion: "ELIMINAR" };
const rpcs = () => llamadas.filter((l) => l.tipo === "rpc");

beforeEach(() => {
  llamadas = [];
  autorizado = true;
  tenant = { nombre_comercial: "Tacos Prueba Piloto" };
  storageFalla = false;
  rpc = { eliminar_tenant: { data: ELIMINADO, error: null } };
});

describe("POST /api/tenants/[id]/eliminar — antes de tocar la base", () => {
  it("sin autorización responde lo que diga autorizar y no llama a nada", async () => {
    autorizado = false;
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("un cuerpo que no es JSON es un 400", async () => {
    const r = await POST(pedir("{no"), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("BAD_JSON");
  });

  it("exige motivo de 10 caracteres o más", async () => {
    const r = await POST(pedir({ ...BUENO, motivo: "  corto  " }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("MOTIVO_REQUERIDO");
    expect(rpcs()).toEqual([]);
  });

  it.each([["eliminar"], ["ELIMINAR "], ["Eliminar"], [""], ["BORRAR"]])("la palabra tiene que ser ELIMINAR exacta (%j no pasa)", async (palabra) => {
    const r = await POST(pedir({ ...BUENO, confirmacion: palabra }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("CONFIRMACION_INVALIDA");
    expect(rpcs()).toEqual([]);
  });

  it("sin la palabra en el cuerpo es un 400", async () => {
    const r = await POST(pedir({ motivo: BUENO.motivo, nombre: BUENO.nombre }), ctx);
    expect(r.status).toBe(400);
    expect(rpcs()).toEqual([]);
  });

  it("el nombre escrito tiene que ser el del cliente, leído de la base", async () => {
    const r = await POST(pedir({ ...BUENO, nombre: "Knock-Out Burger" }), ctx);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("NOMBRE_NO_COINCIDE");
    expect(rpcs()).toEqual([]);
  });

  it("el nombre se compara sin distinguir mayúsculas ni espacios sobrantes", async () => {
    const r = await POST(pedir({ ...BUENO, nombre: "  tacos   prueba piloto " }), ctx);
    expect(r.status).toBe(200);
  });

  it("un cliente que no existe (o ya eliminado) es un 404, sin llamar a la RPC", async () => {
    tenant = null;
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("TENANT_NO_EXISTE");
    expect(rpcs()).toEqual([]);
  });
});

describe("POST /api/tenants/[id]/eliminar — la base decide", () => {
  it("elimina en UNA llamada, a nombre del operador de la sesión y con su IP", async () => {
    const r = await POST(pedir({ ...BUENO, motivo: "  Alta de prueba que nunca operó  " }), ctx);
    expect(r.status).toBe(200);
    expect(rpcs()).toHaveLength(1);
    expect(rpcs()[0]).toMatchObject({
      nombre: "eliminar_tenant",
      args: { p_tenant_id: "t1", p_motivo: "Alta de prueba que nunca operó", p_operador: "op-1", p_confirmacion: "ELIMINAR", p_ip: "10.0.0.7" },
    });
    const cuerpo = await r.json();
    expect(cuerpo).toMatchObject({ ok: true, resumen: { filas: 41 }, archivos: { borrados: 0, fallos: [] } });
    // La bitácora la asienta la base en su transacción: la ruta no escribe otra.
    expect(llamadas.filter((l) => l.tipo === "auditar")).toEqual([]);
  });

  it.each([
    ["TENANT_NO_CANCELADO: Solo se elimina un cliente cancelado. Primero dalo de baja.", "TENANT_NO_CANCELADO", 409],
    ["TENANT_INTERNO: Es un negocio interno de VIM: no se elimina.", "TENANT_INTERNO", 409],
    ["TIENE_TIMBRADOS: Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja.", "TIENE_TIMBRADOS", 409],
    ["TIMBRADO_EN_PROCESO: Tiene un timbrado a medias con el SAT.", "TIMBRADO_EN_PROCESO", 409],
    ["TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó).", "TENANT_NO_EXISTE", 404],
    ["QUEDAN_FILAS: siguen quedando filas del cliente en tickets. No se borró nada.", "QUEDAN_FILAS", 409],
  ])("un rechazo de la base (%s) sale con su código y su motivo", async (mensaje, codigo, status) => {
    rpc.eliminar_tenant = { data: null, error: { message: mensaje } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(status);
    const cuerpo = await r.json();
    expect(cuerpo.error).toBe(codigo);
    expect(mensaje).toContain(cuerpo.detalle);
    expect(llamadas.some((l) => l.tipo === "storage")).toBe(false);
  });

  it("el motivo fiscal llega tal cual al operador", async () => {
    rpc.eliminar_tenant = { data: null, error: { message: "TIENE_TIMBRADOS: Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja." } };
    const cuerpo = await (await POST(pedir(BUENO), ctx)).json();
    expect(cuerpo.detalle).toBe("Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja.");
  });

  it("un error que la base no dice con código es un 500", async () => {
    rpc.eliminar_tenant = { data: null, error: { message: "deadlock detected" } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("ERROR_AL_ELIMINAR");
  });
});

describe("POST /api/tenants/[id]/eliminar — archivos", () => {
  const CON_ARCHIVOS = {
    ...ELIMINADO,
    archivos: [{ bucket: "cfdi", nombre: "a.xml" }, { bucket: "cfdi", nombre: "a.pdf" }, { bucket: "otros", nombre: "t1/logo.png" }],
  };

  it("los borra por la API de Storage, por bucket, DESPUÉS de la base, y lo asienta", async () => {
    rpc.eliminar_tenant = { data: CON_ARCHIVOS, error: null };
    const r = await POST(pedir(BUENO), ctx);
    expect((await r.json()).archivos).toEqual({ borrados: 3, fallos: [] });
    expect(llamadas.map((l) => `${l.tipo}:${l.nombre}`)).toEqual(["rpc:eliminar_tenant", "storage:cfdi", "storage:otros", "auditar:tenant.eliminar_archivos"]);
    expect(llamadas[1]!.args).toEqual(["a.xml", "a.pdf"]);
  });

  it("si Storage falla, el cliente ya está eliminado: responde 200 y dice qué quedó", async () => {
    rpc.eliminar_tenant = { data: CON_ARCHIVOS, error: null };
    storageFalla = true;
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.archivos.borrados).toBe(0);
    expect(cuerpo.archivos.fallos).toHaveLength(3);
    const asiento = llamadas.find((l) => l.tipo === "auditar")!.args as { payload: { fallos: string[]; tenant_eliminado: { codigo: string } } };
    expect(asiento.payload.fallos).toHaveLength(3);
    expect(asiento.payload.tenant_eliminado.codigo).toBe("tacos-prueba-piloto");
  });
});

describe("GET /api/tenants/[id]/eliminar — vista previa", () => {
  const PREVIA = {
    tenant: { id: "t1", codigo: "tacos-prueba-piloto", nombre_comercial: "Tacos Prueba Piloto", estado: "CANCELADO", fecha_baja: null },
    puede_eliminar: false,
    bloqueos: [{ codigo: "TIENE_TIMBRADOS", mensaje: "Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja." }],
    resumen: RESUMEN,
    tablas: { sucursales: 1 },
  };

  it("sin autorización no consulta nada", async () => {
    autorizado = false;
    const r = await GET(new Request(URL_RUTA), ctx);
    expect(r.status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("devuelve las cifras y el motivo del bloqueo, sin escribir", async () => {
    rpc.eliminar_tenant_vista_previa = { data: PREVIA, error: null };
    const r = await GET(new Request(URL_RUTA), ctx);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.puede_eliminar).toBe(false);
    expect(cuerpo.bloqueos[0].codigo).toBe("TIENE_TIMBRADOS");
    expect(cuerpo.resumen.filas).toBe(41);
    expect(llamadas.map((l) => l.nombre)).toEqual(["eliminar_tenant_vista_previa"]);
  });

  it("un cliente que no existe es un 404", async () => {
    rpc.eliminar_tenant_vista_previa = { data: null, error: { message: "TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó)." } };
    expect((await GET(new Request(URL_RUTA), ctx)).status).toBe(404);
  });
});

describe("piezas puras", () => {
  it("leerRechazo separa código y mensaje, y no confunde un texto cualquiera con un código", () => {
    expect(leerRechazo("TIENE_TIMBRADOS: Tiene facturas")).toEqual({ codigo: "TIENE_TIMBRADOS", detalle: "Tiene facturas", status: 409 });
    expect(leerRechazo("ERROR: permission denied").status).toBe(500);
    expect(leerRechazo("algo raro").codigo).toBe("ERROR_AL_ELIMINAR");
  });

  it("agruparPorBucket junta los nombres de cada bucket", () => {
    const m = agruparPorBucket([{ bucket: "a", nombre: "1" }, { bucket: "b", nombre: "2" }, { bucket: "a", nombre: "3" }]);
    expect([...m]).toEqual([["a", ["1", "3"]], ["b", ["2"]]]);
  });

  it("nombreCoincide no acepta un nombre vacío", () => {
    expect(nombreCoincide("", "")).toBe(false);
    expect(nombreCoincide("Tacos", " tacos ")).toBe(true);
  });

  it("el diálogo pide la palabra exacta además del nombre", () => {
    const base = { nombreEsperado: "Tacos", nombreEscrito: "Tacos", motivo: "Alta de prueba abandonada", palabraEsperada: "ELIMINAR" };
    expect(evaluarConfirmacion({ ...base, palabraEscrita: "ELIMINAR" }).ok).toBe(true);
    expect(evaluarConfirmacion({ ...base, palabraEscrita: "eliminar" }).faltantes).toEqual(["palabra"]);
    expect(evaluarConfirmacion({ ...base }).faltantes).toEqual(["palabra"]);
    // Sin palabra esperada, los demás diálogos siguen igual.
    expect(evaluarConfirmacion({ nombreEsperado: "Tacos", nombreEscrito: "Tacos", motivo: "Alta de prueba abandonada" }).ok).toBe(true);
  });
});
