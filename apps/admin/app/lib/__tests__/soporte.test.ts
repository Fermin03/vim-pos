import { describe, expect, it } from "vitest";
import {
  WHATSAPP_SOPORTE_VIM,
  enlaceWhatsapp,
  mensajeAyudaAdmin,
  mensajeAyudaCaja,
  normalizarWhatsapp,
  soporteConRespaldo,
  soporteDe,
  textoHorario,
  whatsappLegible,
  whatsappValido,
} from "@vim/db/soporte";
import { errorDeRegistro, telefonoMx10 } from "@vim/db/registro";

describe("WhatsApp de soporte (0142)", () => {
  it("el de fábrica es el número oficial de VIM", () => {
    expect(WHATSAPP_SOPORTE_VIM).toBe("525665083346");
    expect(whatsappLegible(WHATSAPP_SOPORTE_VIM)).toBe("+52 56 6508 3346");
  });

  it("valida como el CHECK de la base: 10 a 15 dígitos, nada más", () => {
    expect(whatsappValido("525665083346")).toBe(true);
    expect(whatsappValido("4771234567")).toBe(true);
    expect(whatsappValido("123456789")).toBe(false);          // 9
    expect(whatsappValido("1234567890123456")).toBe(false);   // 16
    expect(whatsappValido("52 477 123 4567")).toBe(false);    // sin normalizar
    expect(whatsappValido(null)).toBe(false);
  });

  it("normaliza lo que la gente copia de su teléfono", () => {
    expect(normalizarWhatsapp("+52 (56) 6508-3346")).toBe("525665083346");
    expect(whatsappValido(normalizarWhatsapp("+52 56 6508 3346"))).toBe(true);
  });

  it("arma el wa.me con el texto codificado, o null si el número no sirve", () => {
    expect(enlaceWhatsapp("525665083346", "Hola, ¿me ayudan?")).toBe(
      "https://wa.me/525665083346?text=Hola%2C%20%C2%BFme%20ayudan%3F",
    );
    expect(enlaceWhatsapp("+52 56 6508 3346", "x")).toBe("https://wa.me/525665083346?text=x");
    expect(enlaceWhatsapp("", "x")).toBeNull();
    expect(enlaceWhatsapp(undefined, "x")).toBeNull();
  });

  it("un & o un # en el nombre del negocio no rompe el enlace", () => {
    const url = enlaceWhatsapp("525665083346", mensajeAyudaAdmin({ usuario: "Ana", negocio: "Tacos & Más #1", codigo: "tacos" }))!;
    const texto = new URL(url).searchParams.get("text");
    expect(texto).toBe("Hola, soy Ana de Tacos & Más #1 (tacos). Necesito ayuda con VIM POS.");
  });
});

describe("soporte vigente con respaldo", () => {
  it("lee la fila de la RPC o de las directivas", () => {
    expect(soporteDe({ whatsapp: "5214771234567", horario: "9:00 a 18:00", correo: null })).toEqual({
      whatsapp: "5214771234567", horario: "9:00 a 18:00", correo: null,
    });
    expect(soporteDe({ whatsapp: "52 477 123 4567", horario: "  " })).toEqual({ whatsapp: "524771234567", horario: null, correo: null });
  });

  it("descarta lo que no trae un WhatsApp usable", () => {
    expect(soporteDe(null)).toBeNull();
    expect(soporteDe({})).toBeNull();
    expect(soporteDe({ whatsapp: "123" })).toBeNull();
    expect(soporteDe("525665083346")).toBeNull();
  });

  it("usa el primero que sirva y, si ninguno, el de fábrica", () => {
    expect(soporteConRespaldo(null, { whatsapp: "5215555555555" }).whatsapp).toBe("5215555555555");
    expect(soporteConRespaldo(undefined, { whatsapp: "x" }).whatsapp).toBe(WHATSAPP_SOPORTE_VIM);
    expect(textoHorario(soporteConRespaldo())).toBe("Atendemos de 9:00 a 18:00");
    expect(textoHorario({ whatsapp: "525665083346", horario: null, correo: null })).toBeNull();
  });
});

describe("mensajes ya escritos", () => {
  it("admin: quién, negocio y código", () => {
    expect(mensajeAyudaAdmin({ usuario: "Fermín", negocio: "Knock-Out Burger", codigo: "knock-out" })).toBe(
      "Hola, soy Fermín de Knock-Out Burger (knock-out). Necesito ayuda con VIM POS.",
    );
    expect(mensajeAyudaAdmin({ negocio: "Knock-Out Burger" })).toBe("Hola, escribo de Knock-Out Burger. Necesito ayuda con VIM POS.");
    expect(mensajeAyudaAdmin({})).toBe("Hola. Necesito ayuda con VIM POS.");
  });

  it("caja: sucursal, caja y versión, sin guiones de relleno", () => {
    expect(mensajeAyudaCaja({ negocio: "Knock-Out", sucursal: "Centro", caja: "Caja 1", version: "0.4.99" })).toBe(
      "Hola, escribo de Knock-Out (Centro · Caja 1 · VIM POS 0.4.99). Necesito ayuda con VIM POS.",
    );
    expect(mensajeAyudaCaja({ cajero: "Luis", negocio: "Knock-Out", sucursal: "—", caja: "Caja 1" })).toBe(
      "Hola, soy Luis de Knock-Out (Caja 1). Necesito ayuda con VIM POS.",
    );
    expect(mensajeAyudaCaja({})).toBe("Hola. Necesito ayuda con VIM POS.");
  });
});

describe("registro público: contacto obligatorio", () => {
  const ok = {
    nombre_owner: "Ana López", telefono_owner: "477 123 4567", email_owner: "Ana@Negocio.mx",
    ciudad: "León", password: "12345678", acepta_terminos: true,
  };

  it("el teléfono queda en 10 dígitos", () => {
    expect(telefonoMx10("477 123 4567")).toBe("4771234567");
    expect(telefonoMx10("+52 477 123 4567")).toBe("4771234567");
    expect(telefonoMx10("521 477 123 4567")).toBe("4771234567");
    expect(telefonoMx10("123 4567")).toBeNull();
  });

  it("pasa con todo y pide cada dato que falta", () => {
    expect(errorDeRegistro(ok)).toBeNull();
    expect(errorDeRegistro({ ...ok, acepta_terminos: false })).toMatch(/acepta los términos/);
    expect(errorDeRegistro({ ...ok, telefono_owner: "12345" })).toMatch(/10 dígitos/);
    expect(errorDeRegistro({ ...ok, ciudad: " " })).toMatch(/ciudad/);
    expect(errorDeRegistro({ ...ok, email_owner: "ana@" })).toMatch(/correo/);
    expect(errorDeRegistro({ ...ok, nombre_owner: "" })).toMatch(/nombre/);
  });
});
