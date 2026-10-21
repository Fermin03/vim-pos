import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("modo demo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("MODO_DEMO es true solo con NEXT_PUBLIC_VIM_DEMO=1", async () => {
    vi.stubEnv("NEXT_PUBLIC_VIM_DEMO", "1");
    expect((await import("../demo")).MODO_DEMO).toBe(true);
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_VIM_DEMO", "");
    expect((await import("../demo")).MODO_DEMO).toBe(false);
  });

  it("iniciarDemo rechaza con el código que manda la función", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "DEMO_LLENA" }), { status: 503 })));
    const { iniciarDemo } = await import("../demo");
    await expect(iniciarDemo()).rejects.toThrow("DEMO_LLENA");
  });

  it("sin cuerpo legible usa DEMO_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const { iniciarDemo } = await import("../demo");
    await expect(iniciarDemo()).rejects.toThrow("DEMO_ERROR");
  });
});
