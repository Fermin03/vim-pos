import { describe, expect, it } from "vitest";
import { abrirStreamHub, urlStreamHub, type FuenteEventos } from "@vim/kds-core";

// Auditoría integral 30/09/2026 (escritorio D-4): el stream del hub exige token. EventSource
// reconecta con la MISMA URL, así que un token caducado lo mataba para siempre; aquí se reabre.

class FuenteFalsa implements FuenteEventos {
  readyState = 0;
  onerror: ((ev: unknown) => void) | null = null;
  cerrada = false;
  oyentes = new Map<string, () => void>();
  constructor(public url: string) {}
  addEventListener(tipo: string, fn: () => void) { this.oyentes.set(tipo, fn); }
  close() { this.cerrada = true; this.readyState = 2; }
}

function banco() {
  const fuentes: FuenteFalsa[] = [];
  const pendientes: (() => void)[] = [];
  return {
    fuentes,
    pendientes,
    crear: (url: string) => { const f = new FuenteFalsa(url); fuentes.push(f); return f; },
    programar: (fn: () => void) => { pendientes.push(fn); return pendientes.length; },
    cancelar: () => { pendientes.length = 0; },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("stream del hub", () => {
  it("manda el token en ?access_token= junto con los demás parámetros", () => {
    expect(urlStreamHub("http://caja:54350", "abc", { sucursal: "s1" }))
      .toBe("http://caja:54350/kds/stream?sucursal=s1&access_token=abc");
    expect(urlStreamHub("http://caja:54350", null)).toBe("http://caja:54350/kds/stream");
  });

  it("si el hub rechaza (token caducado), reabre con un token NUEVO", async () => {
    const b = banco();
    let n = 0;
    abrirStreamHub({ base: "http://h", obtenerToken: () => `t${++n}`, eventos: {}, ...b });
    await tick();
    expect(b.fuentes[0].url).toContain("access_token=t1");
    b.fuentes[0].readyState = 2;            // el navegador se rindió (401)
    b.fuentes[0].onerror?.({});
    expect(b.pendientes).toHaveLength(1);
    b.pendientes[0]();
    await tick();
    expect(b.fuentes[1].url).toContain("access_token=t2");
  });

  it("mientras el navegador reintenta solo (CONNECTING), no abre otro", async () => {
    const b = banco();
    abrirStreamHub({ base: "http://h", obtenerToken: () => "t", eventos: {}, ...b });
    await tick();
    b.fuentes[0].readyState = 0;
    b.fuentes[0].onerror?.({});
    expect(b.pendientes).toHaveLength(0);
  });

  it("entrega los eventos y al cerrar no reabre", async () => {
    const b = banco();
    let recargas = 0;
    const cerrar = abrirStreamHub({ base: "http://h", obtenerToken: async () => "t", eventos: { cocina: () => { recargas++; } }, ...b });
    await tick();
    b.fuentes[0].oyentes.get("cocina")?.();
    expect(recargas).toBe(1);
    cerrar();
    expect(b.fuentes[0].cerrada).toBe(true);
    b.fuentes[0].onerror?.({});
    expect(b.pendientes).toHaveLength(0);
  });
});
