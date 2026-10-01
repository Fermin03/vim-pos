import { test } from "node:test";
import assert from "node:assert/strict";
import { correoAvisoAlta, procesarAlta, procesarReenvio, TERMINOS_VERSION, telefonoMx10, validarAlta, type DepsAlta } from "./alta.ts";

const BUENO = {
  codigo: "tacos-ana",
  nombre_comercial: "Tacos Ana",
  nombre_owner: "Ana López",
  email_owner: "Ana@Tacos.mx",
  telefono_owner: "+52 477 123 4567",
  ciudad: "León",
  vertical: "QUICK_SERVICE",
  password: "12345678",
  acepta_terminos: true,
  captcha: "tok",
};

/** Dependencias falsas que anotan cada llamada. */
function deps(sobre: Partial<DepsAlta> = {}) {
  const llamadas: Record<string, unknown[]> = { crearUsuario: [], borrarUsuario: [], altaNegocio: [], enviarConfirmacion: [], avisarVim: [] };
  const d: DepsAlta = {
    verificarCaptcha: async () => ({ ok: true }),
    crearUsuario: async (a) => { llamadas.crearUsuario!.push(a); return { id: "u-1" }; },
    borrarUsuario: async (id) => { llamadas.borrarUsuario!.push(id); },
    altaNegocio: async (a) => { llamadas.altaNegocio!.push(a); return { tenantId: "t-1" }; },
    enviarConfirmacion: async (e) => { llamadas.enviarConfirmacion!.push(e); return { ok: true }; },
    avisarVim: (x) => { llamadas.avisarVim!.push(x); },
    ...sobre,
  };
  return { d, llamadas };
}

test("sin términos aceptados se rechaza y NO se toca Auth", async () => {
  for (const acepta of [undefined, false, "true", 1]) {
    const { d, llamadas } = deps();
    const r = await procesarAlta({ ...BUENO, acepta_terminos: acepta }, d);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "TERMINOS_REQUERIDOS");
    assert.equal(llamadas.crearUsuario!.length, 0);
  }
});

test("crea la cuenta SIN confirmar el correo y manda la confirmación", async () => {
  const { d, llamadas } = deps();
  const r = await procesarAlta(BUENO, d);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, tenant_id: "t-1", email: "ana@tacos.mx", correo_enviado: true, siguiente_paso: "confirmar_correo" });
  assert.deepEqual(llamadas.crearUsuario, [{ email: "ana@tacos.mx", password: "12345678", nombre: "Ana López" }]);
  assert.deepEqual(llamadas.enviarConfirmacion, ["ana@tacos.mx"]);
  // El negocio lleva los términos, el teléfono en 10 dígitos y la ciudad.
  const alta = llamadas.altaNegocio![0] as Record<string, unknown>;
  assert.equal(alta.terminos_version, TERMINOS_VERSION);
  assert.equal(alta.telefono_owner, "4771234567");
  assert.equal(alta.ciudad, "León");
  assert.equal(alta.plan, "ESENCIAL");
  assert.equal(alta.owner_id, "u-1");
  assert.equal(llamadas.avisarVim!.length, 1);
});

test("el contacto es obligatorio: nombre, WhatsApp, correo y ciudad", async () => {
  const r1 = validarAlta({ ...BUENO, ciudad: "" });
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.ok === false && r1.campos, ["ciudad"]);
  const r2 = validarAlta({ ...BUENO, telefono_owner: "477 123" });
  assert.equal(r2.ok === false && r2.error, "TELEFONO_INVALIDO");
  const r3 = validarAlta({ ...BUENO, email_owner: "ana@" });
  assert.equal(r3.ok === false && r3.error, "EMAIL_INVALIDO");
  const r4 = validarAlta({ ...BUENO, nombre_owner: undefined, telefono_owner: undefined });
  assert.deepEqual(r4.ok === false && r4.campos, ["nombre_owner", "telefono_owner"]);
  const r5 = validarAlta({ ...BUENO, vertical: "SUPERMERCADO" });
  assert.equal(r5.ok === false && r5.error, "VERTICAL_INVALIDA");
  const r6 = validarAlta({ ...BUENO, password: "x".repeat(73) });
  assert.equal(r6.ok === false && r6.error, "PASSWORD_LARGA");
});

test("teléfono en 10 dígitos, como en el formulario", () => {
  assert.equal(telefonoMx10("477-123-4567"), "4771234567");
  assert.equal(telefonoMx10("5214771234567"), "4771234567");
  assert.equal(telefonoMx10("12345678901"), null);
});

test("captcha malo = 400 CAPTCHA_INVALIDO, antes de crear nada", async () => {
  const { d, llamadas } = deps({ verificarCaptcha: async () => ({ ok: false }) });
  const r = await procesarAlta(BUENO, d);
  assert.deepEqual(r, { status: 400, body: { error: "CAPTCHA_INVALIDO" } });
  assert.equal(llamadas.crearUsuario!.length, 0);
});

test("si el negocio no se da de alta, se borra la cuenta recién creada", async () => {
  const { d, llamadas } = deps({ altaNegocio: async () => ({ error: "duplicate key value violates unique constraint" }) });
  const r = await procesarAlta(BUENO, d);
  assert.deepEqual(r, { status: 409, body: { error: "CODIGO_YA_USADO" } });
  assert.deepEqual(llamadas.borrarUsuario, ["u-1"]);
  assert.equal(llamadas.enviarConfirmacion!.length, 0);
});

