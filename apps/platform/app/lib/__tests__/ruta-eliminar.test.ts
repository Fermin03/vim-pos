import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { evaluarConfirmacion, nombreCoincide } from "../confirmacion";
import { agruparPorBucket, AVISO_CORTE, leerRechazo, respuestaCortada } from "../eliminar";

/*
 * Eliminar un cliente por completo (0144, ADR 0023). La base impone las reglas (solo CANCELADO,
 * nunca con CFDI timbrados, espera tras la baja); aquí se prueba lo que es de la ruta: que no
 * llega a la base sin autorización, sin cuenta de operador, sin la palabra o con otro nombre; que
 * un rechazo sale con su motivo en español y sin texto crudo de Postgres; y que los archivos de
 * Storage se borran desde la lista que guardó la base.
 */

type Llamada = { tipo: "rpc" | "storage" | "auditar"; nombre: string; args?: unknown };
type ErrorPg = { message: string; code?: string };
let llamadas: Llamada[] = [];
let autorizado = true;
let via: "cuenta" | "clave" = "cuenta";
let tenant: { nombre_comercial: string } | null = { nombre_comercial: "Tacos Prueba Piloto" };
let pendientes: { bucket: string; nombre: string }[] | null = [];
let rpc: Record<string, { data: unknown; error: ErrorPg | null }> = {};
let storageFalla: string[] = [];

const RESUMEN = {
  sucursales: 1, cajas: 1, usuarios: 2, productos: 12, tickets: 0, clientes: 0, cfdi: 0, pagos_suscripcion: 0,
  cuentas: 2, cuentas_conservadas: 0, archivos: 0, tablas_con_datos: 9, filas: 41,
};
const ELIMINADO = {
  ok: true,
  tenant: { id: "t1", codigo: "tacos-prueba-piloto", nombre_comercial: "Tacos Prueba Piloto" },
  resumen: RESUMEN, tablas: {}, bitacora_conservada: 3, cuentas_conservadas: [], archivos: [],
};
const ARCHIVOS = [{ bucket: "cfdi", nombre: "a.xml" }, { bucket: "cfdi", nombre: "a.pdf" }, { bucket: "otros", nombre: "t1/logo.png" }];

const sb = {
  from: (tabla: string) => {
    const fila = tabla === "tenants_eliminados"
      ? (pendientes === null ? null : { id: "t1", codigo: "tacos-prueba-piloto", nombre_comercial: "Tacos Prueba Piloto", archivos_pendientes: pendientes })
      : tenant;
    const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: fila, error: null }) };
    return q;
  },
  rpc: (nombre: string, args: unknown) => {
    llamadas.push({ tipo: "rpc", nombre, args });
    if (nombre === "marcar_archivos_eliminados") return Promise.resolve({ data: 0, error: null });
    return Promise.resolve(rpc[nombre] ?? { data: null, error: { message: "sin respuesta simulada" } });
  },
  storage: {
    from: (bucket: string) => ({
      remove: (nombres: string[]) => {
        llamadas.push({ tipo: "storage", nombre: bucket, args: nombres });
        return Promise.resolve({ error: storageFalla.includes(bucket) ? { message: "S3: AccessDenied arn:aws:s3:::interno" } : null });
      },
    }),
  },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve(autorizado
    ? { sb, actor: { id: "op-1", nombre: "Operadora", via } }
    : { error: NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 401 }) }),
  auditar: (_sb: unknown, a: { accion: string }) => { llamadas.push({ tipo: "auditar", nombre: a.accion, args: a }); return Promise.resolve(); },
  actorDe: () => ({ id: "op-1", nombre: "Operadora", via }),
  ipDeCliente: () => "10.0.0.7",
}));

const ruta = await import("../../api/tenants/[id]/eliminar/route");
const { GET, POST } = ruta;
const eliminados = await import("../../api/tenants/eliminados/route");

