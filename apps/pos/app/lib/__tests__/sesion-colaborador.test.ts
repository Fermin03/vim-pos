import { describe, it, expect } from "vitest";
import {
  LLAVE_SESION_COLABORADOR, MENSAJE_CREDENCIALES, MENSAJE_SIN_AGENDA, enlaceRecuperar, mensajeEntrada, validarEntrada,
} from "../sesion-colaborador";

describe("entrada de /mi-agenda", () => {
  it("pide correo válido y contraseña antes de ir a la red", () => {
    expect(validarEntrada("diego", "x")).toBe("Escribe un correo válido");
    expect(validarEntrada(" diego@knockout.dev ", "")).toBe("Escribe tu contraseña");
    expect(validarEntrada("diego@knockout.dev", "secreta1")).toBeNull();
  });

  it("credenciales malas: un solo mensaje, sin decir cuál falló", () => {
    expect(mensajeEntrada(new Error("Invalid login credentials"))).toBe(MENSAJE_CREDENCIALES);
    expect(MENSAJE_CREDENCIALES).toBe("Correo o contraseña incorrectos");
  });

  it("una cuenta sin agenda (SIN_AGENDA de mi_agenda) recibe el aviso", () => {
    expect(mensajeEntrada(new Error("SIN_AGENDA: Esta cuenta no tiene agenda."))).toBe(MENSAJE_SIN_AGENDA);
    expect(MENSAJE_SIN_AGENDA).toBe("Esta cuenta no tiene agenda. Pídele acceso al negocio.");
  });

  it("sin red o con un error raro no enseña inglés", () => {
    expect(mensajeEntrada(new TypeError("Failed to fetch"))).toMatch(/conexión/);
    expect(mensajeEntrada(new Error("Database error querying schema"))).toBe("No se pudo entrar. Inténtalo de nuevo.");
  });

  it("«Olvidé mi contraseña» usa la recuperación del admin", () => {
    expect(enlaceRecuperar("pos.vimpos.com.mx")).toBe("https://admin.vimpos.com.mx/recuperar");
    expect(enlaceRecuperar("localhost")).toBe("http://localhost:3001/recuperar");
  });
});

describe("la caja no se ve afectada", () => {
  it("la sesión del colaborador se guarda aparte de la del dispositivo", () => {
    expect(LLAVE_SESION_COLABORADOR).not.toBe("vimpos.device.session");
  });
});
