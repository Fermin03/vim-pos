import { describe, it, expect, beforeEach } from "vitest";

/** Fake mínimo de localStorage + window (mismo patrón que print/__tests__/config.test.ts). */
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

const KEY = "vimpos.device.creds";

// Import dinámico tras montar window: el módulo lee `typeof window` en cada llamada,
// pero así el orden queda explícito y el test no depende de cuándo se cargó.
async function mod() {
  return await import("../device-creds");
}

describe("device-creds — SEC CN-006", () => {
  beforeEach(() => montarWindow());

  it("guarda solo el correo, nunca la contraseña", async () => {
    const store = montarWindow();
    const { guardarIdent } = await mod();
    guardarIdent({ email: "caja-1@dispositivos.vimpos.mx" });

    const guardado = store.get(KEY)!;
    expect(JSON.parse(guardado)).toEqual({ email: "caja-1@dispositivos.vimpos.mx" });
    expect(guardado).not.toContain("password");
  });

  it("lee el correo del formato nuevo", async () => {
    montarWindow({ [KEY]: JSON.stringify({ email: "caja-2@dispositivos.vimpos.mx" }) });
    const { leerIdent } = await mod();
    expect(leerIdent()).toEqual({ email: "caja-2@dispositivos.vimpos.mx" });
  });

  it("migra el formato viejo: devuelve el correo y BORRA la contraseña del disco", async () => {
    // Una caja ya instalada trae {email, password} en localStorage. Al leerla por primera vez
    // con esta versión, la contraseña tiene que desaparecer sin que el usuario haga nada.
    const store = montarWindow({
      [KEY]: JSON.stringify({ email: "caja-3@dispositivos.vimpos.mx", password: "vim-secreto" }),
    });
    const { leerIdent } = await mod();

    expect(leerIdent()).toEqual({ email: "caja-3@dispositivos.vimpos.mx" });
    const tras = store.get(KEY)!;
    expect(tras).not.toContain("vim-secreto");
    expect(JSON.parse(tras)).toEqual({ email: "caja-3@dispositivos.vimpos.mx" });
  });

  it("devuelve null si no hay nada, si el JSON está roto o si falta el correo", async () => {
    const { leerIdent } = await mod();
    expect(leerIdent()).toBeNull();

    montarWindow({ [KEY]: "{no es json" });
    expect(leerIdent()).toBeNull();

    montarWindow({ [KEY]: JSON.stringify({ password: "huerfana" }) });
    expect(leerIdent()).toBeNull();
  });

  it("olvidarCreds borra la entrada completa", async () => {
    const store = montarWindow({ [KEY]: JSON.stringify({ email: "caja-4@dispositivos.vimpos.mx" }) });
    const { olvidarCreds } = await mod();
    olvidarCreds();
    expect(store.has(KEY)).toBe(false);
  });
});
