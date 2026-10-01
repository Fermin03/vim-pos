import { test } from "node:test";
import assert from "node:assert/strict";
import {
  correoBienvenida,
  procesarBienvenida,
  soporteBienvenida,
  SOPORTE_RESPALDO,
  type DepsBienvenida,
} from "./bienvenida.ts";

const DATOS = {
  nombreDueno: "Ana López",
  negocio: "Tacos El Güero",
  adminUrl: "https://admin.vimpos.com.mx/",
  soporte: { whatsapp: "525665083346", horario: "lunes a viernes de 9:00 a 18:00" },
};

// ── La plantilla ────────────────────────────────────────────────────────────────────────────────

test("el correo lleva los enlaces al panel, a la descarga de la caja y a Plan y pagos", () => {
  const { html } = correoBienvenida(DATOS);
  assert.match(html, /href="https:\/\/admin\.vimpos\.com\.mx\/bienvenida"/);
  assert.match(html, /href="https:\/\/admin\.vimpos\.com\.mx\/configuracion\/cajas\/descargar"/);
  assert.match(html, /href="https:\/\/admin\.vimpos\.com\.mx\/configuracion\/plan"/);
  // La barra final de la URL base no puede duplicarse.
  assert.doesNotMatch(html, /mx\/\/[a-z]/);
});

test("dice los cinco pasos del panel, en su orden, y que facturar es opcional", () => {
  const { html } = correoBienvenida(DATOS);
  const orden = ["Datos del negocio", "Tu menú", "Tu caja", "Conecta la computadora de tu caja", "Tu equipo"].map((t) => html.indexOf(t));
  assert.ok(orden.every((i) => i >= 0), "falta algún paso");
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, "los pasos van en el orden del panel");
  assert.match(html, /Facturación[^<]*opcional|opcional[^<]*factur/i);
});

test("dice el equipo que hace falta: Windows 10 u 11 e impresora de red, no USB", () => {
  const { html } = correoBienvenida(DATOS);
  assert.match(html, /Windows 10 u 11/);
  assert.match(html, /de red/);
  assert.match(html, /USB/);
});

test("el soporte sale con su WhatsApp legible, su enlace y el horario", () => {
  const { html } = correoBienvenida(DATOS);
  assert.match(html, /href="https:\/\/wa\.me\/525665083346"/);
  assert.match(html, /\+52 56 6508 3346/);
  assert.match(html, /lunes a viernes de 9:00 a 18:00/);
});

test("lo que escribe el cliente va escapado", () => {
  const { html } = correoBienvenida({ ...DATOS, nombreDueno: `<img src=x onerror=alert(1)>`, negocio: `Tacos "El <b>Güero</b>" & Hnos` });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>Güero/);
  assert.match(html, /Tacos &quot;El &lt;b&gt;Güero&lt;\/b&gt;&quot; &amp; Hnos/);
});

test("sin nombre, sin horario o con datos raros no escribe undefined ni null", () => {
  for (const d of [
    { ...DATOS, nombreDueno: null },
    { ...DATOS, nombreDueno: "   " },
    { ...DATOS, soporte: { whatsapp: "525665083346", horario: null } },
    { ...DATOS, soporte: soporteBienvenida(null) },
    { ...DATOS, soporte: soporteBienvenida({ whatsapp: "no-es-numero", horario: 5 }) },
  ]) {
    const { html, subject } = correoBienvenida(d);
    assert.doesNotMatch(html, /undefined|null|NaN/);
    assert.doesNotMatch(subject, /undefined|null/);
    assert.match(html, /Hola/);
  }
});

test("el asunto es ASCII puro (un asunto con acentos rompía el correo entero)", () => {
  const { subject } = correoBienvenida({ ...DATOS, negocio: "Café Ñandú · León" });
  assert.match(subject, /^[ -~]+$/);
  assert.ok(subject.length <= 160);
});

test("se lee como texto: sin imágenes, sin estilos en bloque, sin emojis", () => {
  const { html } = correoBienvenida(DATOS);
  assert.doesNotMatch(html, /<img|<style|<script/i);
  assert.doesNotMatch(html, /\p{Extended_Pictographic}/u);
  // Cada enlace enseña su dirección: un cliente de correo sin HTML la sigue pudiendo copiar.
  assert.match(html, />https:\/\/admin\.vimpos\.com\.mx\/bienvenida</);
});

