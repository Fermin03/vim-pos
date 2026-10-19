import { test } from "node:test";
import assert from "node:assert/strict";
import { type Cita, correoDeCita, type DepsCita, fechaDeCita, leerCita, mandarCorreosDeCita, type PendienteCita, type Resultado, type TipoCita } from "./correo-cita.ts";

const ENLACE = "https://online.vimpos.com.mx/salon-ana/cita/AAAAAAAAAAAAAAAAAAAAAA";
const AHORA = new Date("2026-11-05T12:00:00-06:00");
// Viernes 6 de noviembre de 2026, 10:30 en México (UTC-6).
const cita = (x: Partial<Cita> = {}): Cita => ({
  inicia: "2026-11-06T16:30:00Z", estado: "AGENDADA", cancelada_por: null, version: 0,
  sucursal: { nombre: "Centro", direccion: "Madero 12, Centro, León" }, servicios: ["Corte de cabello", "Peinado"],
  colaborador: "Diego R.", anticipo_en_linea_mxn: 0, anticipo_mxn: 0, ...x,
});
const correo = (tipo: TipoCita, c: Partial<Cita> = {}, version = 0, enlace: string | null = ENLACE) =>
  correoDeCita({ tipo, version, negocio: "Salón Ana", enlace, cita: cita(c), ahora: AHORA });
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("fecha en México y en español", () => {
  assert.equal(fechaDeCita("2026-11-06T16:30:00Z"), "viernes 6 de noviembre, 10:30");
  assert.equal(fechaDeCita("2026-11-07T05:05:00Z"), "viernes 6 de noviembre, 23:05");
});

test("confirmación: asunto, día y hora, servicios, colaborador, dirección y botón", () => {
  const c = correo("CONFIRMACION")!;
  assert.equal(c.subject, "Tu cita en Salon Ana quedo apartada");
  assert.match(texto(c.html), /Salón Ana Cita del viernes 6 de noviembre, 10:30 Tu cita quedó apartada Te esperamos\. Corte de cabello, Peinado · con Diego R\. Centro: Madero 12, Centro, León Ver mi cita/);
  assert.ok(c.html.includes(`href="${ENLACE}"`));
  assert.match(texto(correo("CONFIRMACION", { anticipo_en_linea_mxn: 90 })!.html), /Recibimos tu anticipo de \$90\.00\./);
  assert.doesNotMatch(correo("CONFIRMACION", {}, 0, null)!.html, /Ver mi cita/);
});

test("asuntos de recordatorio, cambio y cancelación", () => {
  assert.equal(correo("RECORDATORIO")!.subject, "Manana es tu cita en Salon Ana");
  assert.equal(correo("CAMBIO")!.subject, "Tu cita en Salon Ana cambio de horario");
  assert.equal(correo("CANCELACION", { estado: "CANCELADA" })!.subject, "Tu cita en Salon Ana se cancelo");
});

test("cancelación según quién canceló; el negocio nunca promete reembolso automático", () => {
  const t = (c: Partial<Cita>) => texto(correo("CANCELACION", { estado: "CANCELADA", ...c })!.html);
  assert.match(t({ cancelada_por: "CLIENTA_EN_LINEA" }), /Cancelaste tu cita\./);
  assert.doesNotMatch(t({ cancelada_por: "CLIENTA_EN_LINEA" }), /anticipo/);
  assert.match(t({ cancelada_por: "CLIENTA_EN_LINEA", anticipo_en_linea_mxn: 90, anticipo_mxn: 90 }), /Te devolvemos tu anticipo por Mercado Pago\./);
  for (const quien of ["NEGOCIO", "CAJA", null]) {
    const sin = t({ cancelada_por: quien });
    assert.match(sin, /Salón Ana canceló tu cita\./);
    assert.doesNotMatch(sin, /anticipo|devolv/i);
    const con = t({ cancelada_por: quien, anticipo_en_linea_mxn: 90, anticipo_mxn: 90 });
    assert.match(con, /El negocio se comunicará contigo sobre tu anticipo\./);
    assert.doesNotMatch(con, /devolv|Mercado Pago/i);
  }
  assert.match(t({ cancelada_por: "PAGO_VENCIDO" }), /No se completó el pago y tu cita se liberó\./);
});

