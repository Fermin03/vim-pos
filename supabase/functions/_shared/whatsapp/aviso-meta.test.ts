import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { firmaMetaValida, leerAviso, textoDe } from "./aviso-meta.ts";

const secreto = "secreto-de-prueba";
const cuerpo = '{"object":"whatsapp_business_account"}';
const firma = "sha256=" + createHmac("sha256", secreto).update(cuerpo).digest("hex");

test("firma correcta es válida", async () => {
  assert.equal(await firmaMetaValida(cuerpo, firma, secreto), true);
});
test("un byte cambiado, cabecera nula o sin prefijo no son válidos", async () => {
  assert.equal(await firmaMetaValida(cuerpo + " ", firma, secreto), false);
  assert.equal(await firmaMetaValida(cuerpo, null, secreto), false);
  assert.equal(await firmaMetaValida(cuerpo, firma.slice(7), secreto), false);
});

const envolver = (field: string, value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field, value }] }],
});

test("mensaje de texto", () => {
  const aviso = envolver("messages", {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "5214779999999", phone_number_id: "PNID" },
    contacts: [{ profile: { name: "Ana" }, wa_id: "5214771234567" }],
    messages: [{ from: "5214771234567", id: "wamid.X", timestamp: "1700000000", type: "text", text: { body: "Hola" } }],
  });
  assert.deepEqual(leerAviso(aviso), [
    { tipo: "mensaje", waId: "5214771234567", wamid: "wamid.X", nombre: "Ana", texto: "Hola", respondeA: null },
  ]);
});

test("respondeA trae context.id del mensaje citado", () => {
  const aviso = envolver("messages", {
    metadata: { phone_number_id: "PNID" },
    messages: [
      { from: "1", id: "wamid.R", type: "text", text: { body: "ok" }, context: { id: "wamid.LECCION" } },
      { from: "1", id: "wamid.S", type: "text", text: { body: "ok" }, context: {} },
    ],
  });
  assert.deepEqual(leerAviso(aviso).map((e) => e.tipo === "mensaje" && e.respondeA), ["wamid.LECCION", null]);
});

test("solo statuses, null y basura dan []", () => {
  const st = envolver("messages", {
    messaging_product: "whatsapp",
    statuses: [{ id: "wamid.S", status: "delivered", recipient_id: "5214771234567" }],
  });
  assert.deepEqual(leerAviso(st), []);
  assert.deepEqual(leerAviso(null), []);
  assert.deepEqual(leerAviso("x"), []);
  assert.deepEqual(leerAviso({ entry: [null, { changes: 5 }] }), []);
});

test("eco de coexistencia usa el destinatario", () => {
  // Formato tomado de la doc de coexistencia: sin verificar con aviso real (hasta la prueba de Task 9).
  const eco = envolver("smb_message_echoes", {
    messaging_product: "whatsapp",
    message_echoes: [{ from: "5214779999999", to: "5214771234567", id: "wamid.E", timestamp: "1700000001", type: "text", text: { body: "Ya voy" } }],
  });
  assert.deepEqual(leerAviso(eco), [{ tipo: "eco", waId: "5214771234567", wamid: "wamid.E", texto: "Ya voy" }]);
});

test("textoDe", () => {
  assert.equal(textoDe({ type: "audio" }), "[audio]");
  assert.equal(textoDe({ type: "voice" }), "[audio]");
  assert.equal(textoDe({ type: "image", image: { caption: "menú" } }), "[imagen] menú");
  assert.equal(textoDe({ type: "image" }), "[imagen]");
  assert.equal(textoDe({ type: "location" }), "[ubicación]");
  assert.equal(textoDe({ type: "sticker" }), "[sticker]");
  assert.equal(textoDe({ type: "contacts" }), "[contacts]");
  assert.equal(textoDe({ type: "text", text: { body: "a".repeat(3000) } }).length, 2000);
});

test("reacciones, unsupported, system y errors no son mensajes", () => {
  const aviso = envolver("messages", {
    metadata: { phone_number_id: "PNID" },
    messages: [
      { from: "5214771234567", id: "wamid.R", type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" } },
      { from: "5214771234567", id: "wamid.U", type: "unsupported", errors: [{ code: 131051 }] },
      { from: "5214771234567", id: "wamid.S", type: "system", system: { body: "cambió de número" } },
      { from: "5214771234567", id: "wamid.E", type: "errors" },
      { from: "5214771234567", id: "wamid.T", type: "text", text: { body: "sí" } },
    ],
  });
  assert.deepEqual(leerAviso(aviso).map((e) => e.wamid), ["wamid.T"]);
});

test("con numeroId, ignora avisos de otro número (mensajes y ecos)", () => {
  const de = (pnid: string) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [
      { field: "messages", value: { metadata: { phone_number_id: pnid }, messages: [{ from: "521", id: "m-" + pnid, type: "text", text: { body: "x" } }] } },
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: pnid }, message_echoes: [{ to: "521", id: "e-" + pnid, type: "text", text: { body: "y" } }] } },
    ] }],
  });
  assert.deepEqual(leerAviso(de("OTRO"), "PNID"), []);
  assert.deepEqual(leerAviso(de("PNID"), "PNID").map((e) => e.wamid), ["m-PNID", "e-PNID"]);
  assert.equal(leerAviso(de("OTRO")).length, 2); // sin la variable no filtra
});
