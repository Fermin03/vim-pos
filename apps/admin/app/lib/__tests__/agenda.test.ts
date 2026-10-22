import { describe, expect, it } from "vitest";
import {
  DIAS_AGENDA, ausenciaSchema, camposDe, horarioSchema, horasCancelarValidas, pctValido, reglaDeCampos, reglaSchema, servicioColaboradorSchema,
  servicioSchema, siguienteColor, sueldoValido, textoRegla, toleranciaValida,
} from "../agenda";
import { COLORES } from "../catalogo";

const PALETA = COLORES.map((c) => c.hex);
const UUID = "99999999-0000-0000-0000-0000000000aa";

describe("siguienteColor", () => {
  it("da el primero que nadie usa, sin importar mayúsculas", () => {
    expect(siguienteColor([])).toBe(PALETA[0]);
    expect(siguienteColor([PALETA[0]!.toLowerCase(), PALETA[2]!])).toBe(PALETA[1]);
  });
  it("con toda la paleta usada, se repite en orden", () => {
    expect(siguienteColor(PALETA)).toBe(PALETA[0]);
    expect(siguienteColor([...PALETA, PALETA[0]!])).toBe(PALETA[1]);
  });
});

describe("DIAS_AGENDA", () => {
  it("lunes primero; domingo es 0 como en la base", () => {
    expect(DIAS_AGENDA[0]).toEqual({ dia: 1, nombre: "Lunes" });
    expect(DIAS_AGENDA[6]).toEqual({ dia: 0, nombre: "Domingo" });
  });
});

describe("servicioSchema", () => {
  const base = { nombre: "Manicure", categoria_id: UUID, precio_base_mxn: 250, duracion_min: 45, tipo_espacio_id: null, comision: null, anticipo: null, clave_sat: null };
  it("la duración va de 5 a 600 minutos enteros", () => {
    expect(servicioSchema.safeParse(base).success).toBe(true);
    expect(servicioSchema.safeParse({ ...base, duracion_min: 5 }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...base, duracion_min: 600 }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...base, duracion_min: 4 }).success).toBe(false);
    expect(servicioSchema.safeParse({ ...base, duracion_min: 601 }).success).toBe(false);
    expect(servicioSchema.safeParse({ ...base, duracion_min: 30.5 }).success).toBe(false);
  });
  it("precio y duración propios del colaborador: vacíos o válidos", () => {
    expect(servicioColaboradorSchema.safeParse({ usuario_id: UUID, precio_mxn: null, duracion_min: null, comision: null }).success).toBe(true);
    expect(servicioColaboradorSchema.safeParse({ usuario_id: UUID, precio_mxn: -1, duracion_min: null, comision: null }).success).toBe(false);
    expect(servicioColaboradorSchema.safeParse({ usuario_id: UUID, precio_mxn: null, duracion_min: 700, comision: null }).success).toBe(false);
  });
});

describe("horarioSchema", () => {
  const h = { dia_semana: 1, inicia: "09:00", termina: "18:00", comida_inicia: null, comida_termina: null };
  const err = (x: object) => { const r = horarioSchema.safeParse(x); return r.success ? null : r.error.issues[0]?.message; };
  it("la salida va después de la entrada", () => {
    expect(err(h)).toBeNull();
    expect(err({ ...h, termina: "09:00" })).toMatch(/después de la entrada/);
    expect(err({ ...h, termina: "08:00" })).toMatch(/después de la entrada/);
  });
  it("la comida va completa y dentro del horario", () => {
    expect(err({ ...h, comida_inicia: "14:00", comida_termina: "15:00" })).toBeNull();
    expect(err({ ...h, comida_inicia: "09:00", comida_termina: "18:00" })).toBeNull();
    expect(err({ ...h, comida_inicia: "14:00", comida_termina: null })).toMatch(/las dos horas/);
    expect(err({ ...h, comida_inicia: "08:00", comida_termina: "09:30" })).toMatch(/dentro del horario/);
    expect(err({ ...h, comida_inicia: "17:30", comida_termina: "18:30" })).toMatch(/dentro del horario/);
    expect(err({ ...h, comida_inicia: "15:00", comida_termina: "14:00" })).toMatch(/dentro del horario/);
  });
  it("horas mal escritas no pasan", () => {
    expect(err({ ...h, inicia: "9:00" })).toMatch(/09:00/);
  });
});

describe("ausenciaSchema", () => {
  it("hasta puede ser el mismo día, no antes", () => {
    expect(ausenciaSchema.safeParse({ desde: "2026-11-02", hasta: "2026-11-02", motivo: "" }).success).toBe(true);
    expect(ausenciaSchema.safeParse({ desde: "2026-11-02", hasta: "2026-11-09", motivo: "Vacaciones" }).success).toBe(true);
    expect(ausenciaSchema.safeParse({ desde: "2026-11-02", hasta: "2026-11-01", motivo: "" }).success).toBe(false);
    expect(ausenciaSchema.safeParse({ desde: "", hasta: "2026-11-01", motivo: "" }).success).toBe(false);
  });
});

