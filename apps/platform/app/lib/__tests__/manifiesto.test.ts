import { describe, it, expect } from "vitest";
import { validarManifiesto } from "../manifiesto";

const HOST = "github.com";
const bueno = JSON.stringify({
  version: "0.4.62",
  url: "https://github.com/Fermin03/vim-pos/releases/download/v0.4.62/VIM.POS.Setup.0.4.62.exe",
  sha512: "a".repeat(128),
  notas: "Notas con acentos: versión y configuración.",
  fecha: "2026-09-06",
});

describe("validarManifiesto", () => {
  it("acepta un manifiesto correcto", () => {
    const r = validarManifiesto(bueno, HOST);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifiesto.version).toBe("0.4.62");
  });

  it("rechaza lo que no es JSON", () => {
    expect(validarManifiesto("{no es json", HOST).ok).toBe(false);
  });

  it("exige versión de tres números", () => {
    expect(validarManifiesto(bueno.replace('"0.4.62"', '"0.4"'), HOST).ok).toBe(false);
    expect(validarManifiesto(bueno.replace('"version":"0.4.62"', '"version":"v0.4.62"'), HOST).ok).toBe(false);
  });

  it("exige sha512 de 128 hex: sin él no se instala nada verificable", () => {
    expect(validarManifiesto(bueno.replace("a".repeat(128), "abc"), HOST).ok).toBe(false);
    expect(validarManifiesto(bueno.replace("a".repeat(128), "z".repeat(128)), HOST).ok).toBe(false);
  });

  it("rechaza una url fuera del host de releases", () => {
    const r = validarManifiesto(bueno.replace("github.com", "ejemplo.com"), HOST);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/host|dominio/i);
  });

  it("rechaza una url que no es https", () => {
    expect(validarManifiesto(bueno.replace("https://", "http://"), HOST).ok).toBe(false);
  });

  it("exige que la url contenga la versión: pegar el manifiesto de otra compilación es el error fácil", () => {
    const cruzado = bueno.replace("v0.4.62/VIM.POS.Setup.0.4.62.exe", "v0.4.61/VIM.POS.Setup.0.4.61.exe");
    const r = validarManifiesto(cruzado, HOST);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/versión/i);
  });

  it("conserva los acentos de las notas", () => {
    const r = validarManifiesto(bueno, HOST);
    if (r.ok) expect(r.manifiesto.notas).toContain("versión");
  });

  it("la fecha es opcional pero si viene debe ser una fecha", () => {
    const sinFecha = JSON.stringify({ ...JSON.parse(bueno), fecha: undefined });
    expect(validarManifiesto(sinFecha, HOST).ok).toBe(true);
    expect(validarManifiesto(bueno.replace("2026-09-06", "ayer"), HOST).ok).toBe(false);
  });
});
