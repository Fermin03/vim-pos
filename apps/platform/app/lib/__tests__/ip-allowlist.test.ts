import { describe, it, expect } from "vitest";
import { coincide, permitida } from "../ip-allowlist";

// Direcciones reales del entorno de VIM, que son las que hay que proteger sin bloquear.
const IPV4 = "189.203.137.208";
const IPV6 = "2806:2f0:6001:ed67:e8b0:5c86:7cf2:4cbe";
const IPV6_OTRO_DIA = "2806:2f0:6001:ed67:1a2b:3c4d:5e6f:7a8b"; // mismo /64, sufijo rotado

describe("permitida", () => {
  it("una lista vacía NO bloquea: es el estado por defecto del panel", () => {
    expect(permitida(IPV4, "")).toBe(true);
    expect(permitida(IPV4, undefined)).toBe(true);
    expect(permitida(IPV4, "   ,  ")).toBe(true);
  });

  it("deja pasar la IP anotada y rechaza cualquier otra", () => {
    expect(permitida(IPV4, IPV4)).toBe(true);
    expect(permitida("8.8.8.8", IPV4)).toBe(false);
  });

  it("acepta varias entradas separadas por coma", () => {
    expect(permitida("8.8.8.8", `${IPV4}, 8.8.8.8`)).toBe(true);
  });
});

describe("prefijos CIDR — la razón de existir de este módulo", () => {
  it("un /64 sigue reconociendo la IPv6 aunque el sufijo rote al día siguiente", () => {
    const lista = "2806:2f0:6001:ed67::/64";
    expect(permitida(IPV6, lista)).toBe(true);
    expect(permitida(IPV6_OTRO_DIA, lista)).toBe(true);
  });

  it("otra red IPv6 no entra por el mismo /64", () => {
    expect(permitida("2806:2f0:6001:ffff:1:2:3:4", "2806:2f0:6001:ed67::/64")).toBe(false);
  });

  it("los prefijos IPv4 también funcionan", () => {
    expect(permitida("189.203.137.1", "189.203.137.0/24")).toBe(true);
    expect(permitida("189.203.138.1", "189.203.137.0/24")).toBe(false);
  });

  it("respeta prefijos que no caen en frontera de byte", () => {
    // /30 cubre .0–.3 y /31 solo .0–.1
    expect(coincide("10.0.0.2", "10.0.0.0/30")).toBe(true);
    expect(coincide("10.0.0.5", "10.0.0.0/30")).toBe(false);
    expect(coincide("10.0.0.1", "10.0.0.0/31")).toBe(true);
    expect(coincide("10.0.0.2", "10.0.0.0/31")).toBe(false);
  });
});

describe("no da acceso de más ante entradas raras", () => {
  it("no mezcla familias: una IPv4 no cae en un prefijo IPv6 ni al revés", () => {
    expect(permitida(IPV4, "::/0")).toBe(false);
    expect(permitida(IPV6, "0.0.0.0/0")).toBe(false);
  });

  it("una entrada basura no deja pasar a nadie", () => {
    expect(permitida(IPV4, "no-es-una-ip")).toBe(false);
    expect(permitida(IPV4, "189.203.137.208/999")).toBe(false);
    expect(permitida(IPV4, "999.999.999.999")).toBe(false);
  });

  it("una IP entrante ilegible se rechaza", () => {
    expect(permitida("desconocida", IPV4)).toBe(false);
    expect(permitida("", IPV4)).toBe(false);
  });

  it("entiende IPv6 abreviada y con IPv4 embebido", () => {
    expect(coincide("::1", "::1")).toBe(true);
    expect(coincide("2806:2f0::1", "2806:2f0::/32")).toBe(true);
    expect(coincide("::ffff:189.203.137.208", "::ffff:189.203.137.208")).toBe(true);
  });

  it("ignora los corchetes que a veces trae una IPv6", () => {
    expect(coincide(`[${IPV6}]`, "2806:2f0:6001:ed67::/64")).toBe(true);
  });
});
