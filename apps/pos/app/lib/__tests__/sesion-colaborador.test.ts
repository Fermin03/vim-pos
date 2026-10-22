import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  LLAVE_SESION_COLABORADOR, MENSAJE_CREDENCIALES, clienteColaborador, MENSAJE_SIN_AGENDA, enlaceRecuperar, mensajeEntrada, validarEntrada,
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
  it("cada sesión en su llave: el cliente del colaborador no lee la del dispositivo ni al revés", async () => {
    const { deviceClient } = await import("../supabase");
    const llave = (c: unknown) => (c as { auth: { storageKey: string } }).auth.storageKey;
    expect(llave(deviceClient)).toBe("vimpos.device.session");
    expect(llave(clienteColaborador())).toBe(LLAVE_SESION_COLABORADOR);
    expect(clienteColaborador()).not.toBe(deviceClient);
  });

  it("solo /mi-agenda usa la sesión del colaborador; la caja, el PIN y el dispositivo no la tocan", () => {
    const app = path.resolve(__dirname, "../..");
    const usan: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") recorrer(p); continue; }
        if (/\.tsx?$/.test(e.name) && readFileSync(p, "utf8").includes("sesion-colaborador")) usan.push(path.relative(app, p).split(path.sep).join("/"));
      }
    };
    recorrer(app);
    expect(usan.sort()).toEqual(["mi-agenda/entrada.tsx", "mi-agenda/page.tsx"]);
    // Y ella no importa nada de la caja (credenciales del dispositivo, PIN, cliente del empleado).
    const src = readFileSync(path.join(app, "lib/sesion-colaborador.ts"), "utf8");
    expect(src).not.toMatch(/from ".\/(supabase|device-creds|autorizacion)"/);
  });
});