test("el soporte se lee de la fila de la base y, si no sirve, del respaldo", () => {
  assert.deepEqual(soporteBienvenida({ whatsapp: "524771112233", horario: " 8 a 20 ", correo: null }), { whatsapp: "524771112233", horario: "8 a 20" });
  assert.deepEqual(soporteBienvenida(undefined), SOPORTE_RESPALDO);
  assert.deepEqual(soporteBienvenida({ whatsapp: "123" }), SOPORTE_RESPALDO);
  assert.equal(SOPORTE_RESPALDO.whatsapp, "525665083346");
});

// ── El flujo ────────────────────────────────────────────────────────────────────────────────────

function deps(sobre: Partial<DepsBienvenida> = {}) {
  const ll = { reclamar: 0, enviar: [] as { to: string; subject: string; html: string }[], liberar: 0, logs: [] as string[] };
  // La "base": una sola marca por negocio, como `tenant_onboarding_estado.bienvenida_enviada_at`.
  let marcada = false;
  const d: DepsBienvenida = {
    quienLlama: async () => ({ usuarioId: "u-1", tenantId: "t-1" }),
    hayCupo: async () => true,
    leerNegocio: async () => ({ nombre: "Tacos El Güero", duenoId: "u-1" }),
    leerDueno: async () => ({ email: "ana@tacos.mx", nombre: "Ana López", confirmado: true }),
    leerSoporte: async () => ({ whatsapp: "525665083346", horario: "9:00 a 18:00" }),
    reclamar: async () => { ll.reclamar++; if (marcada) return "YA_ENVIADA"; marcada = true; return "RECLAMADA"; },
    liberar: async () => { ll.liberar++; marcada = false; },
    enviar: async (c) => { ll.enviar.push(c); return { enviado: true, motivo: "" }; },
    adminUrl: "https://admin.vimpos.com.mx",
    log: (_n, m) => { ll.logs.push(m); },
    ...sobre,
  };
  return { d, ll };
}

/** Deja correr el envío, que va en segundo plano. */
const asentar = () => new Promise((r) => setTimeout(r, 5));

test("la primera vez reclama, manda el correo al dueño y contesta enviado", async () => {
  const { d, ll } = deps();
  const r = await procesarBienvenida(d);
  await asentar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, enviado: true });
  assert.equal(ll.enviar.length, 1);
  assert.equal(ll.enviar[0]!.to, "ana@tacos.mx");
  assert.equal(ll.liberar, 0);
});

test("idempotente: la segunda llamada (doble clic, reintento) no manda otro", async () => {
  const { d, ll } = deps();
  const [a, b] = await Promise.all([procesarBienvenida(d), procesarBienvenida(d)]);
  const c = await procesarBienvenida(d);
  await asentar();
  assert.equal(ll.enviar.length, 1, "un solo correo por negocio");
  assert.deepEqual([a.body.enviado, b.body.enviado].sort(), [false, true]);
  assert.deepEqual(c.body, { ok: true, enviado: false, motivo: "YA_ENVIADA" });
  assert.equal(c.status, 200);
});

test("si el envío falla se libera la marca para que un reintento pueda mandarlo, y no se devuelve error", async () => {
  let falla = true;
  const { d, ll } = deps({ enviar: async (c) => { if (falla) return { enviado: false, motivo: "SMTP: caído" }; ll.enviar.push(c); return { enviado: true, motivo: "" }; } });
  const r = await procesarBienvenida(d);
  await asentar();
  assert.equal(r.status, 200);
  assert.equal(ll.liberar, 1);
  assert.ok(ll.logs.some((m) => /NO enviada/.test(m)), "el fallo queda en el log");
  falla = false;
  await procesarBienvenida(d);
  await asentar();
  assert.equal(ll.enviar.length, 1, "el reintento sí lo manda");
});

test("si el envío revienta tampoco se cae: se libera y se registra", async () => {
  const { d, ll } = deps({ enviar: async () => { throw new Error("socket"); } });
  const r = await procesarBienvenida(d);
  await asentar();
  assert.equal(r.status, 200);
  assert.equal(ll.liberar, 1);
});

test("sin sesión válida, 401; con sesión sin negocio, 403; y no se reclama nada", async () => {
  const a = deps({ quienLlama: async () => null });
  assert.equal((await procesarBienvenida(a.d)).status, 401);
  const c = deps({ quienLlama: async () => ({ usuarioId: "u-9", tenantId: null }) });
  assert.equal((await procesarBienvenida(c.d)).status, 403);
  assert.equal(a.ll.reclamar + c.ll.reclamar, 0);
});

