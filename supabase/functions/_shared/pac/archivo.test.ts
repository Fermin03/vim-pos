import test from "node:test";
import assert from "node:assert/strict";
import { archivarCfdi, base64ABytes, bytesABase64, partirRutaLogica, rutaArchivoCfdi, type Subidor } from "./archivo.ts";

test("rutas: coinciden con lo que ya guarda tickets_cfdi (cfdi/<id>.xml)", () => {
  assert.deepEqual(rutaArchivoCfdi("abc", "xml"), { bucket: "cfdi", nombre: "abc.xml", contentType: "application/xml", rutaLogica: "cfdi/abc.xml" });
  assert.equal(rutaArchivoCfdi("abc", "pdf").contentType, "application/pdf");
  assert.equal(rutaArchivoCfdi("abc", "acuse").rutaLogica, "cfdi/abc-acuse.xml");
  assert.deepEqual(partirRutaLogica("cfdi/abc.pdf"), { bucket: "cfdi", nombre: "abc.pdf" });
  assert.equal(partirRutaLogica(null), null);
  assert.equal(partirRutaLogica("sinbarra"), null);
  assert.equal(partirRutaLogica("cfdi/"), null);
});

test("base64 ida y vuelta, incluso grande (más de un bloque)", () => {
  const bytes = new Uint8Array(70_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
  const b64 = bytesABase64(bytes);
  assert.deepEqual(base64ABytes(b64), bytes);
  assert.equal(new TextDecoder().decode(base64ABytes(btoa("<cfdi/>"))), "<cfdi/>");
});

test("archivar: sube lo que viene, ignora lo que falta y no lanza si algo falla", async () => {
  const subidas: string[] = [];
  const subir: Subidor = async (bucket, nombre, bytes, ct) => {
    subidas.push(`${bucket}/${nombre} ${ct} ${bytes.length}B`);
    return nombre.endsWith(".pdf") ? "bucket lleno" : null;
  };
  const r = await archivarCfdi("id1", { xml: btoa("<x/>"), pdf: btoa("%PDF"), acuse: null }, subir);
  assert.deepEqual(r.guardados, ["xml"]);
  assert.deepEqual(r.errores, ["pdf: bucket lleno"]);
  assert.deepEqual(subidas, ["cfdi/id1.xml application/xml 4B", "cfdi/id1.pdf application/pdf 4B"]);
});

test("archivar: una excepción del subidor se convierte en error, no en caída", async () => {
  const r = await archivarCfdi("id2", { xml: btoa("<x/>") }, async () => { throw new Error("red caída"); });
  assert.deepEqual(r.guardados, []);
  assert.deepEqual(r.errores, ["xml: red caída"]);
});
