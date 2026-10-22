import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- config .mjs sin tipos
import nextConfig, { origenDeSupabase } from "../../../next.config.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("CSP de la caja web: fotos de producto", () => {
  it("img-src deja pasar solo el origen de Supabase", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co/rest/v1");
    const reglas = await nextConfig.headers();
    const csp = reglas[0].headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value as string;
    expect(csp).toContain("img-src 'self' data: blob: https://abc.supabase.co;");
  });
  it("sin la variable no entra ningún origen", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(origenDeSupabase()).toEqual([]);
  });
});