describe("toleranciaValida", () => {
  it("de 0 a 120 minutos enteros", () => {
    expect(toleranciaValida("0")).toBe(true);
    expect(toleranciaValida("120")).toBe(true);
    expect(toleranciaValida("121")).toBe(false);
    expect(toleranciaValida("-1")).toBe(false);
    expect(toleranciaValida("1.5")).toBe(false);
    expect(toleranciaValida("")).toBe(false);
  });
});

describe("reglaSchema (comisión y anticipo)", () => {
  const ok = (x: unknown) => reglaSchema.safeParse(x).success;
  it("porcentaje de 0 a 100; monto desde 0 sin tope; null = sin regla", () => {
    expect(ok(null)).toBe(true);
    expect(ok({ tipo: "PORCENTAJE", valor: 0 })).toBe(true);
    expect(ok({ tipo: "PORCENTAJE", valor: 100 })).toBe(true);
    expect(ok({ tipo: "PORCENTAJE", valor: 100.01 })).toBe(false);
    expect(ok({ tipo: "PORCENTAJE", valor: -1 })).toBe(false);
    expect(ok({ tipo: "MONTO", valor: 0 })).toBe(true);
    expect(ok({ tipo: "MONTO", valor: 350 })).toBe(true);
    expect(ok({ tipo: "MONTO", valor: -0.01 })).toBe(false);
    expect(ok({ tipo: "OTRO", valor: 1 })).toBe(false);
  });
  it("el servicio valida su comisión y su anticipo, y la clave SAT son 8 dígitos", () => {
    const base = { nombre: "Corte", categoria_id: UUID, precio_base_mxn: 180, duracion_min: 30, tipo_espacio_id: null, comision: null, anticipo: null, clave_sat: null };
    expect(servicioSchema.safeParse({ ...base, comision: { tipo: "PORCENTAJE", valor: 40 }, anticipo: { tipo: "MONTO", valor: 100 } }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...base, comision: { tipo: "PORCENTAJE", valor: 140 } }).success).toBe(false);
    expect(servicioSchema.safeParse({ ...base, anticipo: { tipo: "PORCENTAJE", valor: 101 } }).success).toBe(false);
    expect(servicioSchema.safeParse({ ...base, clave_sat: "85121800" }).success).toBe(true);
    expect(servicioSchema.safeParse({ ...base, clave_sat: "8512" }).success).toBe(false);
    // Sin tocar el campo (undefined) no se valida ni se reescribe la clave que ya tenía.
    expect(servicioSchema.safeParse({ ...base, clave_sat: undefined }).success).toBe(true);
    expect(servicioColaboradorSchema.safeParse({ usuario_id: UUID, precio_mxn: null, duracion_min: null, comision: { tipo: "MONTO", valor: 50 } }).success).toBe(true);
    expect(servicioColaboradorSchema.safeParse({ usuario_id: UUID, precio_mxn: null, duracion_min: null, comision: { tipo: "PORCENTAJE", valor: 101 } }).success).toBe(false);
  });
  it("de los campos a la regla y de vuelta", () => {
    expect(reglaDeCampos({ tipo: "", valor: "40" })).toBeNull();
    expect(reglaDeCampos({ tipo: "PORCENTAJE", valor: "40" })).toEqual({ tipo: "PORCENTAJE", valor: 40 });
    expect(reglaSchema.safeParse(reglaDeCampos({ tipo: "MONTO", valor: " " })).success).toBe(false);
    expect(camposDe({ tipo: "MONTO", valor: 50 })).toEqual({ tipo: "MONTO", valor: "50" });
    expect(camposDe(null)).toEqual({ tipo: "", valor: "" });
    expect(textoRegla({ tipo: "PORCENTAJE", valor: 40 })).toBe("40 %");
    expect(textoRegla(null)).toBe("—");
  });
});

describe("reglas del negocio", () => {
  it("límite para cancelar: de 0 a 168 horas enteras", () => {
    expect(horasCancelarValidas("0")).toBe(true);
    expect(horasCancelarValidas("168")).toBe(true);
    expect(horasCancelarValidas("169")).toBe(false);
    expect(horasCancelarValidas("-1")).toBe(false);
    expect(horasCancelarValidas("2.5")).toBe(false);
    expect(horasCancelarValidas("")).toBe(false);
  });
  it("comisión por productos: de 0 a 100 con dos decimales", () => {
    expect(pctValido("0")).toBe(true);
    expect(pctValido("100")).toBe(true);
    expect(pctValido("12.5")).toBe(true);
    expect(pctValido("100.5")).toBe(false);
    expect(pctValido("1.234")).toBe(false);
    expect(pctValido("")).toBe(false);
  });
  it("sueldo: pesos con centavos, sin negativos ni vacío", () => {
    expect(sueldoValido("0")).toBe(true);
    expect(sueldoValido("1500.50")).toBe(true);
    expect(sueldoValido("-1")).toBe(false);
    expect(sueldoValido("")).toBe(false);
  });
});
