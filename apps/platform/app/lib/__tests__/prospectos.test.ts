import { describe, expect, it } from "vitest";
import {
  alertaProspectos,
  enlaceProspecto,
  leerCambioProspecto,
  mensajeProspecto,
  NOTA_MAXIMA,
  prefijoNuevoCliente,
} from "../prospectos";

const HORA = 3_600_000;
const AHORA = Date.parse("2026-10-01T18:00:00Z");
const hace = (h: number) => new Date(AHORA - h * HORA).toISOString();

describe("mensajeProspecto / enlaceProspecto", () => {
  it("saluda por su nombre y nombra el negocio", () => {
    expect(mensajeProspecto({ nombre: "Ana López", negocio: "Tacos El Güero" })).toBe(
      "Hola Ana López, soy Fermín de VIM POS. Vi que pediste una demo para Tacos El Güero.",
    );
  });

  it("a un número de 10 dígitos le pone la lada de México", () => {
    const url = enlaceProspecto({ nombre: "Ana", negocio: "Tacos & Más", whatsapp: "4771234567" });
    expect(url).toMatch(/^https:\/\/wa\.me\/524771234567\?text=/);
    // El mensaje va codificado: un & en el nombre del negocio no puede partir la URL.
    expect(url).toContain(encodeURIComponent("Tacos & Más"));
    expect(url).not.toContain("Tacos & Más");
  });

  it("un número que ya trae lada de país se respeta", () => {
    expect(enlaceProspecto({ nombre: "Ana", negocio: "X y Z", whatsapp: "+1 (415) 555-0100" })).toMatch(/^https:\/\/wa\.me\/14155550100\?/);
  });

  it("sin un número usable no hay enlace", () => {
    expect(enlaceProspecto({ nombre: "Ana", negocio: "X y Z", whatsapp: "123" })).toBeNull();
  });
});

describe("leerCambioProspecto", () => {
  it("acepta un estado válido y recorta la nota", () => {
    expect(leerCambioProspecto({ estado: "CONTACTADO", notas: "  le marco el lunes  " })).toEqual({
      ok: true, cambio: { estado: "CONTACTADO", notas: "le marco el lunes" },
    });
  });

  it("una nota vacía se guarda como null, y sin nota no se toca", () => {
    expect(leerCambioProspecto({ estado: "PERDIDO", notas: "   " })).toEqual({ ok: true, cambio: { estado: "PERDIDO", notas: null } });
    expect(leerCambioProspecto({ estado: "PERDIDO" })).toEqual({ ok: true, cambio: { estado: "PERDIDO" } });
  });

  it("solo la nota también vale", () => {
    expect(leerCambioProspecto({ notas: "pide precio anual" })).toEqual({ ok: true, cambio: { notas: "pide precio anual" } });
  });

  it("rechaza un estado inventado, una nota larga y un cuerpo sin nada", () => {
    expect(leerCambioProspecto({ estado: "CERRADO" })).toMatchObject({ ok: false, error: "ESTADO_INVALIDO" });
    expect(leerCambioProspecto({ notas: "x".repeat(NOTA_MAXIMA + 1) })).toMatchObject({ ok: false, error: "NOTA_INVALIDA" });
    expect(leerCambioProspecto({ notas: 5 })).toMatchObject({ ok: false, error: "NOTA_INVALIDA" });
    expect(leerCambioProspecto({})).toMatchObject({ ok: false, error: "NADA_QUE_CAMBIAR" });
  });
});

describe("alertaProspectos", () => {
  it("sin prospectos nuevos de más de 24 h no hay alerta", () => {
    expect(alertaProspectos([], AHORA)).toBeNull();
    expect(alertaProspectos([{ negocio: "A", estado: "NUEVO", creado_en: hace(23) }], AHORA)).toBeNull();
    // Ya contactado: aunque sea viejo, no es un pendiente.
    expect(alertaProspectos([{ negocio: "A", estado: "CONTACTADO", creado_en: hace(200) }], AHORA)).toBeNull();
  });

  it("uno que lleva más de un día sin contestar es una alerta alta", () => {
    const a = alertaProspectos([{ negocio: "Tacos El Güero", estado: "NUEVO", creado_en: hace(30) }], AHORA);
    expect(a).toMatchObject({ severidad: "alta", tipo: "Prospecto sin contactar", href: "/prospectos?estado=NUEVO" });
    expect(a?.titulo).toBe("1 prospecto sin contactar");
    expect(a?.detalle).toContain("Tacos El Güero");
    expect(a?.detalle).toContain("hace 1 día");
  });

  it("varios se juntan en una sola alerta, con el más viejo como referencia", () => {
    const a = alertaProspectos([
      { negocio: "A", estado: "NUEVO", creado_en: hace(26) },
      { negocio: "B", estado: "NUEVO", creado_en: hace(100) },
      { negocio: "C", estado: "NUEVO", creado_en: hace(2) },
      { negocio: "D", estado: "NUEVO", creado_en: hace(50) },
      { negocio: "E", estado: "NUEVO", creado_en: hace(49) },
    ], AHORA);
    expect(a?.titulo).toBe("4 prospectos sin contactar");
    // Los tres más viejos por nombre, el resto contado.
    expect(a?.detalle).toContain("B, D, E y 1 más");
    expect(a?.detalle).toContain("hace 4 días");
  });

  it("tres días sin contestar ya es crítica", () => {
    expect(alertaProspectos([{ negocio: "A", estado: "NUEVO", creado_en: hace(73) }], AHORA)?.severidad).toBe("critica");
  });

  it("una fecha ilegible no revienta ni cuenta", () => {
    expect(alertaProspectos([{ negocio: "A", estado: "NUEVO", creado_en: "ayer" }], AHORA)).toBeNull();
  });
});

describe("prefijoNuevoCliente", () => {
  it("lleva al formulario el negocio, la persona, el teléfono y el giro", () => {
    expect(prefijoNuevoCliente({ nombre: "Ana López", negocio: "Tacos El Güero", whatsapp: "4771234567", giro: "FOODTRUCK", cajas: 1, sucursales: 1 })).toEqual({
      nombre_comercial: "Tacos El Güero", nombre_owner: "Ana López", telefono_owner: "4771234567", vertical: "FOODTRUCK", plan_codigo: "ESENCIAL",
    });
  });

  it("sugiere el plan por tamaño, igual que el correo de aviso", () => {
    const base = { nombre: "Ana", negocio: "X y Z", whatsapp: "4771234567", giro: null };
    expect(prefijoNuevoCliente({ ...base, cajas: 3, sucursales: 1 }).plan_codigo).toBe("NEGOCIO");
    expect(prefijoNuevoCliente({ ...base, cajas: 1, sucursales: 2 }).plan_codigo).toBe("CADENA");
    // Sin giro se queda el del formulario.
    expect(prefijoNuevoCliente({ ...base, cajas: 1, sucursales: 1 }).vertical).toBeNull();
  });
});
