import { beforeEach, describe, expect, it, vi } from "vitest";
import { accesoDeDueno, mensajeReenvio, tipoDeReenvio } from "../acceso-dueno";

/*
 * Reenviar la invitación o la confirmación al dueño (roadmap A5). Lo que se protege: que a cada
 * dueño le llegue el correo de SU camino de alta (invitación si lo dio de alta VIM, confirmación
 * si se registró solo), que a un dueño ya confirmado no se le mande nada, que no se pueda
 * disparar en ráfaga y que quede en la bitácora.
 */

describe("tipoDeReenvio", () => {
  it("quien se registró solo recibe la confirmación de registro", () => {
    expect(tipoDeReenvio({ autoservicio: true, terminosVersion: null })).toBe("confirmacion");
    // Una cuenta vieja sin la marca en sus metadatos: la constancia de términos lo dice igual.
    expect(tipoDeReenvio({ autoservicio: false, terminosVersion: "2026-09-30" })).toBe("confirmacion");
  });
  it("a quien dio de alta VIM se le reenvía la invitación", () => {
    expect(tipoDeReenvio({ autoservicio: false, terminosVersion: null })).toBe("invitacion");
  });
});

describe("accesoDeDueno", () => {
  it("sin cuenta de dueño no hay nada que reenviar", () => {
    expect(accesoDeDueno(null, null)).toBeNull();
  });
  it("resume correo, confirmación y camino de alta", () => {
    expect(accesoDeDueno(
      { email: "ana@tacos.mx", email_confirmed_at: null, invited_at: "2026-09-30T10:00:00Z", confirmation_sent_at: null, last_sign_in_at: null, user_metadata: {} },
      null,
    )).toEqual({ email: "ana@tacos.mx", confirmadoEl: null, ultimoEnvio: "2026-09-30T10:00:00Z", ultimoAcceso: null, tipo: "invitacion" });
    expect(accesoDeDueno(
      { email: "ana@tacos.mx", email_confirmed_at: "2026-10-01T09:00:00Z", invited_at: null, confirmation_sent_at: "2026-09-30T12:00:00Z", last_sign_in_at: "2026-10-01T09:00:00Z", user_metadata: { onboarding_self_service: true } },
      "2026-09-30",
    )).toMatchObject({ confirmadoEl: "2026-10-01T09:00:00Z", tipo: "confirmacion", ultimoEnvio: "2026-09-30T12:00:00Z" });
  });
});

describe("mensajeReenvio", () => {
  it("dice qué correo se mandó y a quién", () => {
    expect(mensajeReenvio("invitacion", "ana@tacos.mx")).toMatch(/invitación.*ana@tacos\.mx/);
    expect(mensajeReenvio("confirmacion", "ana@tacos.mx")).toMatch(/confirmación.*ana@tacos\.mx/);
  });
});

// ── La ruta ─────────────────────────────────────────────────────────────────────────────────────

const estado = {
  usuario: null as Record<string, unknown> | null,
  cupo: true as boolean,
  cupoError: null as { message: string } | null,
  envioError: null as { message: string; status?: number } | null,
};
let llamadas: { que: string; args?: unknown }[] = [];
let auditorias: Record<string, unknown>[] = [];

const sb = {
  from: (t: string) => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: () => Promise.resolve({
        data: t === "tenants" ? { usuario_dueno_id: "u1", nombre_comercial: "Tacos Ana" } : { terminos_version: null },
        error: null,
      }),
    };
    return q;
  },
  rpc: (fn: string, args: unknown) => {
    llamadas.push({ que: `rpc:${fn}`, args });
    return Promise.resolve(estado.cupoError ? { data: null, error: estado.cupoError } : { data: estado.cupo, error: null });
  },
  auth: {
    resend: (a: unknown) => { llamadas.push({ que: "resend", args: a }); return Promise.resolve({ error: estado.envioError }); },
    admin: {
      getUserById: () => Promise.resolve({ data: { user: estado.usuario }, error: null }),
      inviteUserByEmail: (email: string, o: unknown) => { llamadas.push({ que: "invite", args: { email, o } }); return Promise.resolve({ data: { user: { id: "u1" } }, error: estado.envioError }); },
    },
  },
};