test("solo el DUEÑO la dispara: un administrador invitado que fija su contraseña no le manda la bienvenida al dueño", async () => {
  // /establecer-acceso también recibe a un ADMIN que el dueño invitó. El dueño del negocio es u-1.
  const { d, ll } = deps({ quienLlama: async () => ({ usuarioId: "u-admin", tenantId: "t-1" }) });
  const r = await procesarBienvenida(d);
  await asentar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, enviado: false, motivo: "NO_ES_DUENO" });
  assert.equal(ll.reclamar, 0, "ni siquiera se reclama: la marca queda libre para cuando entre el dueño");
  assert.equal(ll.enviar.length, 0);
});

test("si algo revienta ENTRE reclamar y enviar, la marca se libera (no queda reclamada sin correo)", async () => {
  // Un nombre que no es texto en los metadatos de la cuenta hace reventar la plantilla, ya con la
  // marca puesta. Antes la marca se quedaba y el correo no salía nunca.
  const { d, ll } = deps({ leerDueno: async () => ({ email: "ana@tacos.mx", nombre: 123 as unknown as string, confirmado: true }) });
  const r = await procesarBienvenida(d);
  await asentar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: false, enviado: false, motivo: "ERROR" });
  assert.equal(ll.reclamar, 1);
  assert.equal(ll.liberar, 1, "la marca se soltó");
  assert.equal(ll.enviar.length, 0);
});

test("si dejar el envío en segundo plano falla, el correo ya va en camino: NO se libera (liberar mandaría dos)", async () => {
  const { d, ll } = deps({ enSegundoPlano: () => { throw new Error("sin waitUntil"); } });
  const r = await procesarBienvenida(d);
  await asentar();
  assert.deepEqual(r.body, { ok: true, enviado: true });
  assert.equal(ll.enviar.length, 1);
  assert.equal(ll.liberar, 0);
});

test("si liberar también falla no se cae: queda en el log", async () => {
  const { d, ll } = deps({
    leerDueno: async () => ({ email: "ana@tacos.mx", nombre: 123 as unknown as string, confirmado: true }),
    liberar: async () => { throw new Error("base caída"); },
  });
  const r = await procesarBienvenida(d);
  assert.equal(r.status, 200);
  assert.ok(ll.logs.some((m) => /no se pudo liberar/.test(m)));
});

test("pasado el límite contesta 429 sin reclamar", async () => {
  const { d, ll } = deps({ hayCupo: async () => false });
  const r = await procesarBienvenida(d);
  assert.equal(r.status, 429);
  assert.equal(ll.reclamar, 0);
});

test("un dueño sin correo confirmado no recibe bienvenida (todavía no llegó)", async () => {
  const { d, ll } = deps({ leerDueno: async () => ({ email: "ana@tacos.mx", nombre: "Ana", confirmado: false }) });
  const r = await procesarBienvenida(d);
  assert.deepEqual(r.body, { ok: true, enviado: false, motivo: "SIN_CONFIRMAR" });
  assert.equal(ll.reclamar, 0);
  assert.equal(ll.enviar.length, 0);
});

test("un negocio que ya no es nuevo no recibe bienvenida (lo dice la base)", async () => {
  const { d, ll } = deps({ reclamar: async () => "NO_APLICA" });
  const r = await procesarBienvenida(d);
  assert.deepEqual(r.body, { ok: true, enviado: false, motivo: "NO_APLICA" });
  assert.equal(ll.enviar.length, 0);
});

test("si la lectura del soporte falla se usa el respaldo, no se cancela el correo", async () => {
  const { d, ll } = deps({ leerSoporte: async () => { throw new Error("rpc caída"); } });
  await procesarBienvenida(d);
  await asentar();
  assert.equal(ll.enviar.length, 1);
  assert.match(ll.enviar[0]!.html, /wa\.me\/525665083346/);
});

test("un fallo inesperado de la base no devuelve 500 con el detalle: 200 y al log", async () => {
  const { d, ll } = deps({ leerNegocio: async () => { throw new Error("relation does not exist"); } });
  const r = await procesarBienvenida(d);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: false, enviado: false, motivo: "ERROR" });
  assert.ok(ll.logs.some((m) => /relation does not exist/.test(m)));
});
