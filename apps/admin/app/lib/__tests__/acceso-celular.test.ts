import { describe, it, expect } from "vitest";
import { botonAcceso, destinoEnlace, enlaceMiAgenda } from "../acceso-celular";

describe("enlaces del acceso al celular", () => {
  it("el correo aterriza en la página que pone la contraseña, en el mismo admin", () => {
    expect(destinoEnlace("https://admin.vimpos.com.mx")).toBe("https://admin.vimpos.com.mx/establecer-acceso");
    expect(destinoEnlace("http://localhost:3001")).toBe("http://localhost:3001/establecer-acceso");
  });

  it("la agenda vive en el POS: producción, o el puerto del POS en desarrollo", () => {
    expect(enlaceMiAgenda("admin.vimpos.com.mx")).toBe("https://pos.vimpos.com.mx/mi-agenda");
    expect(enlaceMiAgenda("localhost")).toBe("http://localhost:3000/mi-agenda");
    expect(enlaceMiAgenda("127.0.0.1")).toBe("http://localhost:3000/mi-agenda");
  });
});

describe("botón «Dar acceso a su celular»", () => {
  const acceso = { email: "diego@knockout.dev", ultimoAcceso: null };

  it("un colaborador inactivo no lo tiene", () => {
    expect(botonAcceso(false, acceso, false)).toEqual({ visible: false });
  });

  it("activo y con cuenta: habilitado, y avisa que aún no entra", () => {
    expect(botonAcceso(true, acceso, false)).toEqual({ visible: true, habilitado: true, texto: "Dar acceso a su celular", ultimo: "Aún no ha entrado" });
  });

  it("tras mandarlo se apaga y dice a quién", () => {
    const b = botonAcceso(true, acceso, true);
    expect(b).toMatchObject({ habilitado: false, texto: "Correo enviado a diego@knockout.dev" });
  });

  it("muestra el último acceso en hora de México", () => {
    const b = botonAcceso(true, { ...acceso, ultimoAcceso: "2026-10-20T01:30:00Z" }, false);
    expect(b.visible && b.ultimo).toMatch(/^Último acceso: 19 oct/);
  });

  it("sin cuenta con correo no hay a quién mandarlo", () => {
    expect(botonAcceso(true, undefined, false)).toMatchObject({ habilitado: false, ultimo: "Su cuenta no tiene correo" });
  });
});
