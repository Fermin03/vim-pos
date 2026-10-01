import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mensajeAFirmar, validarManifiesto as validarConLlave } from "../manifiesto";
import { LLAVE_PUBLICA_ACTUALIZACIONES } from "../llave-actualizaciones";

// Un par de llaves de prueba: la privada real no está (ni debe estar) en el repo.
const par = generateKeyPairSync("ed25519");
const LLAVE_PRUEBA = par.publicKey.export({ type: "spki", format: "pem" }).toString();
const firmar = (m: { version: string; url: string; sha512: string }, llave = par.privateKey) =>
  sign(null, Buffer.from(mensajeAFirmar(m), "utf8"), llave).toString("base64");
const validarManifiesto = (texto: string, prefijo: string) => validarConLlave(texto, prefijo, LLAVE_PRUEBA);

const PREFIJO = "https://github.com/Fermin03/vim-pos-descargas/releases/download/";
const DATOS = {
  version: "0.4.62",
  url: "https://github.com/Fermin03/vim-pos-descargas/releases/download/v0.4.62/VIM.POS.Setup.0.4.62.exe",
  sha512: "a".repeat(128),
};
const bueno = JSON.stringify({
  ...DATOS,
  notas: "Notas con acentos: versión y configuración.",
  fecha: "2026-09-06",
  firma: firmar(DATOS),
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
    const ajeno = bueno.replace("Fermin03/vim-pos-descargas", "un-desconocido/vim-pos-descargas");
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

describe("firma del manifiesto", () => {
  it("la conserva tal cual para que llegue al bucket", () => {
    const r = validarManifiesto(bueno, PREFIJO);
    expect(r.ok && r.manifiesto.firma).toBe(JSON.parse(bueno).firma);
  });

  it("rechaza un manifiesto sin firma: las cajas no lo instalarían", () => {
    const { firma: _f, ...sinFirma } = JSON.parse(bueno);
    const r = validarManifiesto(JSON.stringify(sinFirma), PREFIJO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no trae firma");
  });

  it("rechaza si la url o el sha512 cambiaron después de firmar", () => {
    const otroSha = { ...JSON.parse(bueno), sha512: "b".repeat(128) };
    expect(validarManifiesto(JSON.stringify(otroSha), PREFIJO).ok).toBe(false);
    const otraUrl = { ...JSON.parse(bueno), url: DATOS.url.replace("VIM.POS", "VIM.POS.X") };
    expect(validarManifiesto(JSON.stringify(otraUrl), PREFIJO).ok).toBe(false);
  });

  it("rechaza una firma hecha con otra llave", () => {
    const ajena = generateKeyPairSync("ed25519").privateKey;
    const m = { ...JSON.parse(bueno), firma: firmar(DATOS, ajena) };
    expect(validarManifiesto(JSON.stringify(m), PREFIJO).ok).toBe(false);
  });

  it("por omisión usa la llave real, y es la misma que llevan las cajas", () => {
    // Firmado con la llave de prueba → contra la llave real debe fallar.
    expect(validarConLlave(bueno, PREFIJO).ok).toBe(false);
    const updater = readFileSync(path.resolve(__dirname, "../../../../../desktop/src/updater.mjs"), "utf8");
    const enCaja = updater.match(/-----BEGIN PUBLIC KEY-----[^`]*?-----END PUBLIC KEY-----/)?.[0];
    // Git puede dejar el archivo con CRLF en Windows: se compara sin los retornos de carro.
    const sinCr = (t: string | undefined) => t?.split(String.fromCharCode(13)).join("").trim();
    expect(sinCr(enCaja)).toBe(sinCr(LLAVE_PUBLICA_ACTUALIZACIONES));
  });
});
