import { test } from "node:test";
import assert from "node:assert/strict";
import { citaPublica, huecosPublicos, rechazoYaContado, importe, leerReservada, MENSAJE_REEMBOLSO_EN_PROCESO, negocioDeReservas, reembolsoDeCita, respuestaDeAgenda } from "./reservas.ts";
import { leerCuerpo } from "./validar.ts";
import { cuposDe } from "./respuesta.ts";

const T = "99999999-0000-0000-0000-0000000000aa";
const SUC = "99999999-0000-0000-0000-0000000000BB";
const PROD = "11111111-2222-3333-4444-555555555555";
const COD = "AbCdEfGhIjKlMnOpQrStUv";

test("importe: el numeric del jsonb sale como texto con dos decimales", () => {
  assert.equal(importe(180), "180.00");
  assert.equal(importe(72.5), "72.50");
  assert.equal(importe("90.1"), "90.10");
  assert.equal(importe(null), null);
  assert.equal(importe("abc"), null);
});

test("negocio de reservas: sin el tenant, con las sucursales en minúsculas y los importes en texto", () => {
  const n = negocioDeReservas({
    tenant: T, nombre: "Salón Ana", slug: "salon-ana",
    sucursales: [{ id: SUC, nombre: "Centro", pago_en_linea: true }],
    servicios: [{ producto_id: PROD, nombre: "Corte", precio: 180, duracion_min: 40, anticipo_mxn: 72 }],
    colaboradores: [], reglas: { cancelar_horas: 24 },
  });
  assert.ok(n);
  assert.equal(n.tenantId, T);
  assert.deepEqual(n.sucursales, [SUC.toLowerCase()]);
  assert.equal("tenant" in n.publico, false);
  assert.equal(JSON.stringify(n.publico).includes(T), false);
  assert.deepEqual((n.publico.servicios as unknown[])[0], { producto_id: PROD, nombre: "Corte", precio: "180.00", duracion_min: 40, anticipo_mxn: "72.00" });
  assert.equal(negocioDeReservas(null), null);
  assert.equal(negocioDeReservas({ nombre: "x" }), null);
});

test("huecos: ISO en UTC y en orden; una fila sin hora invalida la respuesta", () => {
  assert.deepEqual(huecosPublicos([{ inicia: "2026-10-20T17:00:00+00:00" }, { inicia: "2026-10-20T16:15:00+00:00" }]),
    ["2026-10-20T16:15:00.000Z", "2026-10-20T17:00:00.000Z"]);
  assert.deepEqual(huecosPublicos([]), []);
  assert.equal(huecosPublicos([{ inicia: "nunca" }]), null);
  assert.equal(huecosPublicos({}), null);
});

test("reservada: el pago solo con su id; el código solo con su forma", () => {
  assert.deepEqual(leerReservada({ cita_id: "c", codigo: COD, anticipo_mxn: 72, pago_id: "p", total_a_pagar_mxn: "72.00", resumen: {} }),
    { citaId: "c", codigo: COD, pagoId: "p", anticipo_mxn: "72.00", total_a_pagar_mxn: "72.00" });
  assert.deepEqual(leerReservada({ cita_id: "c", codigo: null, anticipo_mxn: 0 }),
    { citaId: "c", codigo: null, pagoId: null, anticipo_mxn: "0.00", total_a_pagar_mxn: null });
  assert.equal(leerReservada({ codigo: COD }), null);
});

test("reembolso: devolviéndose o fallido = en proceso (con el texto de la clienta); devuelto; o nada", () => {
  assert.deepEqual(reembolsoDeCita(["DEVOLUCION_FALLIDA"]), { estado: "EN_PROCESO", mensaje: MENSAJE_REEMBOLSO_EN_PROCESO });
  assert.equal(MENSAJE_REEMBOLSO_EN_PROCESO, "Estamos procesando tu reembolso; si no lo ves en 10 días, comunícate con el negocio.");
  assert.equal(reembolsoDeCita(["APROBADO", "POR_DEVOLVER"])?.estado, "EN_PROCESO");
  assert.equal(reembolsoDeCita(["DEVUELTO", "RECHAZADO"])?.estado, "DEVUELTO");
  assert.equal(reembolsoDeCita(["APROBADO", "RECHAZADO", "VENCIDO"]), null);
  assert.equal(reembolsoDeCita([]), null);
});