test("correo ya registrado = 409, sin detalles de GoTrue", async () => {
  const { d } = deps({ crearUsuario: async () => ({ error: "A user with this email address has already been registered" }) });
  assert.deepEqual(await procesarAlta(BUENO, d), { status: 409, body: { error: "EMAIL_YA_REGISTRADO" } });
  const { d: d2 } = deps({ crearUsuario: async () => ({ error: "Database error saving new user" }) });
  assert.deepEqual(await procesarAlta(BUENO, d2), { status: 400, body: { error: "ALTA_OWNER_FALLO" } });
});

test("si el correo de confirmación no sale, el alta queda y se dice", async () => {
  const { d } = deps({ enviarConfirmacion: async () => ({ ok: false, error: "smtp" }) });
  const r = await procesarAlta(BUENO, d);
  assert.equal(r.status, 200);
  assert.equal(r.body.correo_enviado, false);
});

test("un aviso a VIM que revienta no tumba el alta", async () => {
  const { d } = deps({ avisarVim: () => { throw new Error("smtp caído"); } });
  assert.equal((await procesarAlta(BUENO, d)).status, 200);
});

test("reenviar contesta igual exista o no el correo; solo el captcha y la forma lo cambian", async () => {
  const { d, llamadas } = deps({ enviarConfirmacion: async (e) => { llamadas.enviarConfirmacion!.push(e); return { ok: false, error: "not found" }; } });
  assert.deepEqual(await procesarReenvio({ email: " Ana@Tacos.mx " }, d), { status: 200, body: { ok: true } });
  assert.deepEqual(llamadas.enviarConfirmacion, ["ana@tacos.mx"]);
  assert.deepEqual(await procesarReenvio({ email: "no-es" }, d), { status: 400, body: { error: "EMAIL_INVALIDO" } });
  const { d: sinCaptcha } = deps({ verificarCaptcha: async () => ({ ok: false }) });
  assert.deepEqual(await procesarReenvio({ email: "ana@tacos.mx" }, sinCaptcha), { status: 400, body: { error: "CAPTCHA_INVALIDO" } });
});

test("el aviso a VIM escapa lo que escribió el visitante y enlaza la ficha", () => {
  const v = validarAlta({ ...BUENO, nombre_comercial: "<script>x</script> & Co", ciudad: "Léon \"GTO\"" });
  assert.ok(v.ok);
  const { subject, html } = correoAvisoAlta({ ...v.datos, tenantId: "abc-123" }, "https://platform.vimpos.com.mx/");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt; &amp; Co"));
  assert.ok(html.includes("https://platform.vimpos.com.mx/clientes/abc-123"));
  assert.ok(html.includes("4771234567"));
  assert.match(subject, /^[ -~]*$/, "asunto en ASCII puro");
  assert.ok(subject.includes("tacos-ana"));
});

test("sin captcha configurado (y no es local) = 503 CAPTCHA_NO_CONFIGURADO, sin tocar Auth", async () => {
  const { d, llamadas } = deps({ verificarCaptcha: async () => ({ ok: false, noConfigurado: true }) });
  assert.deepEqual(await procesarAlta(BUENO, d), { status: 503, body: { error: "CAPTCHA_NO_CONFIGURADO" } });
  assert.equal(llamadas.crearUsuario!.length, 0);
  assert.deepEqual(await procesarReenvio({ email: "ana@tacos.mx" }, d), { status: 503, body: { error: "CAPTCHA_NO_CONFIGURADO" } });
});

test("cada acción pide su captcha: registro y reenvio", async () => {
  const acciones: string[] = [];
  const { d } = deps({ verificarCaptcha: async (_t, a) => { acciones.push(a); return { ok: true }; } });
  await procesarAlta(BUENO, d);
  await procesarReenvio({ email: "ana@tacos.mx" }, d);
  assert.deepEqual(acciones, ["registro", "reenvio"]);
});

test("si el rollback no puede borrar la cuenta, queda en el log", async () => {
  const logs: string[] = [];
  const { d } = deps({
    altaNegocio: async () => ({ error: "boom" }),
    borrarUsuario: async () => { throw new Error("auth caído"); },
    log: (n, m) => logs.push(`${n}: ${m}`),
  });
  assert.equal((await procesarAlta(BUENO, d)).status, 400);
  assert.ok(logs.some((l) => l.startsWith("error: rollback") && l.includes("u-1")), logs.join("\n"));
});

test("reenvío con el límite de GoTrue = 429 ESPERA_UN_MINUTO (nunca 'listo')", async () => {
  const { d } = deps({ enviarConfirmacion: async () => ({ ok: false, error: "For security purposes, you can only request this after 52 seconds." }) });
  assert.deepEqual(await procesarReenvio({ email: "ana@tacos.mx" }, d), { status: 429, body: { error: "ESPERA_UN_MINUTO" } });
  const { d: d2 } = deps({ enviarConfirmacion: async () => ({ ok: false, error: "email rate limit exceeded" }) });
  assert.equal((await procesarReenvio({ email: "ana@tacos.mx" }, d2)).status, 429);
});
