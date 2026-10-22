import { describe, it, expect, vi } from "vitest";
import { abrirSesionDelEnlace, leerEnlace } from "../enlace-acceso";

const ENLACE = "http://localhost:3001/establecer-acceso#access_token=tok-diego&expires_in=3600&refresh_token=ref-diego&token_type=bearer&type=recovery";

/** Un cliente con la sesión del dueño abierta; setSession la cambia por la que le pasen. */
function clienteConDueno(falla = false) {
  let actual = { user: { email: "dueno@knockout.dev" } };
  const getSession = vi.fn(async () => ({ data: { session: actual } }));
  const setSession = vi.fn(async (t: { access_token: string; refresh_token: string }) => {
    if (falla) return { data: { session: null }, error: new Error("Invalid Refresh Token") };
    actual = { user: { email: t.access_token === "tok-diego" ? "diego@knockout.dev" : "?" } };
    return { data: { session: actual }, error: null };
  });
  return { getSession, setSession, actual: () => actual };
}

describe("enlace de /establecer-acceso", () => {
  it("lee la sesión del hash", () => {
    expect(leerEnlace(ENLACE)).toEqual({ tipo: "sesion", access_token: "tok-diego", refresh_token: "ref-diego" });
  });

  it("sin enlace en la URL no hay nada que abrir (se queda la sesión de siempre)", () => {
    expect(leerEnlace("http://localhost:3001/establecer-acceso")).toBeNull();
  });

  it("un enlace vencido o un code de PKCE es inválido", () => {
    expect(leerEnlace("http://x/establecer-acceso#error=access_denied&error_description=Email+link+is+invalid+or+has+expired"))
      .toEqual({ tipo: "error", mensaje: "Email link is invalid or has expired" });
    expect(leerEnlace("http://x/establecer-acceso?code=abc")?.tipo).toBe("error");
  });

  it("sesión del dueño abierta + enlace de Diego → manda la del enlace", async () => {
    const auth = clienteConDueno();
    const correo = await abrirSesionDelEnlace(auth, leerEnlace(ENLACE)!);
    expect(correo).toBe("diego@knockout.dev");
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "tok-diego", refresh_token: "ref-diego" });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.actual().user.email).toBe("diego@knockout.dev");
  });

  it("si la sesión del enlace no abre, no cae a la del dueño", async () => {
    const auth = clienteConDueno(true);
    expect(await abrirSesionDelEnlace(auth, leerEnlace(ENLACE)!)).toBeNull();
    expect(await abrirSesionDelEnlace(auth, { tipo: "error", mensaje: "x" })).toBeNull();
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});
