import { test } from "node:test";
import assert from "node:assert/strict";
import { type DepsCobro, herramientasCobro } from "./herramientas.ts";

const AHORA = new Date("2026-10-28T20:00:00.000Z");

/** Deps falsos: `rpc` responde por nombre de función y todo queda anotado. */
function falsos(respuestas: Record<string, unknown>, extra: Partial<DepsCobro> = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const correos: { to: string; subject: string; html: string }[] = [];
  const cupos: unknown[] = [];
  const prefs: { d: Parameters<DepsCobro["preferencia"]>[0]; token: string }[] = [];
  const d: DepsCobro = {
    async rpc(fn, args) { rpcs.push({ fn, args }); return respuestas[fn]; },
    async cupo(c) { cupos.push(c); return true; },
    async correo(to, subject, html) { correos.push({ to, subject, html }); return { enviado: true }; },
    async preferencia(p, token) { prefs.push({ d: p, token }); return { ok: true, id: "pref-1", url: "https://mp.test/pref-1" }; },
    token: "tok",
    notificacion: "https://x.supabase.co/functions/v1/cobro-vim-webhook",
    ahora: () => AHORA,
    ...extra,
  };
  return { h: herramientasCobro("conv-1", "5214771234567", d), rpcs, correos, cupos, prefs };
}

test("pedirCodigo responde igual exista o no el correo", async () => {
  const no = falsos({ wa_pedir_codigo: { enviar: false, correo: null, codigo: null } });
  const si = falsos({ wa_pedir_codigo: { enviar: true, correo: "dueno@negocio.mx", codigo: "042517" } });
  const a = await no.h.pedirCodigo("  Dueno@Negocio.MX ");
  const b = await si.h.pedirCodigo("  Dueno@Negocio.MX ");
  assert.equal(a, b);
  assert.ok(!b.includes("042517") && !b.includes("dueno@"));
  assert.deepEqual(si.rpcs, [{ fn: "wa_pedir_codigo", args: { p_conversacion_id: "conv-1", p_correo: "dueno@negocio.mx" } }]);
  assert.equal(no.correos.length, 0);
  assert.equal(si.correos.length, 1);
  assert.equal(si.correos[0].to, "dueno@negocio.mx");
  assert.equal(si.correos[0].subject, "Tu codigo de VIM POS");
  assert.match(si.correos[0].subject, /^[ -~]+$/);
  assert.ok(si.correos[0].html.includes("042517"));
  assert.ok(si.correos[0].html.includes("Vence en 15 minutos"));
});

test("pedirCodigo respeta los cupos", async () => {
  const f = falsos({}, { async cupo(c) { f.cupos.push(c); return false; } });
  const t = await f.h.pedirCodigo("Dueno@Negocio.mx");
  assert.match(t, /espere un rato/i);
  assert.equal(f.rpcs.length, 0);
  assert.deepEqual(f.cupos, [[
    { clave: "wa:cod:h:5214771234567", ventanaSeg: 3600, max: 3 },
    { clave: "wa:cod:d:dueno@negocio.mx", ventanaSeg: 86400, max: 5 },
  ]]);
});

test("verificarCodigo con varios negocios pide elegir y lista los nombres", async () => {
  const f = falsos({ wa_verificar_codigo: { ok: true, motivo: null, negocios: [{ id: "t1", nombre: "Knock Out" }, { id: "t2", nombre: "Crazy Burgers" }] } });
  const t = await f.h.verificarCodigo(" 123 4-56 ");
  assert.deepEqual(f.rpcs[0].args, { p_conversacion_id: "conv-1", p_codigo: "123456" });
  assert.ok(t.includes("Knock Out") && t.includes("Crazy Burgers"));
  assert.ok(t.includes("elegir_negocio"));
  assert.ok(!t.includes("t1"));
});

test("verificarCodigo incorrecto pide revisarlo", async () => {
  const f = falsos({ wa_verificar_codigo: { ok: false, motivo: "INCORRECTO", negocios: [] } });
  assert.match(await f.h.verificarCodigo("000000"), /no coincide/);
});

const adeudo = (periodos: { desde: string; hasta: string; plan: number; extras: number; importe: number }[], extra = {}) => ({
  verificado: true, puede_cobrar: true, motivo: null, negocio: "Knock Out", plan: "Pro", ciclo: "MENSUAL",
  estado_negocio: "ACTIVO", suspension_tipo: null, proxima_fecha_cobro: periodos[0]?.desde ?? "2026-11-28",
  vencidos: periodos.length, periodos, ...extra,
});

test("consultarAdeudo arma el desglose mes por mes solo si los precios difieren", async () => {
  const distintos = falsos({ wa_adeudo: adeudo([
    { desde: "2026-09-28", hasta: "2026-10-27", plan: 699, extras: 0, importe: 699 },
    { desde: "2026-10-28", hasta: "2026-11-27", plan: 899, extras: 0, importe: 899 },
  ], { subtotal: 1598, iva: 255.68, total: 1853.68, cubre_hasta: "2026-11-27", estado_negocio: "SUSPENDIDO", suspension_tipo: "FALTA_DE_PAGO" }) });
  const a = await distintos.h.consultarAdeudo(false);
  assert.deepEqual(distintos.rpcs[0], { fn: "wa_adeudo", args: { p_conversacion_id: "conv-1", p_adelanto: false } });
  assert.ok(a.includes("$699.00") && a.includes("$899.00"));
  assert.ok(a.includes("28 de septiembre de 2026"));
  assert.ok(a.includes("$1,598.00") && a.includes("$255.68") && a.includes("$1,853.68"));
  assert.ok(a.includes("27 de noviembre de 2026"));
  assert.match(a, /bloquead/);

  const iguales = falsos({ wa_adeudo: adeudo([
    { desde: "2026-09-28", hasta: "2026-10-27", plan: 899, extras: 0, importe: 899 },
    { desde: "2026-10-28", hasta: "2026-11-27", plan: 899, extras: 0, importe: 899 },
  ], { subtotal: 1798, iva: 287.68, total: 2085.68, cubre_hasta: "2026-11-27" }) });
  const b = await iguales.h.consultarAdeudo(false);
  assert.ok(b.includes("2 meses de $899.00"));
  assert.equal(b.split("$899.00").length - 1, 1);
  assert.ok(b.includes("$1,798.00") && b.includes("$287.68") && b.includes("$2,085.68"));
  assert.doesNotMatch(b, /bloquead[ao] por/);
});

