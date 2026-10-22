import { test } from "node:test";
import assert from "node:assert/strict";
import { cuposDeEnvio, htmlDeTicket, negocioPuedeEnviar, validarEnvioTicket } from "./ticket-correo.ts";

const ID = "b212d6f4-46fd-45d7-b25f-c1fbe339bfd2";
const ok = { correo: "cliente@ejemplo.com", ticket_id: ID, bloques: [{ t: "texto", valor: "Hola" }] };

test("acepta un envío bien formado y limpia el correo", () => {
  const r = validarEnvioTicket({ ...ok, correo: "  Cliente@Ejemplo.com " });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.cuerpo.correo, "cliente@ejemplo.com");
});

test("rechaza un correo que no es correo", () => {
  for (const correo of ["", "sin-arroba", "a@b", "a b@c.com", "x".repeat(250) + "@c.com", 5]) {
    assert.deepEqual(validarEnvioTicket({ ...ok, correo }), { ok: false, error: "CORREO_INVALIDO" });
  }
});

test("rechaza un ticket que no es uuid", () => {
  assert.deepEqual(validarEnvioTicket({ ...ok, ticket_id: "123" }), { ok: false, error: "TICKET_INVALIDO" });
});

test("rechaza bloques vacíos, de más, desconocidos o con texto enorme", () => {
  const malos = [
    [],
    Array.from({ length: 201 }, () => ({ t: "texto", valor: "x" })),
    [{ t: "script", valor: "x" }],
    [{ t: "texto", valor: "x".repeat(201) }],
    [{ t: "fila", izq: "a", der: 5 }],
    "no-es-lista",
  ];
  for (const bloques of malos) assert.deepEqual(validarEnvioTicket({ ...ok, bloques }), { ok: false, error: "BLOQUES_INVALIDOS" });
});

test("el logo y el corte del papel se ignoran sin rechazar el envío", () => {
  const r = validarEnvioTicket({ ...ok, bloques: [{ t: "raster" }, { t: "texto", valor: "Total" }, { t: "corte" }] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.cuerpo.bloques, [{ t: "texto", valor: "Total", align: undefined, size: 1, bold: false }]);
});

test("el HTML escapa todo lo que viene de la caja", () => {
  const html = htmlDeTicket([{ t: "texto", valor: "<script>x</script>" }, { t: "fila", izq: "<b>", der: "&" }], "Café <León>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Café &lt;León&gt;"));
  assert.ok(html.includes("&amp;"));
});

test("el QR solo se vuelve enlace si apunta a VIM", () => {
  const propio = htmlDeTicket([{ t: "qr", valor: "https://factura.vimpos.com.mx/t/abc" }], "N");
  assert.ok(propio.includes('href="https://factura.vimpos.com.mx/t/abc"'));
  const otroSub = htmlDeTicket([{ t: "qr", valor: "https://demo.vimpos.com.mx/negocio-ajeno" }], "N");
  assert.ok(!otroSub.includes("href="), "solo el portal de facturación, no otros subdominios");
  const ajeno = htmlDeTicket([{ t: "qr", valor: "https://vimpos.com.mx.evil.com/x" }], "N");
  assert.ok(!ajeno.includes("href="));
  const raro = htmlDeTicket([{ t: "qr", valor: "javascript:alert(1)" }], "N");
  assert.ok(!raro.includes("href="));
});

test("en el correo no se pide escanear: el texto antes del QR se vuelve una pregunta", () => {
  const html = htmlDeTicket([
    { t: "texto", valor: "¿Necesitas factura? Escanea el código:" },
    { t: "qr", valor: "https://factura.vimpos.com.mx/x" },
  ], "N");
  assert.ok(!html.includes("Escanea"));
  assert.ok(html.includes("¿Necesitas factura?"));
});

test("los caracteres invisibles y de control se quitan del texto", () => {
  const r = validarEnvioTicket({ ...ok, bloques: [{ t: "texto", valor: "Ho‮la​" }] });
  assert.equal(r.ok, true);
  if (r.ok && r.cuerpo.bloques[0]?.t === "texto") assert.equal(r.cuerpo.bloques[0].valor, "Hola");
});

test("solo envía un negocio activo, interno o en prueba vigente, y sin bloqueo", () => {
  const ahora = new Date("2026-10-21T12:00:00Z");
  const base = { estado: "ACTIVO", deleted_at: null, bloqueo_desde: null, prueba_hasta: null };
  assert.equal(negocioPuedeEnviar(base, ahora), true);
  assert.equal(negocioPuedeEnviar({ ...base, estado: "INTERNO" }, ahora), true);
  assert.equal(negocioPuedeEnviar({ ...base, estado: "TRIAL", prueba_hasta: "2026-10-30" }, ahora), true);
  assert.equal(negocioPuedeEnviar({ ...base, estado: "TRIAL", prueba_hasta: "2026-10-01" }, ahora), false);
  assert.equal(negocioPuedeEnviar({ ...base, estado: "SUSPENDIDO" }, ahora), false);
  assert.equal(negocioPuedeEnviar({ ...base, deleted_at: "2026-10-01" }, ahora), false);
  assert.equal(negocioPuedeEnviar({ ...base, bloqueo_desde: "2026-10-20T00:00:00Z" }, ahora), false);
  assert.equal(negocioPuedeEnviar({ ...base, bloqueo_desde: "2026-11-01T00:00:00Z" }, ahora), true);
  assert.equal(negocioPuedeEnviar(null, ahora), false);
});

test("los cupos: por ticket, por negocio (hora y día) y uno global", () => {
  const c = cuposDeEnvio("t1", "k1");
  assert.deepEqual(c.map((x) => [x.clave, x.ventanaSeg, x.max]), [
    ["ticket-correo:ticket:k1", 86400, 3],
    ["ticket-correo:tenant:t1:h", 3600, 30],
    ["ticket-correo:tenant:t1:d", 86400, 150],
    ["ticket-correo:global", 3600, 300],
  ]);
});