test("cita pública: importes en texto y su reembolso; lo que no es una cita es null", () => {
  const c = citaPublica({ estado: "CANCELADA", inicia: "2026-10-20T16:00:00+00:00", total_mxn: 180, anticipo_mxn: 72, anticipo_pagado_mxn: 72,
                          servicios: [{ nombre: "Corte", precio: 180 }], puede_cambiar: false }, ["DEVOLUCION_FALLIDA"]);
  assert.ok(c);
  assert.equal(c.total_mxn, "180.00");
  assert.equal(c.anticipo_pagado_mxn, "72.00");
  assert.deepEqual(c.servicios, [{ producto_id: null, nombre: "Corte", colaborador_id: null, colaborador: null, inicia: null, precio: "180.00" }]);
  assert.deepEqual(c.reembolso, { estado: "EN_PROCESO", mensaje: MENSAJE_REEMBOLSO_EN_PROCESO });
  // Solo los campos conocidos: lo que la base agregue no sale solo.
  const x = citaPublica({ estado: "AGENDADA", inicia: "2026-10-20T16:00:00+00:00", tenant_id: "t", cliente_telefono: "4771112233",
                          sucursal: { id: "s", nombre: "Centro", direccion: null, telefono: "4770000000" }, servicios: [{ nombre: "Corte", usuario_email: "x@y" }] }, []);
  assert.ok(x);
  for (const fuera of ["tenant_id", "cliente_telefono", "4770000000", "usuario_email"]) assert.equal(JSON.stringify(x).includes(fuera), false, fuera);
  assert.equal(x.puede_cambiar, false);
  assert.equal(citaPublica(null, []), null);
  assert.equal(citaPublica({ inicia: "x" }, []), null);
});

test("agenda: cada rechazo con su estado y el mensaje de la base para la clienta", () => {
  assert.deepEqual(respuestaDeAgenda("HUECO_OCUPADO: Ese horario ya no está disponible"),
    { status: 409, body: { error: "HUECO_OCUPADO", mensaje: "Ese horario ya no está disponible" } });
  assert.deepEqual(respuestaDeAgenda("LIMITE_RESERVAS: Ya tienes 3 citas apartadas; para más, comunícate con el negocio."),
    { status: 429, body: { error: "LIMITE_RESERVAS", mensaje: "Ya tienes 3 citas apartadas; para más, comunícate con el negocio." } });
  assert.equal(respuestaDeAgenda("LIMITE_INTENTOS: Demasiados intentos de pago. Comunícate con el negocio.").status, 429);
  assert.deepEqual(respuestaDeAgenda("DATOS_INVALIDOS: escribe un correo válido."), { status: 400, body: { error: "DATOS_INVALIDOS", mensaje: "escribe un correo válido." } });
  assert.equal(respuestaDeAgenda("FUERA_DE_PLAZO: Para cambios, comunícate con el negocio").status, 409);
  assert.equal(respuestaDeAgenda("PAGO_NO_DISPONIBLE: Este negocio no puede cobrar el anticipo en línea por ahora").status, 409);
  assert.deepEqual(respuestaDeAgenda("PAGO_EN_PAUSA: 2026-10-20 16:30:00.123+00"), { status: 423, body: { error: "PAGO_EN_PAUSA", hasta: "2026-10-20T16:30:00.123Z" } });
});

test("agenda: un mensaje de varias líneas o enorme no sale; lo que no es de la agenda va por respuestaDeRpc", () => {
  assert.deepEqual(respuestaDeAgenda("HUECO_OCUPADO: a\nb"), { status: 409, body: { error: "HUECO_OCUPADO" } });
  assert.deepEqual(respuestaDeAgenda(`DATOS_INVALIDOS: ${"x".repeat(300)}`), { status: 400, body: { error: "DATOS_INVALIDOS" } });
  assert.deepEqual(respuestaDeAgenda("TIENDA_CERRADA: FUERA_DE_HORARIO"), { status: 409, body: { error: "TIENDA_CERRADA", detalle: "FUERA_DE_HORARIO" } });
  assert.deepEqual(respuestaDeAgenda('duplicate key value violates unique constraint "x"'), { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } });
});

