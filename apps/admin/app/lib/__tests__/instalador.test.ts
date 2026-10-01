import { describe, expect, it } from "vitest";
import { fechaLarga, leerInstalador, leerManifiesto, MANIFIESTO_URL } from "../instalador";

const REAL = {
  version: "0.4.99",
  url: "https://github.com/Fermin03/vim-pos-descargas/releases/download/v0.4.99/VIM.POS.Setup.0.4.99.exe",
  sha512: "cc9c",
  notas: "…",
  fecha: "2026-09-30",
};

describe("instalador de la caja (0142)", () => {
  it("lee el latest.json publicado", () => {
    expect(leerManifiesto(REAL)).toEqual({ version: "0.4.99", url: REAL.url, fecha: "2026-09-30" });
    expect(leerManifiesto({ ...REAL, fecha: undefined })?.fecha).toBeNull();
  });

  it("no ofrece descargas de otro sitio, sin https o que no sean .exe", () => {
    expect(leerManifiesto({ ...REAL, url: "https://malo.example/VIM.exe" })).toBeNull();
    expect(leerManifiesto({ ...REAL, url: "https://github.com/otro/repo/releases/download/v1/VIM.exe" })).toBeNull();
    expect(leerManifiesto({ ...REAL, url: "http://github.com/x/VIM.exe" })).toBeNull();
    expect(leerManifiesto({ ...REAL, url: "https://github.com/Fermin03/vim-pos-descargas/releases/latest" })).toBeNull();
    expect(leerManifiesto({ ...REAL, version: "latest" })).toBeNull();
    expect(leerManifiesto(null)).toBeNull();
  });

  it("fecha en palabras, sin correrse un día", () => {
    expect(fechaLarga("2026-09-30")).toBe("30 de septiembre de 2026");
    expect(fechaLarga("2026-01-01")).toBe("1 de enero de 2026");
    expect(fechaLarga(null)).toBeNull();
    expect(fechaLarga("x")).toBeNull();
  });

  it("lee sin caché y cae a null si el manifiesto no responde", async () => {
    const llamadas: [string, RequestInit | undefined][] = [];
    const ok = (async (u: string, init?: RequestInit) => {
      llamadas.push([u, init]);
      return new Response(JSON.stringify(REAL), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await leerInstalador(ok))?.version).toBe("0.4.99");
    expect(llamadas[0]![0]).toBe(MANIFIESTO_URL);
    expect(llamadas[0]![1]?.cache).toBe("no-store");

    const cae = (async () => { throw new Error("red"); }) as unknown as typeof fetch;
    expect(await leerInstalador(cae)).toBeNull();
    const e404 = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    expect(await leerInstalador(e404)).toBeNull();
  });
});
