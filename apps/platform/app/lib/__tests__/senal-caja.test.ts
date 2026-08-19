import { describe, it, expect } from "vitest";
import { señalDeCaja, estadoDeCaja } from "../senal-caja";

const AHORA = new Date("2026-08-19T12:00:00Z").getTime();
const haceHoras = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();

describe("señalDeCaja", () => {
  it("prefiere el sello de conexión sobre todo lo demás", () => {
    const r = señalDeCaja({ ultimaConexion: haceHoras(1), ultimoSync: haceHoras(5), ultimaVenta: haceHoras(2) }, AHORA);
    expect(r.origen).toBe("conexion");
    expect(r.horas).toBe(1);
  });

  it("usa el sync cuando no hay sello de conexión, aunque la venta sea más reciente", () => {
    // La venta prueba que OPERÓ; el sync prueba que SUBIÓ. Para "¿está respaldada?" manda el sync.
    const r = señalDeCaja({ ultimoSync: haceHoras(40), ultimaVenta: haceHoras(2) }, AHORA);
    expect(r.origen).toBe("sync");
    expect(r.horas).toBe(40);
  });

  it("cae a la venta cuando es lo único que hay", () => {
    expect(señalDeCaja({ ultimaVenta: haceHoras(3) }, AHORA).origen).toBe("venta");
  });

  it("sin ninguna señal no inventa una", () => {
    expect(señalDeCaja({}, AHORA)).toEqual({ señal: null, origen: null, horas: null });
  });

  it("una fecha ilegible cuenta como ausencia, no como recién conectada", () => {
    const r = señalDeCaja({ ultimaConexion: "no-es-fecha" }, AHORA);
    expect(r.horas).toBeNull();
    expect(r.origen).toBeNull();
  });
});

describe("estadoDeCaja", () => {
  const viva = { bloqueada: false, activa: true };

  it("este era el bug: sin señal se dice 'nunca', y con señal deja de decirlo", () => {
    expect(estadoDeCaja(viva, null)).toBe("nunca");
    expect(estadoDeCaja(viva, 2)).toBe("ok");
  });

  it("los umbrales: 24 h pasa a tibia y 72 h a caída", () => {
    expect(estadoDeCaja(viva, 23)).toBe("ok");
    expect(estadoDeCaja(viva, 24)).toBe("tibia");
    expect(estadoDeCaja(viva, 71)).toBe("tibia");
    expect(estadoDeCaja(viva, 72)).toBe("caida");
  });

  it("el caso real del piloto: 40 h desde el último sync → sin conexión, no 'nunca'", () => {
    expect(estadoDeCaja(viva, 40)).toBe("tibia");
  });

  it("bloqueada e inactiva mandan sobre la frescura", () => {
    expect(estadoDeCaja({ bloqueada: true, activa: true }, 1)).toBe("bloqueada");
    expect(estadoDeCaja({ bloqueada: false, activa: false }, 1)).toBe("inactiva");
  });
});