// ── La forma de lo que llega (validar.ts) ────────────────────────────────────────────────────────
const reservar = {
  accion: "reservar", negocio: "salon-ana", sucursal_id: SUC, inicia: "2026-10-20T10:00:00-06:00",
  servicios: [{ producto_id: PROD, usuario_id: null }], cliente: { nombre: " Ana ", telefono: "+52 1 477 111 2233", email: "ANA@x.mx" },
  clave: COD, nota: "  primera vez ", captcha: "tok",
};

test("cuerpo: reservar normaliza la hora a UTC, el celular a 10 dígitos y el correo a minúsculas", () => {
  assert.deepEqual(leerCuerpo(reservar), { ok: true, valor: {
    accion: "reservar", negocio: "salon-ana", sucursal_id: SUC.toLowerCase(), inicia: "2026-10-20T16:00:00.000Z",
    servicios: [{ producto_id: PROD, usuario_id: null }], cliente: { nombre: "Ana", telefono: "4771112233", email: "ana@x.mx" },
    nota: "primera vez", captcha: "tok", clave: COD, tarjeta: null,
  } });
});

test("cuerpo: reservar exige correo, clave con forma de código, hora con zona y de 1 a 5 servicios", () => {
  const mal = (cambio: Record<string, unknown>) => leerCuerpo({ ...reservar, ...cambio });
  assert.deepEqual(mal({ cliente: { nombre: "Ana", telefono: "4771112233" } }), { ok: false, error: "CLIENTE_INVALIDO" });
  assert.deepEqual(mal({ clave: "corta123" }), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(mal({ clave: undefined }), { ok: false, error: "CUERPO_INVALIDO" });
  assert.deepEqual(mal({ inicia: "2026-10-20T10:00:00" }), { ok: false, error: "HORA_INVALIDA" });
  assert.deepEqual(mal({ servicios: [] }), { ok: false, error: "SERVICIOS_INVALIDOS" });
  assert.deepEqual(mal({ servicios: Array(6).fill({ producto_id: PROD }) }), { ok: false, error: "SERVICIOS_INVALIDOS" });
  assert.deepEqual(mal({ servicios: [{ producto_id: PROD, usuario_id: "x" }] }), { ok: false, error: "SERVICIOS_INVALIDOS" });
  assert.deepEqual(mal({ sucursal_id: "x" }), { ok: false, error: "SUCURSAL_INVALIDA" });
  assert.deepEqual(mal({ tarjeta: { token: "x" } }), { ok: false, error: "PAGO_INVALIDO" });
  const t = { token: "a".repeat(32), payment_method_id: "visa", type: "credit_card" };
  const ok = mal({ tarjeta: t });
  assert.ok(ok.ok && ok.valor.accion === "reservar" && ok.valor.tarjeta?.token === t.token);
});

test("cuerpo: huecos con día del calendario y, para cambiar una cita, su código", () => {
  const h = { accion: "huecos", negocio: "salon-ana", sucursal_id: SUC, dia: "2026-10-20", servicios: [{ producto_id: PROD }] };
  assert.deepEqual(leerCuerpo(h), { ok: true, valor: { accion: "huecos", negocio: "salon-ana", sucursal_id: SUC.toLowerCase(), dia: "2026-10-20",
                                                       servicios: [{ producto_id: PROD, usuario_id: null }], codigo: null } });
  assert.deepEqual(leerCuerpo({ ...h, dia: "2026-02-30" }), { ok: false, error: "HORA_INVALIDA" });
  assert.deepEqual(leerCuerpo({ ...h, codigo: "corto" }), { ok: false, error: "CODIGO_INVALIDO" });
  const c = leerCuerpo({ ...h, codigo: COD });
  assert.ok(c.ok && c.valor.accion === "huecos" && c.valor.codigo === COD);
});

test("cuerpo: cita, cancelar y mover llevan el código; mover, también la hora", () => {
  assert.deepEqual(leerCuerpo({ accion: "cita", negocio: "salon-ana", codigo: COD, otro: 1 }), { ok: true, valor: { accion: "cita", negocio: "salon-ana", codigo: COD } });
  assert.deepEqual(leerCuerpo({ accion: "cita_cancelar", negocio: "salon-ana", codigo: "x" }), { ok: false, error: "CODIGO_INVALIDO" });
  assert.deepEqual(leerCuerpo({ accion: "cita_mover", negocio: "salon-ana", codigo: COD, inicia: "2026-10-21T15:30:00Z" }),
    { ok: true, valor: { accion: "cita_mover", negocio: "salon-ana", codigo: COD, inicia: "2026-10-21T15:30:00.000Z" } });
  assert.deepEqual(leerCuerpo({ accion: "cita_mover", negocio: "salon-ana", codigo: COD }), { ok: false, error: "HORA_INVALIDA" });
  assert.deepEqual(leerCuerpo({ accion: "reservas", negocio: "salon-ana" }), { ok: true, valor: { accion: "reservas", negocio: "salon-ana" } });
});

test("cuerpo: confirmar_pago y verificacion de una cita solo con `cita: true` escrito tal cual", () => {
  assert.deepEqual(leerCuerpo({ accion: "confirmar_pago", negocio: "salon-ana", codigo: COD, cita: true }),
    { ok: true, valor: { accion: "confirmar_pago", negocio: "salon-ana", codigo: COD, cita: true } });
  assert.deepEqual(leerCuerpo({ accion: "confirmar_pago", negocio: "salon-ana", codigo: COD, cita: "true" }),
    { ok: true, valor: { accion: "confirmar_pago", negocio: "salon-ana", codigo: COD } });
  assert.deepEqual(leerCuerpo({ accion: "verificacion", negocio: "salon-ana", codigo: COD, cita: true, cancelar: true }),
    { ok: true, valor: { accion: "verificacion", negocio: "salon-ana", codigo: COD, cancelar: true, cita: true } });
});

// ── Los cupos (respuesta.ts) ─────────────────────────────────────────────────────────────────────
test("cupos: huecos 60 por minuto por IP; la cita 20 por minuto (cancelar y mover cierran si el control falla)", () => {
  assert.deepEqual(cuposDe("huecos", "1.2.3.4", "salon-ana"), { antes: [{ clave: "tienda:huecos:ip:1.2.3.4", ventanaSeg: 60, max: 60 }], despuesDelCaptcha: [], alFallar: "abrir" });
  assert.deepEqual(cuposDe("cita", "1.2.3.4", "salon-ana"), { antes: [{ clave: "tienda:cita:ip:1.2.3.4", ventanaSeg: 60, max: 20 }], despuesDelCaptcha: [], alFallar: "abrir" });
  for (const a of ["cita_cancelar", "cita_mover"] as const) {
    const c = cuposDe(a, "1.2.3.4", "salon-ana");
    assert.equal(c.antes[0]!.clave, "tienda:cita:ip:1.2.3.4");
    assert.equal(c.alFallar, "cerrar");
  }
  assert.deepEqual(cuposDe("reservas", "1.2.3.4", "salon-ana"), cuposDe("negocio", "1.2.3.4", "salon-ana"));
});

test("cupos: reservar = los topes de pedir en su propia bolsa; el del negocio solo después del antirobot", () => {
  assert.deepEqual(cuposDe("reservar", "1.2.3.4", "salon-ana"), {
    antes: [{ clave: "tienda:reserva:ip:1.2.3.4", ventanaSeg: 3600, max: 40 }, { clave: "tienda:reserva:ip:1.2.3.4:salon-ana", ventanaSeg: 3600, max: 8 }],
    despuesDelCaptcha: [{ clave: "tienda:reserva:negocio:salon-ana", ventanaSeg: 3600, max: 60 }],
    alFallar: "cerrar",
  });
});

test("rechazo ya contado: el mismo no, sin repetir el motivo", () => {
  assert.deepEqual(rechazoYaContado(), { error: "PAGO_RECHAZADO", detalle: "OTRO" });
});
