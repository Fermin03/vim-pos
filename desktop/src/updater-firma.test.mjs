// La firma del manifiesto de actualización (activada en 0.4.103).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { LLAVE_PUBLICA_ACTUALIZACIONES, firmaValida, mensajeAFirmar } from "./updater.mjs";

const M = { version: "0.4.103", url: "https://github.com/Fermin03/vim-pos-descargas/releases/download/v0.4.103/VIM.POS.Setup.0.4.103.exe", sha512: "a".repeat(128) };

test("la llave pública de las cajas es una llave Ed25519 válida", () => {
  const llave = crypto.createPublicKey(LLAVE_PUBLICA_ACTUALIZACIONES);
  assert.equal(llave.asymmetricKeyType, "ed25519");
});

test("un manifiesto sin firma, o firmado con otra llave, no pasa", () => {
  assert.equal(firmaValida(M, LLAVE_PUBLICA_ACTUALIZACIONES), false);
  const ajena = crypto.generateKeyPairSync("ed25519").privateKey;
  const firma = crypto.sign(null, Buffer.from(mensajeAFirmar(M), "utf8"), ajena).toString("base64");
  assert.equal(firmaValida({ ...M, firma }, LLAVE_PUBLICA_ACTUALIZACIONES), false);
});

test("la firma cubre versión, url y sha512: cambiar cualquiera la invalida", () => {
  const par = crypto.generateKeyPairSync("ed25519");
  const pub = par.publicKey.export({ type: "spki", format: "pem" }).toString();
  const firma = crypto.sign(null, Buffer.from(mensajeAFirmar(M), "utf8"), par.privateKey).toString("base64");
  assert.equal(firmaValida({ ...M, firma }, pub), true);
  assert.equal(firmaValida({ ...M, firma, url: M.url + "x" }, pub), false);
  assert.equal(firmaValida({ ...M, firma, sha512: "b".repeat(128) }, pub), false);
  assert.equal(firmaValida({ ...M, firma, version: "0.4.104" }, pub), false);
  // Notas y fecha no van firmadas: son texto para el cajero y no deciden qué se instala.
  assert.equal(firmaValida({ ...M, firma, notas: "otra cosa" }, pub), true);
});
