import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConTimeoutAuth, guardarIdent, leerCredsLegadas, leerIdent, olvidarCreds } from "@vim/kds-core";

// Auditoría integral 30/09/2026 — B2-5 (SEC CN-006 en la cocina): la contraseña del dispositivo
// ya no se guarda en claro; y el arranque sin ella no se cuelga porque las llamadas de auth llevan
// timeout.

const KEY = "vimpos.device.creds";

function montarWindow(inicial: Record<string, string> = {}) {
  const store = new Map(Object.entries(inicial));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

describe("kds-core device-creds", () => {
  beforeEach(() => montarWindow());

  it("guarda solo el correo, nunca la contraseña", () => {
    const store = montarWindow();
    guardarIdent({ email: "caja-1@dispositivos.vimpos.com.mx" });
    expect(JSON.parse(store.get(KEY)!)).toEqual({ email: "caja-1@dispositivos.vimpos.com.mx" });
    expect(store.get(KEY)).not.toContain("password");
  });

  it("una tele instalada con el formato viejo: entrega las credenciales legadas para migrar", () => {
    montarWindow({ [KEY]: JSON.stringify({ email: "caja-2@x", password: "secreta" }) });
    expect(leerIdent()).toEqual({ email: "caja-2@x" });
    expect(leerCredsLegadas()).toEqual({ email: "caja-2@x", password: "secreta" });
  });

  it("en cuanto hay sesión, guardarIdent borra la contraseña legada del disco", () => {
    const store = montarWindow({ [KEY]: JSON.stringify({ email: "caja-3@x", password: "secreta" }) });
    guardarIdent({ email: "caja-3@x" });
    expect(store.get(KEY)).not.toContain("secreta");
    expect(leerCredsLegadas()).toBeNull();
    expect(leerIdent()).toEqual({ email: "caja-3@x" });
  });

  it("olvidarCreds limpia todo y tolera basura en el almacenamiento", () => {
    montarWindow({ [KEY]: "{no es json" });
    expect(leerIdent()).toBeNull();
    expect(leerCredsLegadas()).toBeNull();
    olvidarCreds();
  });
});

describe("fetchConTimeoutAuth", () => {
  it("aborta una llamada de /auth/v1 que no responde", async () => {
    const colgada = vi.fn((_i: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const f = fetchConTimeoutAuth(20, colgada);
    await expect(f("http://hub:54321/auth/v1/token?grant_type=refresh_token", { method: "POST" })).rejects.toThrow(/aborted/);
  });

  it("no toca las demás rutas (lecturas de comandas)", async () => {
    const base = vi.fn(async () => new Response("[]"));
    const f = fetchConTimeoutAuth(20, base);
    await f("http://hub:54321/rest/v1/tickets", {});
    expect(base.mock.calls[0]![1]).toEqual({});
  });

  it("deja pasar la respuesta de auth cuando llega a tiempo", async () => {
    const f = fetchConTimeoutAuth(1000, async () => new Response("ok"));
    await expect((await f("http://hub/auth/v1/user")).text()).resolves.toBe("ok");
  });
});
