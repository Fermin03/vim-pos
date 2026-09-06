import { describe, it, expect } from "vitest";
import { validarManifiesto } from "../manifiesto";

const PREFIJO = "https://github.com/Fermin03/vim-pos/releases/download/";
const bueno = JSON.stringify({
  version: "0.4.62",
  url: "https://github.com/Fermin03/vim-pos/releases/download/v0.4.62/VIM.POS.Setup.0.4.62.exe",
  sha512: "a".repeat(128),
  notas: "Notas con acentos: versión y configuración.",
  fecha: "2026-09-06",
});

describe("validarManifiesto", () => {
  it("acepta un manifiesto correcto", () => {
    const r = validarManifiesto(bueno, PREFIJO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifiesto.version).toBe("0.4.62");
  });

  it("rechaza lo que no es JSON", () => {
    expect(validarManifiesto("{no es json", PREFIJO).ok).toBe(false);
  });

  it("exige versión de tres números", () => {
    expect(validarManifiesto(bueno.replace('"0.4.62"', '"0.4"'), PREFIJO).ok).toBe(false);
    expect(validarManifiesto(bueno.replace('"version":"0.4.62"', '"version":"v0.4.62"'), PREFIJO).ok).toBe(false);
  });

  it("exige sha512 de 128 hex: sin él no se instala nada verificable", () => {
    expect(validarManifiesto(bueno.replace("a".repeat(128), "abc"), PREFIJO).ok).toBe(false);
    expect(validarManifiesto(bueno.replace("a".repeat(128), "z".repeat(128)), PREFIJO).ok).toBe(false);
  });

  it("rechaza una url fuera del prefijo de releases", () => {
    const r = validarManifiesto(bueno.replace("github.com", "ejemplo.com"), PREFIJO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empezar por/i);
  });

  it("en github.com publica cualquiera: otro repo NO vale", () => {
    // Comprobar solo el host dejaría pasar esto, y publicaría el binario de un desconocido a
    // todas las cajas de todos los clientes a la vez.
    const ajeno = bueno.replace("Fermin03/vim-pos", "un-desconocido/vim-pos");
    expect(validarManifiesto(ajeno, PREFIJO).ok).toBe(false);
  });

  it("un host disfrazado con @ no cuela: se compara la url ya normalizada", () => {
    const disfraz = bueno.replace("https://github.com/", "https://github.com@otro-sitio.mx/");
    expect(validarManifiesto(disfraz, PREFIJO).ok).toBe(false);
  });

  it("rechaza una url que no es https", () => {
    expect(validarManifiesto(bueno.replace("https://", "http://"), PREFIJO).ok).toBe(false);
  });

  it("exige que la url contenga la versión: pegar el manifiesto de otra compilación es el error fácil", () => {
    const cruzado = bueno.replace("v0.4.62/VIM.POS.Setup.0.4.62.exe", "v0.4.61/VIM.POS.Setup.0.4.61.exe");
    const r = validarManifiesto(cruzado, PREFIJO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/versión/i);
  });

  it("conserva los acentos de las notas", () => {
    const r = validarManifiesto(bueno, PREFIJO);
    if (r.ok) expect(r.manifiesto.notas).toContain("versión");
  });

  it("la fecha es opcional pero si viene debe ser una fecha", () => {
    const sinFecha = JSON.stringify({ ...JSON.parse(bueno), fecha: undefined });
    expect(validarManifiesto(sinFecha, PREFIJO).ok).toBe(true);
    expect(validarManifiesto(bueno.replace("2026-09-06", "ayer"), PREFIJO).ok).toBe(false);
  });
});