test("consultarAdeudo al corriente ofrece adelantar", async () => {
  const f = falsos({ wa_adeudo: adeudo([], { subtotal: 0, iva: 0, total: 0, cubre_hasta: "2026-11-27", proxima_fecha_cobro: "2026-11-28", vencidos: 0 }) });
  const t = await f.h.consultarAdeudo(false);
  assert.match(t, /al corriente/);
  assert.ok(t.includes("28 de noviembre de 2026"));
  assert.ok(t.includes("adelanto: true"));
});

test("consultarAdeudo sin verificar o sin poder cobrar lo dice como instrucción para el modelo", async () => {
  const sin = falsos({ wa_adeudo: { verificado: false, puede_cobrar: false, motivo: "SIN_VERIFICAR" } });
  assert.match(await sin.h.consultarAdeudo(false), /^Primero verifica/);
  const otro = falsos({ wa_adeudo: { verificado: true, puede_cobrar: false, motivo: "SUSPENDIDO_OTRO", negocio: "Knock Out", estado_negocio: "SUSPENDIDO" } });
  const t = await otro.h.consultarAdeudo(false);
  assert.match(t, /^No cobres; pasa a un agente/);
  assert.ok(t.includes("URGENTE_SOPORTE"));
});

const intento = (extra = {}) => ({ ok: true, motivo: null, intento_id: "int-1", total: 1853.68, periodos: 2, reusado: false, preferencia_url: null, ...extra });

test("crearLigaPago reusa la liga si el intento ya tiene una", async () => {
  const f = falsos({ wa_crear_intento: intento({ reusado: true, preferencia_url: "https://mp.test/vieja" }) });
  const t = await f.h.crearLigaPago(true);
  assert.deepEqual(f.rpcs, [{ fn: "wa_crear_intento", args: { p_conversacion_id: "conv-1", p_adelanto: true } }]);
  assert.equal(f.prefs.length, 0);
  assert.ok(t.includes("https://mp.test/vieja") && t.includes("$1,853.68"));
});

test("crearLigaPago guarda la preferencia y devuelve la liga y el total", async () => {
  const f = falsos({ wa_crear_intento: intento() });
  const t = await f.h.crearLigaPago(false);
  assert.deepEqual(f.prefs, [{
    d: { intentoId: "int-1", total: 1853.68, titulo: "VIM POS — mensualidad", venceEn: new Date("2026-10-29T20:00:00.000Z"),
      notificacion: "https://x.supabase.co/functions/v1/cobro-vim-webhook" },
    token: "tok",
  }]);
  assert.deepEqual(f.rpcs[1], { fn: "wa_fijar_preferencia", args: { p_intento_id: "int-1", p_preferencia_id: "pref-1", p_url: "https://mp.test/pref-1" } });
  assert.ok(t.includes("https://mp.test/pref-1") && t.includes("$1,853.68"));
  assert.ok(t.includes("29 de octubre de 2026"));
});

test("crearLigaPago con Mercado Pago caído no inventa liga", async () => {
  const f = falsos({ wa_crear_intento: intento() }, { async preferencia() { return { ok: false, error: "HTTP 500" }; } });
  const t = await f.h.crearLigaPago(false);
  assert.ok(!t.includes("http"));
  assert.ok(t.includes("pasar_a_fermin") && t.includes("URGENTE_SOPORTE"));
  assert.equal(f.rpcs.some((r) => r.fn === "wa_fijar_preferencia"), false);
});

test("crearLigaPago sin token de Mercado Pago no crea intento", async () => {
  const f = falsos({ wa_crear_intento: intento() }, { token: "" });
  const t = await f.h.crearLigaPago(false);
  assert.equal(f.rpcs.length, 0);
  assert.ok(t.includes("pasar_a_fermin") && t.includes("URGENTE_SOPORTE"));
});

test("crearLigaPago al corriente sin adelanto lo dice", async () => {
  const f = falsos({ wa_crear_intento: { ok: false, motivo: "AL_CORRIENTE" } });
  assert.match(await f.h.crearLigaPago(false), /adelanto: true/);
});

test("guardarDatosFactura guarda los cinco datos", async () => {
  const f = falsos({ wa_guardar_factura: null });
  const d = { rfc: " xaxx010101000 ", razon_social: "Público en General", regimen: "616", codigo_postal: "37000", uso_cfdi: "S01" };
  assert.match(await f.h.guardarDatosFactura(d), /^Guardad/);
  assert.deepEqual(f.rpcs, [{ fn: "wa_guardar_factura", args: { p_conversacion_id: "conv-1", p_datos: { ...d, rfc: "XAXX010101000" } } }]);
});