const ctx = { params: Promise.resolve({ id: "t1" }) };
const URL_RUTA = "http://x/api/tenants/t1/eliminar";
const pedir = (body: unknown) => new Request(URL_RUTA, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const BUENO = { motivo: "Alta de prueba que nunca operó", nombre: "Tacos Prueba Piloto", confirmacion: "ELIMINAR" };
const rpcs = (nombre?: string) => llamadas.filter((l) => l.tipo === "rpc" && (!nombre || l.nombre === nombre));

beforeEach(() => {
  llamadas = [];
  autorizado = true;
  via = "cuenta";
  tenant = { nombre_comercial: "Tacos Prueba Piloto" };
  pendientes = [];
  storageFalla = [];
  rpc = { eliminar_tenant: { data: ELIMINADO, error: null } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/tenants/[id]/eliminar — antes de tocar la base", () => {
  it("sin autorización responde lo que diga autorizar y no llama a nada", async () => {
    autorizado = false;
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("con la clave compartida no se elimina: hace falta la cuenta del operador (M3)", async () => {
    via = "clave";
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(403);
    const cuerpo = await r.json();
    expect(cuerpo.error).toBe("REQUIERE_CUENTA");
    expect(cuerpo.detalle).toBe("Eliminar un cliente requiere entrar con tu cuenta de operador.");
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
    expect(rpcs("eliminar_tenant")).toHaveLength(1);
    expect(rpcs("eliminar_tenant")[0]).toMatchObject({
      args: { p_tenant_id: "t1", p_motivo: "Alta de prueba que nunca operó", p_operador: "op-1", p_confirmacion: "ELIMINAR", p_ip: "10.0.0.7" },
    });
    const cuerpo = await r.json();
    expect(cuerpo).toMatchObject({ ok: true, resumen: { filas: 41 }, archivos: { borrados: 0, pendientes: 0 } });
    // La bitácora la asienta la base en su transacción: la ruta no escribe otra.
    expect(llamadas.filter((l) => l.tipo === "auditar")).toEqual([]);
  });

  it.each([
    ["TENANT_NO_CANCELADO: Solo se elimina un cliente cancelado. Primero dalo de baja.", "TENANT_NO_CANCELADO", 409],
    ["TENANT_INTERNO: Es un negocio interno de VIM: no se elimina.", "TENANT_INTERNO", 409],
    ["TIENE_TIMBRADOS: Tiene facturas timbradas: se conservan por obligación fiscal. Queda dado de baja.", "TIENE_TIMBRADOS", 409],
    ["TIMBRADO_EN_PROCESO: Tiene un timbrado a medias con el SAT.", "TIMBRADO_EN_PROCESO", 409],
    ["ESPERA_TIMBRADOS: Este cliente podía facturar y se dio de baja hace menos de 15 minutos: puede haber un timbrado en curso. Espera 12 min.", "ESPERA_TIMBRADOS", 409],
    ["TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó).", "TENANT_NO_EXISTE", 404],
  ])("un rechazo de la base (%s) sale con su código y su motivo", async (mensaje, codigo, status) => {
    rpc.eliminar_tenant = { data: null, error: { message: mensaje, code: "P0001" } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(status);
    const cuerpo = await r.json();
    expect(cuerpo.error).toBe(codigo);
    expect(mensaje).toContain(cuerpo.detalle);
    expect(llamadas.some((l) => l.tipo === "storage")).toBe(false);
  });

  it("la espera por timbrados dice cuántos minutos faltan (A1)", async () => {
    rpc.eliminar_tenant = { data: null, error: { message: "ESPERA_TIMBRADOS: Este cliente podía facturar y se dio de baja hace menos de 15 minutos: puede haber un timbrado en curso. Espera 12 min.", code: "P0001" } };
    const cuerpo = await (await POST(pedir(BUENO), ctx)).json();
    expect(cuerpo.detalle).toMatch(/Espera 12 min/);
  });

  it("si la base agota el tiempo (57014) dice que no se borró nada y por qué (M4)", async () => {
    rpc.eliminar_tenant = { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(504);
    const cuerpo = await r.json();
    expect(cuerpo.error).toBe("DEMASIADO_GRANDE");
    expect(cuerpo.detalle).toBe("No se borró nada: el negocio es demasiado grande para eliminarlo desde el panel.");
  });

  it("si otra operación tiene tomado al cliente (55P03) pide reintentar, sin borrar nada", async () => {
    rpc.eliminar_tenant = { data: null, error: { message: "canceling statement due to lock timeout", code: "55P03" } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("CLIENTE_OCUPADO");
  });

  it.each([
    ["deadlock detected", "40P01"],
    ["QUEDAN_REFERENCIAS: update or delete on table \"tickets\" violates foreign key constraint \"x_fkey\" on table \"otra\"", "P0001"],
    ["QUEDAN_FILAS: siguen quedando filas del cliente en tickets, pagos. No se borró nada.", "P0001"],
    ["permission denied for table users", "42501"],
  ])("el texto crudo de Postgres (%s) no sale al navegador: se registra en el servidor (B2)", async (mensaje, code) => {
    rpc.eliminar_tenant = { data: null, error: { message: mensaje, code } };
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBeGreaterThanOrEqual(409);
    const texto = JSON.stringify(await r.json());
    for (const crudo of ["deadlock", "foreign key", "x_fkey", "tickets, pagos", "permission denied", "table users"]) expect(texto).not.toContain(crudo);
    expect(texto).toContain("No se borró nada");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(mensaje));
  });
});

describe("POST /api/tenants/[id]/eliminar — archivos (M2)", () => {
  it("los borra por la API de Storage desde la lista que guardó la base, y la marca vacía", async () => {
    pendientes = ARCHIVOS;
    const r = await POST(pedir(BUENO), ctx);
    expect((await r.json()).archivos).toEqual({ borrados: 3, pendientes: 0 });
    expect(llamadas.map((l) => `${l.tipo}:${l.nombre}`)).toEqual([
      "rpc:eliminar_tenant", "storage:cfdi", "storage:otros", "rpc:marcar_archivos_eliminados", "auditar:tenant.eliminar_archivos",
    ]);
    expect(llamadas[1]!.args).toEqual(["a.xml", "a.pdf"]);
    expect(rpcs("marcar_archivos_eliminados")[0]!.args).toEqual({ p_id: "t1", p_pendientes: [] });
  });

  it("si Storage falla, el cliente ya está eliminado: responde 200 y deja pendientes los que faltan", async () => {
    pendientes = ARCHIVOS;
    storageFalla = ["cfdi"];
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.archivos).toEqual({ borrados: 1, pendientes: 2 });
    expect(JSON.stringify(cuerpo)).not.toContain("AccessDenied");
    expect(rpcs("marcar_archivos_eliminados")[0]!.args).toEqual({
      p_id: "t1", p_pendientes: [{ bucket: "cfdi", nombre: "a.xml" }, { bucket: "cfdi", nombre: "a.pdf" }],
    });
    const asiento = llamadas.find((l) => l.tipo === "auditar")!.args as { payload: { pendientes: number; tenant_eliminado: { codigo: string } } };
    expect(asiento.payload.pendientes).toBe(2);
    expect(asiento.payload.tenant_eliminado.codigo).toBe("tacos-prueba-piloto");
  });

  it("aunque la respuesta de la base no se entienda, el cliente ya se eliminó: se limpian los archivos igual", async () => {
    rpc.eliminar_tenant = { data: { ok: true, algo: "inesperado" }, error: null };
    pendientes = ARCHIVOS;
    const r = await POST(pedir(BUENO), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).archivos).toEqual({ borrados: 3, pendientes: 0 });
    expect(llamadas.filter((l) => l.tipo === "storage")).toHaveLength(2);
  });
});

describe("POST /api/tenants/eliminados — reintentar los archivos pendientes (M2)", () => {
  const reintentar = (body: unknown) => new Request("http://x/api/tenants/eliminados", { method: "POST", body: JSON.stringify(body) });

  it("sin autorización no hace nada", async () => {
    autorizado = false;
    expect((await eliminados.POST(reintentar({ id: "t1" }))).status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("borra los pendientes y vacía la lista", async () => {
    pendientes = ARCHIVOS;
    const r = await eliminados.POST(reintentar({ id: "t1" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, archivos: { borrados: 3, pendientes: 0 } });
    expect(rpcs("marcar_archivos_eliminados")[0]!.args).toEqual({ p_id: "t1", p_pendientes: [] });
  });

  it("sin pendientes no llama a Storage", async () => {
    const r = await eliminados.POST(reintentar({ id: "t1" }));
    expect(await r.json()).toMatchObject({ ok: true, archivos: { borrados: 0, pendientes: 0 } });
    expect(llamadas.filter((l) => l.tipo === "storage")).toEqual([]);
  });

  it("un id que no es de un cliente eliminado es un 404", async () => {
    pendientes = null;
    expect((await eliminados.POST(reintentar({ id: "t9" }))).status).toBe(404);
  });

  it("sin id es un 400", async () => {
    expect((await eliminados.POST(reintentar({}))).status).toBe(400);
  });
});

describe("GET /api/tenants/[id]/eliminar — vista previa", () => {
  const PREVIA = {
    tenant: { id: "t1", codigo: "tacos-prueba-piloto", nombre_comercial: "Tacos Prueba Piloto", estado: "CANCELADO", fecha_baja: null },
    puede_eliminar: false,
    bloqueos: [{ codigo: "ESPERA_TIMBRADOS", mensaje: "Este cliente podía facturar y se dio de baja hace menos de 15 minutos: puede haber un timbrado en curso. Espera 12 min.", espera_min: 12 }],
    resumen: RESUMEN,
    tablas: { sucursales: 1 },
  };

  it("sin autorización no consulta nada", async () => {
    autorizado = false;
    const r = await GET(new Request(URL_RUTA), ctx);
    expect(r.status).toBe(401);
    expect(llamadas).toEqual([]);
  });

  it("devuelve las cifras y el motivo del bloqueo (con los minutos de espera), sin escribir", async () => {
    rpc.eliminar_tenant_vista_previa = { data: PREVIA, error: null };
    const r = await GET(new Request(URL_RUTA), ctx);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.puede_eliminar).toBe(false);
    expect(cuerpo.bloqueos[0]).toMatchObject({ codigo: "ESPERA_TIMBRADOS", espera_min: 12 });
    expect(cuerpo.resumen.filas).toBe(41);
    expect(llamadas.map((l) => l.nombre)).toEqual(["eliminar_tenant_vista_previa"]);
  });

  it("la vista previa sí se puede ver con la clave compartida (no escribe nada)", async () => {
    via = "clave";
    rpc.eliminar_tenant_vista_previa = { data: PREVIA, error: null };
    expect((await GET(new Request(URL_RUTA), ctx)).status).toBe(200);
  });

  it("un cliente que no existe es un 404", async () => {
    rpc.eliminar_tenant_vista_previa = { data: null, error: { message: "TENANT_NO_EXISTE: ese cliente no existe (o ya se eliminó).", code: "P0001" } };
    expect((await GET(new Request(URL_RUTA), ctx)).status).toBe(404);
  });

  it("un error crudo de la base no sale al navegador (B2)", async () => {
    rpc.eliminar_tenant_vista_previa = { data: null, error: { message: "relation \"public.tabla_x\" does not exist", code: "42P01" } };
    const r = await GET(new Request(URL_RUTA), ctx);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("tabla_x");
  });
});

describe("la ruta declara su tiempo (M4)", () => {
  it("maxDuration de 60 s, por encima de los 50 s de la función de la base", () => {
    expect(ruta.maxDuration).toBe(60);
  });
});

describe("piezas puras", () => {
  it("leerRechazo separa código y mensaje, y no confunde un texto cualquiera con un código", () => {
    expect(leerRechazo({ message: "TIENE_TIMBRADOS: Tiene facturas" })).toMatchObject({ codigo: "TIENE_TIMBRADOS", detalle: "Tiene facturas", status: 409 });
    expect(leerRechazo({ message: "ERROR: permission denied" }).status).toBe(500);
    expect(leerRechazo({ message: "algo raro" })).toMatchObject({ codigo: "ERROR_AL_ELIMINAR", crudo: true });
    expect(leerRechazo({ message: "algo raro" }).detalle).not.toContain("algo raro");
  });

  it("distingue un rechazo del servidor de una petición que se cortó (M4)", () => {
    // Rechazos nuestros: traen texto, y en todos se dice que no se borró nada.
    expect(respuestaCortada(new Error("No se borró nada: el negocio es demasiado grande para eliminarlo desde el panel."))).toBe(false);
    expect(respuestaCortada(new Error("Ese cliente no existe (o ya se eliminó)."))).toBe(false);
    // Cortes: la plataforma mató la petición (cuerpo que no es JSON) o se cayó la conexión.
    expect(respuestaCortada(new Error("El servidor respondió 504"))).toBe(true);
    expect(respuestaCortada(new TypeError("Failed to fetch"))).toBe(true);
    expect(respuestaCortada("algo")).toBe(true);
    expect(AVISO_CORTE).toMatch(/Clientes eliminados/);
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