vi.mock("../server", () => ({
  autorizar: () => Promise.resolve({ sb, actor: { id: "op1", nombre: "Operador", via: "cuenta" } }),
  auditar: (_sb: unknown, a: Record<string, unknown>) => { auditorias.push(a); return Promise.resolve(); },
}));

const { POST } = await import("../../api/tenants/[id]/reenviar-acceso/route");
const ctx = { params: Promise.resolve({ id: "t1" }) };
const pedir = () => new Request("http://x/api/tenants/t1/reenviar-acceso", { method: "POST" });

const SIN_CONFIRMAR = { id: "u1", email: "ana@tacos.mx", email_confirmed_at: null, invited_at: "2026-09-30T10:00:00Z", user_metadata: { nombre: "Ana" } };

beforeEach(() => {
  llamadas = []; auditorias = [];
  estado.usuario = { ...SIN_CONFIRMAR };
  estado.cupo = true; estado.cupoError = null; estado.envioError = null;
  process.env.ADMIN_APP_URL = "https://admin.vimpos.com.mx/";
});

describe("POST /api/tenants/[id]/reenviar-acceso", () => {
  it("a un dueño dado de alta por VIM le reenvía la INVITACIÓN, que aterriza en /establecer-acceso", async () => {
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, tipo: "invitacion" });
    expect(j.mensaje).toContain("ana@tacos.mx");
    const inv = llamadas.find((l) => l.que === "invite");
    expect(inv?.args).toMatchObject({ email: "ana@tacos.mx", o: { redirectTo: "https://admin.vimpos.com.mx/establecer-acceso" } });
    expect(llamadas.some((l) => l.que === "resend")).toBe(false);
    expect(auditorias[0]).toMatchObject({ accion: "tenant.reenviar_acceso", tenantId: "t1", payload: { tipo: "invitacion" } });
  });

  it("a quien se registró solo le reenvía la CONFIRMACIÓN, que aterriza en /cuenta-confirmada", async () => {
    estado.usuario = { ...SIN_CONFIRMAR, invited_at: null, user_metadata: { onboarding_self_service: true } };
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).tipo).toBe("confirmacion");
    expect(llamadas.find((l) => l.que === "resend")?.args).toMatchObject({
      type: "signup", email: "ana@tacos.mx", options: { emailRedirectTo: "https://admin.vimpos.com.mx/cuenta-confirmada" },
    });
    expect(llamadas.some((l) => l.que === "invite")).toBe(false);
  });

  it("con el correo ya confirmado no manda nada", async () => {
    estado.usuario = { ...SIN_CONFIRMAR, email_confirmed_at: "2026-10-01T09:00:00Z" };
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("YA_CONFIRMADO");
    expect(llamadas.filter((l) => l.que === "invite" || l.que === "resend")).toEqual([]);
    expect(auditorias).toEqual([]);
  });

  it("pasado el límite contesta 429 sin llamar a Auth", async () => {
    estado.cupo = false;
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(429);
    expect(llamadas.filter((l) => l.que === "invite" || l.que === "resend")).toEqual([]);
    expect(auditorias).toEqual([]);
  });

  it("si la base del límite no responde, no manda (falla cerrado)", async () => {
    estado.cupoError = { message: "timeout" };
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(503);
    expect(llamadas.filter((l) => l.que === "invite" || l.que === "resend")).toEqual([]);
  });

  it("el límite de correo de Auth se explica en español, no con su error crudo", async () => {
    estado.envioError = { message: "For security purposes, you can only request this after 43 seconds.", status: 429 };
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.error).toBe("ESPERA_UN_MINUTO");
    expect(j.detalle).toMatch(/minuto/);
    expect(auditorias).toEqual([]);
  });

  it("sin cuenta de dueño contesta 400", async () => {
    estado.usuario = null;
    const r = await POST(pedir(), ctx);
    expect(r.status).toBe(400);
  });
});
