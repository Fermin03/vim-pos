import { describe, expect, it } from "vitest";
import { enlaceAcceso, estadoOperador, motivoValido, validarInvitacion } from "../operadores";

describe("estadoOperador", () => {
  it("invitado sin segundo factor = pendiente; con él = activo", () => {
    expect(estadoOperador({ activo: true, activado_at: null })).toBe("PENDIENTE");
    expect(estadoOperador({ activo: true, activado_at: "2026-09-30T10:00:00Z" })).toBe("ACTIVO");
  });
  it("desactivado manda sobre lo demás", () => {
    expect(estadoOperador({ activo: false, activado_at: "2026-09-30T10:00:00Z" })).toBe("DESACTIVADO");
    expect(estadoOperador({ activo: false, activado_at: null })).toBe("DESACTIVADO");
  });
});

describe("validarInvitacion", () => {
  it("normaliza el correo y recorta el nombre", () => {
    expect(validarInvitacion("  Fermín ", " Fermin+Panel@Ejemplo.MX ")).toEqual({ ok: true, nombre: "Fermín", email: "fermin+panel@ejemplo.mx" });
  });
  it("rechaza nombre corto o correo sin forma de correo", () => {
    expect(validarInvitacion("F", "a@b.mx").ok).toBe(false);
    expect(validarInvitacion("Fermín", "sin-arroba").ok).toBe(false);
    expect(validarInvitacion("Fermín", "a@b").ok).toBe(false);
  });
});

describe("motivoValido", () => {
  it("pide 10 caracteres o más, sin contar espacios de las orillas", () => {
    expect(motivoValido("   corto   ")).toBeNull();
    expect(motivoValido("  perdió su teléfono ")).toBe("perdió su teléfono");
  });
});

describe("enlaceAcceso", () => {
  it("el token va en el fragmento, no en la query (no llega a ningún log de servidor)", () => {
    const url = enlaceAcceso("https://platform.vimpos.com.mx/", "abc+/=", "invite");
    expect(url).toBe("https://platform.vimpos.com.mx/acceso#token=abc%2B%2F%3D&tipo=invite");
    expect(new URL(url).search).toBe("");
  });
});
