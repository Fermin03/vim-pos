// Se prueba contra un certificado de verdad, no contra bytes inventados: el valor de este módulo
// es leer los .cer que emite el SAT, y un fixture sintético no probaría eso.
//
// El fixture es el certificado PÚBLICO de pruebas que el propio SAT publica (RFC EKU9003173C9).
// Su llave privada NO está aquí ni en ningún otro sitio del repositorio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerCertificado, esDelRfc, estaVigente, CertificadoIlegible } from "./certificado.ts";

const cer = readFileSync(new URL("./__fixtures__/csd-pruebas-eku.cer.base64", import.meta.url), "utf8");

test("lee el número de certificado del SAT", () => {
  // Comprobado contra el sello cargado en el sandbox de Facturama.
  assert.equal(leerCertificado(cer).numeroCertificado, "30001000000500003416");
});

test("lee la vigencia y coincide con la que reporta el PAC", () => {
  const d = leerCertificado(cer);
  assert.equal(d.vigenciaHasta, "2027-05-18");
  assert.match(d.vigenciaDesde, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(d.vigenciaDesde < d.vigenciaHasta);
});

test("encuentra el RFC del contribuyente dentro del certificado", () => {
  const d = leerCertificado(cer);
  assert.ok(esDelRfc(d, "EKU9003173C9"), `RFCs hallados: ${d.rfcs.join(", ")}`);
});

test("no confunde el certificado con el de otro negocio", () => {
  // El caso que esto previene: subir por error el sello de otro cliente y timbrarle sus facturas.
  assert.equal(esDelRfc(leerCertificado(cer), "EWE1709045U0"), false);
});

test("acepta el RFC en minúsculas o con espacios", () => {
  assert.ok(esDelRfc(leerCertificado(cer), " eku9003173c9 "));
});

test("sabe si el certificado sigue vigente", () => {
  const d = leerCertificado(cer);
  assert.equal(estaVigente(d, new Date("2026-08-24")), true);
  assert.equal(estaVigente(d, new Date("2030-01-01")), false);
  assert.equal(estaVigente(d, new Date("2000-01-01")), false);
});

test("rechaza un archivo que no es un certificado", () => {
  assert.throws(() => leerCertificado(btoa("esto es un pdf cualquiera")), CertificadoIlegible);
  assert.throws(() => leerCertificado("no-es-base64-@@@"), CertificadoIlegible);
});

test("rechaza un .cer truncado en vez de inventarse los datos", () => {
  // Media carga o un archivo corrupto no deben producir una vigencia plausible pero falsa.
  assert.throws(() => leerCertificado(cer.slice(0, 200)), CertificadoIlegible);
});