test("lo que ya no corresponde no sale", () => {
  assert.equal(correo("CANCELACION"), null);                                   // no está cancelada
  assert.equal(correo("CONFIRMACION", { estado: "CANCELADA" }), null);
  assert.equal(correo("CAMBIO", { estado: "CANCELADA", version: 1 }, 1), null);
  assert.equal(correo("CAMBIO", { version: 2 }, 1), null);                     // hubo otro cambio
  assert.ok(correo("CAMBIO", { version: 2 }, 2));
  assert.equal(correo("RECORDATORIO", { version: 1 }, 0), null);               // el horario cambió
  assert.equal(correo("RECORDATORIO", { estado: "EN_CURSO" }), null);
  assert.equal(correo("RECORDATORIO", { inicia: "2026-11-05T17:00:00Z" }), null); // ya pasó
});

test("escapa lo que escribe el negocio", () => {
  const c = correoDeCita({ tipo: "CONFIRMACION", version: 0, negocio: "<b>x</b>", enlace: null, cita: cita({ servicios: ["<i>"] }), ahora: AHORA })!;
  assert.doesNotMatch(c.html, /<b>x<\/b>|<i>/);
});

test("leerCita: lo que trae agenda_correos_tomar", () => {
  const c = leerCita({
    inicia: "2026-11-06T10:30:00-06:00", estado: "AGENDADA", cancelada_por: null, version: 1,
    sucursal: { id: "s", nombre: "Centro", direccion: null }, servicios: [{ nombre: "Corte" }, { nombre: 3 }],
    colaborador: "Diego R.", anticipo_en_linea_mxn: "90.00", anticipo_mxn: 90,
  })!;
  assert.deepEqual(c.servicios, ["Corte"]);
  assert.equal(c.anticipo_en_linea_mxn, 90);
  assert.equal(c.sucursal.direccion, null);
  assert.equal(leerCita(null), null);
  assert.equal(leerCita({ inicia: "x", estado: "AGENDADA" }), null);
});

// ── La cola ──────────────────────────────────────────────────────────────────────────────────────
const pendiente = (x: Partial<PendienteCita> = {}): PendienteCita => ({
  id: 1, tipo: "CONFIRMACION", version: 0, tenant_id: "t", slug: "salon-ana", negocio: "Salón Ana",
  email: "ana@example.com", enlace_hash: "h".repeat(64), cifrado: "cif", cita: { ...cita(), inicia: "2099-01-01T16:00:00Z" }, ...x,
});
function deps(pendientes: PendienteCita[], o: Partial<DepsCita> = {}) {
  const enviados: { to: string; subject: string; html: string }[] = [];
  const resultados: [number, Resultado][] = [];
  const muertos: number[] = [];
  const d: DepsCita = {
    tomar: async () => pendientes,
    descifrar: async (cif) => (cif === "cif" ? "CODIGO" : null),
    enviar: async (c) => { enviados.push(c); return { enviado: true }; },
    resultado: async (id, r) => { resultados.push([id, r]); return r === "FALLO" ? "MUERTO" : "ENVIADO"; },
    alMorir: (id) => { muertos.push(id); },
    base: "https://online.vimpos.com.mx", topeHora: 30, ...o,
  };
  return { d, enviados, resultados, muertos };
}

test("manda con el enlace de la cita y reporta cada resultado", async () => {
  const { d, enviados, resultados, muertos } = deps([
    pendiente(), pendiente({ id: 2, email: null }), pendiente({ id: 3, tipo: "CANCELACION" }), pendiente({ id: 4, cita: null }),
  ]);
  const cuenta = await mandarCorreosDeCita(d);
  assert.deepEqual(cuenta, { ENVIADO: 1, OBSOLETO: 2, SIN_CORREO: 1, FALLO: 0 });
  assert.equal(enviados.length, 1);
  assert.ok(enviados[0].html.includes('href="https://online.vimpos.com.mx/salon-ana/cita/CODIGO"'));
  assert.deepEqual(resultados, [[1, "ENVIADO"], [2, "SIN_CORREO"], [3, "OBSOLETO"], [4, "OBSOLETO"]]);
  assert.deepEqual(muertos, []);
});

test("sin base o sin cifrado sale sin botón; un envío que falla se reporta y avisa si muere", async () => {
  const sin = deps([pendiente({ cifrado: null })]);
  await mandarCorreosDeCita(sin.d);
  assert.doesNotMatch(sin.enviados[0].html, /Ver mi cita/);
  const falla = deps([pendiente()], { enviar: async () => ({ enviado: false }) });
  assert.deepEqual(await mandarCorreosDeCita(falla.d), { ENVIADO: 0, OBSOLETO: 0, SIN_CORREO: 0, FALLO: 1 });
  assert.deepEqual(falla.muertos, [1]);
  const lanza = deps([pendiente()], { enviar: async () => { throw new Error("smtp"); } });
  assert.equal((await mandarCorreosDeCita(lanza.d)).FALLO, 1);
});
