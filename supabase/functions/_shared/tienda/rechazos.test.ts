import { test } from "node:test";
import assert from "node:assert/strict";
import { anotarRechazo, avisoDePagoPausado, ipSinPagoEnLinea, RECHAZOS } from "./rechazos.ts";
import { cuposDe } from "./respuesta.ts";

/** Los contadores de la base (consumir_cupo y cupo_agotado, 0136), en memoria. */
function contadores(o: { roto?: boolean } = {}) {
  const usos = new Map<string, number>();
  return {
    usos,
    rpc: async (fn: string, a: Record<string, unknown>) => {
      if (o.roto) return { data: null, error: { message: "la base no responde" } };
      const clave = String(a.p_clave), max = Number(a.p_max);
      if (fn === "cupo_agotado") return { data: (usos.get(clave) ?? 0) >= max, error: null };
      usos.set(clave, (usos.get(clave) ?? 0) + 1);
      return { data: usos.get(clave)! <= max, error: null };
    },
  };
}

test("tras 3 rechazos de una IP en la hora, el motivo que se le dice es siempre OTRO", async () => {
  const db = contadores();
  const dichos: string[] = [];
  for (const motivo of ["DATOS", "FONDOS", "DATOS", "DATOS", "FONDOS", "LLAMAR_BANCO"] as const) dichos.push((await anotarRechazo(db, "1.2.3.4", "knockout", motivo)).detalle);
  assert.deepEqual(dichos, ["DATOS", "FONDOS", "DATOS", "OTRO", "OTRO", "OTRO"]);
  // Otra IP empieza de cero: lo de una no le quita el motivo a otra.
  assert.equal((await anotarRechazo(db, "5.6.7.8", "knockout", "FONDOS")).detalle, "FONDOS");
});

test("tras 5 rechazos esa IP ya no puede intentar pago en línea; antes sí, y otra IP también", async () => {
  const db = contadores();
  for (let i = 1; i <= RECHAZOS.ipBloqueo; i++) {
    assert.equal(await ipSinPagoEnLinea(db, "1.2.3.4", "knockout"), false, `antes del rechazo ${i}`);
    await anotarRechazo(db, "1.2.3.4", "knockout", "DATOS");
  }
  assert.equal(await ipSinPagoEnLinea(db, "1.2.3.4", "knockout"), true);
  assert.equal(await ipSinPagoEnLinea(db, "5.6.7.8", "knockout"), false);
  // Preguntar no suma: quien no ha fallado no se bloquea por preguntar.
  for (let i = 0; i < 20; i++) await ipSinPagoEnLinea(db, "9.9.9.9", "knockout");
  assert.equal(await ipSinPagoEnLinea(db, "9.9.9.9", "knockout"), false);
  // IPv6: cuenta su /64, como los demás cupos.
  for (let i = 0; i < RECHAZOS.ipBloqueo; i++) await anotarRechazo(db, `2806:2f0:9000:ab::${i + 1}`, "knockout", "DATOS");
  assert.equal(await ipSinPagoEnLinea(db, "2806:2f0:9000:ab:ffff::1", "knockout"), true);
});

test("12 rechazos en un negocio en una hora, vengan de las IP que vengan: hay que pausar su pago en línea; otro negocio no se entera", async () => {
  const db = contadores();
  const pausas: boolean[] = [];
  for (let i = 1; i <= RECHAZOS.negocioPausa + 1; i++) pausas.push((await anotarRechazo(db, `10.0.0.${i}`, "knockout", "FONDOS")).pausar);
  assert.deepEqual(pausas, [...Array(RECHAZOS.negocioPausa - 1).fill(false), true, true]);
  assert.equal((await anotarRechazo(db, "10.0.0.1", "otro-negocio", "FONDOS")).pausar, false);
});

test("si el contador no responde: el motivo es OTRO, nada se pausa y la IP no queda bloqueada", async () => {
  const db = contadores({ roto: true });
  assert.deepEqual(await anotarRechazo(db, "1.2.3.4", "knockout", "FONDOS"), { detalle: "OTRO", pausar: false });
  assert.equal(await ipSinPagoEnLinea(db, "1.2.3.4", "knockout"), false);
});

test("bolsas separadas: los intentos de pago en línea no gastan el cupo de pedir de los pedidos al recibir", () => {
  const alRecibir = cuposDe("pedir", "1.2.3.4", "knockout"), enLinea = cuposDe("pedir", "1.2.3.4", "knockout", undefined, true);
  const claves = (c: typeof alRecibir) => [...c.antes, ...c.despuesDelCaptcha].map((x) => x.clave);
  assert.deepEqual(claves(enLinea), ["tienda:paga:ip:1.2.3.4", "tienda:paga:ip:1.2.3.4:knockout", "tienda:paga:negocio:knockout"]);
  assert.equal(claves(alRecibir).some((k) => claves(enLinea).includes(k)), false);
  assert.equal(enLinea.alFallar, "cerrar");
  // Las demás acciones no cambian por ese argumento.
  assert.deepEqual(cuposDe("menu", "1.2.3.4", "knockout", undefined, true), cuposDe("menu", "1.2.3.4", "knockout"));
});

test("el correo de la pausa dice a quién y por qué, sin datos de clientes ni de tarjetas", () => {
  const r = avisoDePagoPausado({ negocio: "Knock-Out <b>", slug: "knockout", por: "RECHAZOS" });
  assert.ok(r.html.includes("Knock-Out &lt;b&gt;") && r.html.includes("12 cobros con tarjeta rechazados"));
  assert.match(r.subject, /^[\x20-\x7e]+$/);
  const s = avisoDePagoPausado({ negocio: "Knock-Out", slug: "knockout", sucursal: "Centro", por: "SIN_PERMISO" });
  assert.ok(s.html.includes("la sucursal Centro de Knock-Out") && s.html.includes("401") && s.html.includes("volver a conectar"));
});
