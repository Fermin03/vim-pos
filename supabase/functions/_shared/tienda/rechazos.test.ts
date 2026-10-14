import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { anotarRechazo, avisoDePagoPausado, claveDeFreno, frenarPago, FRENO_POR_RIESGO_MIN, ipSinPagoEnLinea, pagoFrenado, RECHAZOS, respuestaDeRechazo } from "./rechazos.ts";
import { cuposDe } from "./respuesta.ts";

/**
 * Los contadores de la base (consumir_cupo y cupo_agotado, 0136) y el freno por riesgo
 * (tienda_pago_frenar y tienda_pago_frenado, 0178), en memoria. El freno contesta como la base: por
 * la clave que recibe, y una hora con zona (`+00:00`).
 */
function contadores(o: { roto?: boolean; frenoRoto?: boolean } = {}) {
  const usos = new Map<string, number>();
  const frenos = new Map<string, number>();
  /** Lo que se le mandó al freno, tal cual (para ver que solo viaja la clave). */
  const alFreno: Record<string, unknown>[] = [];
  let ahora = Date.parse("2026-10-13T20:00:00.000Z");
  const conZona = (ms: number) => new Date(ms).toISOString().replace("Z", "+00:00");
  return {
    usos, frenos, alFreno,
    pasar: (min: number) => { ahora += min * 60_000; },
    rpc: async (fn: string, a: Record<string, unknown>) => {
      if (o.roto) return { data: null, error: { message: "la base no responde" } };
      if (fn === "tienda_pago_frenar" || fn === "tienda_pago_frenado") {
        if (o.frenoRoto) return { data: null, error: { message: "el freno no responde" } };
        alFreno.push({ fn, ...a });
        const k = String(a.p_clave);
        if (fn === "tienda_pago_frenar") {
          const hasta = ahora + Number(a.p_minutos) * 60_000;
          frenos.set(k, Math.max(frenos.get(k) ?? 0, hasta));
          return { data: conZona(hasta), error: null };
        }
        return { data: (frenos.get(k) ?? 0) > ahora ? conZona(frenos.get(k)!) : null, error: null };
      }
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

test("la pausa del negocio pide 20 rechazos de tarjetas reales repartidos en al menos 8 IP distintas; otro negocio no se entera", async () => {
  const db = contadores();
  const pausas: boolean[] = [];
  // 10 IP distintas, 2 rechazos cada una: al vigésimo, con 10 IP, se pausa.
  for (let i = 0; i < RECHAZOS.negocioPausa + 1; i++) pausas.push((await anotarRechazo(db, `10.0.0.${(i % 10) + 1}`, "knockout", "FONDOS")).pausar);
  assert.deepEqual(pausas, [...Array(RECHAZOS.negocioPausa - 1).fill(false), true, true]);
  assert.equal((await anotarRechazo(db, "10.0.0.1", "otro-negocio", "FONDOS")).pausar, false);
});

test("un atacante con pocas IP no le apaga el pago en línea a un restaurante, por muchas peticiones que mande", async () => {
  // 3 IP (lo que antes bastaba con 12 peticiones): 100 rechazos cada una, y nada.
  const db = contadores();
  for (let i = 0; i < 300; i++) assert.equal((await anotarRechazo(db, `10.0.0.${(i % 3) + 1}`, "knockout", "FONDOS")).pausar, false, `petición ${i + 1}`);
  // 7 IP tampoco, aunque el total pase de 20 de sobra.
  const siete = contadores();
  for (let i = 0; i < 140; i++) assert.equal((await anotarRechazo(siete, `10.0.1.${(i % 7) + 1}`, "knockout", "FONDOS")).pausar, false);
  // Y 8 IP con pocos rechazos (menos de 20 en total), tampoco: hacen falta las dos cosas.
  const pocos = contadores();
  for (let i = 0; i < 19; i++) assert.equal((await anotarRechazo(pocos, `10.0.2.${(i % 8) + 1}`, "knockout", "FONDOS")).pausar, false);
  assert.equal((await anotarRechazo(pocos, "10.0.2.1", "knockout", "FONDOS")).pausar, true);   // el vigésimo, con 8 IP
  // IPv6: mil direcciones de un mismo /64 son UNA IP.
  const v6 = contadores();
  for (let i = 0; i < 200; i++) assert.equal((await anotarRechazo(v6, `2806:2f0:9000:ab::${(i + 1).toString(16)}`, "knockout", "FONDOS")).pausar, false);
});

test("un token de tarjeta inventado (soloIp) cuenta para la IP que lo manda y NUNCA para pausar al negocio", async () => {
  const db = contadores();
  // Antes: 12 peticiones desde 3 IP pausaban al restaurante sin una sola tarjeta. Ahora, ni 500 desde 50.
  for (let i = 0; i < 500; i++) assert.equal((await anotarRechazo(db, `10.1.${i % 50}.7`, "knockout", "OTRO", true)).pausar, false);
  assert.equal([...db.usos.keys()].some((k) => k.startsWith("tienda:pago-rechazo:negocio")), false);
  // Pero a esa IP sí se le acaba: tras 5, no puede intentar otro pago en línea.
  assert.equal(await ipSinPagoEnLinea(db, "10.1.0.7", "knockout"), true);
  assert.equal(await ipSinPagoEnLinea(db, "10.9.9.9", "knockout"), false);
});
test("si el contador no responde: el motivo es OTRO, nada se pausa y la IP no queda bloqueada", async () => {
  const db = contadores({ roto: true });
  assert.deepEqual(await anotarRechazo(db, "1.2.3.4", "knockout", "FONDOS"), { detalle: "OTRO", pausar: false });
  assert.equal(await ipSinPagoEnLinea(db, "1.2.3.4", "knockout"), false);
});

test("bolsas separadas: los intentos de pago en línea no gastan el cupo de pedir de los pedidos al recibir", () => {
  const alRecibir = cuposDe("pedir", "1.2.3.4", "knockout"), enLinea = cuposDe("pedir", "1.2.3.4", "knockout", undefined, true);
  const claves = (c: typeof alRecibir) => [...c.antes, ...(c.conNegocio ?? []), ...c.despuesDelCaptcha].map((x) => x.clave);
  assert.deepEqual(claves(enLinea), ["tienda:paga:ip:1.2.3.4", "tienda:paga:ip:1.2.3.4:knockout", "tienda:paga:negocio:knockout"]);
  assert.equal(claves(alRecibir).some((k) => claves(enLinea).includes(k)), false);
  assert.equal(enLinea.alFallar, "cerrar");
  // Las demás acciones no cambian por ese argumento.
  assert.deepEqual(cuposDe("menu", "1.2.3.4", "knockout", undefined, true), cuposDe("menu", "1.2.3.4", "knockout"));
});

test("el correo de la pausa dice a quién y por qué, sin datos de clientes ni de tarjetas", () => {
  const r = avisoDePagoPausado({ negocio: "Knock-Out <b>", slug: "knockout", por: "RECHAZOS" });
  assert.ok(r.html.includes("Knock-Out &lt;b&gt;") && r.html.includes("20 cobros con tarjeta rechazados") && r.html.includes("8 redes distintas"));
  assert.match(r.subject, /^[\x20-\x7e]+$/);
  const s = avisoDePagoPausado({ negocio: "Knock-Out", slug: "knockout", sucursal: "Centro", por: "SIN_PERMISO" });
  assert.ok(s.html.includes("la sucursal Centro de Knock-Out") && s.html.includes("401") && s.html.includes("volver a conectar"));
});

// ── El freno tras un rechazo por riesgo (0178) ──────────────────────────────────────────────────
const T = "99999999-0000-0000-0000-0000000000aa", SECRETO = "secreto-de-la-tienda-de-prueba";
const TEL = "4771112233", IP = "1.2.3.4";
const clave = (tel: string | null = TEL, ip = IP, tenant = T, secreto = SECRETO) => claveDeFreno(secreto, tenant, tel, ip);

test("la clave del freno es de UN cliente: su teléfono Y su IP a la vez, en ese negocio; cambia cualquiera de los tres y es otra", async () => {
  const k = await clave();
  assert.match(k!, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await clave(), k);   // la misma siempre: es con lo que se reconoce al cliente
  // Otro teléfono desde la misma red (el wifi del local, un operador móvil): NO es el mismo cliente.
  assert.notEqual(await clave("4770000000", IP), k);
  // El mismo teléfono desde otra red (alguien que escribe el número de otro): tampoco.
  assert.notEqual(await clave(TEL, "9.9.9.9"), k);
  assert.notEqual(await clave(TEL, IP, "99999999-0000-0000-0000-0000000000bb"), k);
  // Sin el secreto del servidor no se puede calcular: con otro secreto sale otra.
  assert.notEqual(await clave(TEL, IP, T, "otro-secreto"), k);
  // De la clave no se saca nada: ni el teléfono, ni la IP, ni el negocio.
  for (const dato of [TEL, IP, T, "477", "1.2.3"]) assert.equal(k!.includes(dato), false, dato);
});

test("la clave del freno: IPv6 por su /64, sin distinguir mayúsculas; y sin IP conocida, sin teléfono o sin secreto NO hay clave", async () => {
  const k = await clave(TEL, "2806:2f0:9000:ab:1111:2222:3333:4444");
  assert.equal(await clave(TEL, "2806:2f0:9000:ab:ffff::1"), k);
  // `claveDeIp` normaliza a minúsculas (y quita espacios): la misma red escrita distinto es la misma clave.
  assert.equal(await clave(TEL, " 2806:2F0:9000:AB:FFFF::1 "), k);
  assert.notEqual(await clave(TEL, "2806:2f0:9000:ac::1"), k);
  assert.equal(await clave(TEL, "::ffff:1.2.3.4"), await clave(TEL, "1.2.3.4"));
  assert.equal(await clave(TEL, IP, T.toUpperCase()), await clave());
  // «desconocida» la comparten todos los que caen ahí: no identifica a nadie, no se frena por ella.
  for (const ip of ["desconocida", "", "no-es-ip", "999.1.1.1"]) assert.equal(await clave(TEL, ip), null, ip);
  for (const tel of [null, "", "477111223", "47711122334", "477-111-2233", "abcdefghij"]) assert.equal(await clave(tel, IP), null, String(tel));
  assert.equal(await clave(TEL, IP, T, ""), null);
  assert.equal(await clave(TEL, IP, ""), null);
});

test("freno: 30 minutos para esa clave y para nadie más; a la base solo le llega la clave", async () => {
  const db = contadores();
  const k = await clave(), vecino = await clave("4770000000", IP), suplantado = await clave(TEL, "9.9.9.9");
  assert.equal(await pagoFrenado(db, k), null);
  assert.equal(FRENO_POR_RIESGO_MIN, 30);
  assert.equal(await frenarPago(db, k), "2026-10-13T20:30:00.000Z");
  // Hasta cuándo, en ISO con Z (lo que lee la tienda), venga como venga de la base.
  assert.equal(await pagoFrenado(db, k), "2026-10-13T20:30:00.000Z");
  // Quien comparte su red y quien escribe su número desde otra parte siguen pudiendo pagar.
  assert.equal(await pagoFrenado(db, vecino), null);
  assert.equal(await pagoFrenado(db, suplantado), null);
  // Ni el teléfono ni la IP ni el negocio viajan a la base: solo la clave (y los minutos).
  assert.deepEqual(db.alFreno.map((a) => Object.keys(a).sort().join()), ["fn,p_clave", "fn,p_clave,p_minutos", "fn,p_clave", "fn,p_clave", "fn,p_clave"]);
  assert.equal(JSON.stringify(db.alFreno).includes(TEL) || JSON.stringify(db.alFreno).includes(IP), false);
  // Se levanta solo.
  db.pasar(29);
  assert.notEqual(await pagoFrenado(db, k), null);
  db.pasar(2);
  assert.equal(await pagoFrenado(db, k), null);
});

test("freno: sin clave (IP desconocida) no se frena ni se pregunta nada", async () => {
  const db = contadores();
  assert.equal(await frenarPago(db, null), null);
  assert.equal(await pagoFrenado(db, null), null);
  assert.deepEqual(db.alFreno, []);
  assert.deepEqual(await respuestaDeRechazo(db, { slug: "knockout", ip: "desconocida", motivo: "RIESGO", frenoClave: await clave(TEL, "desconocida"), dePrueba: false }),
    { cuerpo: { error: "PAGO_RECHAZADO", detalle: "RIESGO" }, pausar: false });
  assert.equal(db.frenos.size, 0);
});

test("freno: si el control no responde, se deja pasar (no se le niega el pago a nadie) y el rechazo se contesta igual", async () => {
  const roto = contadores({ frenoRoto: true });
  const k = await clave();
  assert.equal(await pagoFrenado(roto, k), null);
  assert.equal(await frenarPago(roto, k), null);
  assert.deepEqual(await respuestaDeRechazo(roto, { slug: "knockout", ip: IP, motivo: "RIESGO", frenoClave: k, dePrueba: false }),
    { cuerpo: { error: "PAGO_RECHAZADO", detalle: "RIESGO" }, pausar: false });
  // Una respuesta que no es una fecha tampoco frena.
  const raro = { rpc: async () => ({ data: "ayer", error: null }) };
  assert.equal(await pagoFrenado(raro, k), null);
});

test("rechazo por RIESGO: frena a ese cliente y le dice hasta cuándo; los demás motivos no frenan a nadie", async () => {
  const db = contadores();
  const k = await clave();
  const d = { slug: "knockout", ip: IP, frenoClave: k, dePrueba: false };
  for (const motivo of ["FONDOS", "DATOS", "LLAMAR_BANCO", "TARJETA_DESHABILITADA", "VERIFICACION", "SIN_VERIFICAR", "OTRO"] as const) {
    const otra = contadores();
    assert.deepEqual((await respuestaDeRechazo(otra, { ...d, motivo })).cuerpo, { error: "PAGO_RECHAZADO", detalle: motivo }, motivo);
    assert.equal(otra.frenos.size, 0, motivo);
    assert.equal(await pagoFrenado(otra, k), null, motivo);
  }
  assert.deepEqual(await respuestaDeRechazo(db, { ...d, motivo: "RIESGO" }),
    { cuerpo: { error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: "2026-10-13T20:30:00.000Z" }, pausar: false });
  assert.equal(await pagoFrenado(db, k), "2026-10-13T20:30:00.000Z");
  assert.equal(await pagoFrenado(db, await clave("4770000000", IP)), null);
});

test("el freno no cuenta doble con los topes por IP: un RIESGO es UN rechazo de esa IP, y mirar el freno no suma ninguno", async () => {
  const db = contadores();
  const k = await clave();
  await respuestaDeRechazo(db, { slug: "knockout", ip: IP, motivo: "RIESGO", frenoClave: k, dePrueba: false });
  assert.equal(db.usos.get("tienda:pago-rechazo:ip:1.2.3.4"), 1);
  assert.equal(db.usos.get("tienda:pago-rechazo:negocio:knockout"), 1);
  // Lo que el cliente insista durante el freno (la función contesta PAGO_EN_PAUSA sin llamar a
  // Mercado Pago) no pasa por los contadores de rechazos: siguen en 1.
  for (let i = 0; i < 20; i++) await pagoFrenado(db, k);
  assert.equal(db.usos.get("tienda:pago-rechazo:ip:1.2.3.4"), 1);
  assert.equal(await ipSinPagoEnLinea(db, IP, "knockout"), false);
  // Con el freno, un cliente junta a lo sumo 2 rechazos por riesgo por hora: nunca llega solo a los 5 que bloquean su IP.
  assert.ok(60 / FRENO_POR_RIESGO_MIN < RECHAZOS.ipBloqueo);
});

test("rechazo por RIESGO desde una IP que ya no recibe el motivo: se frena igual, pero no se le dice ni el motivo ni la hora", async () => {
  const db = contadores();
  const k = await clave();
  for (let i = 0; i < RECHAZOS.ipConDetalle; i++) await anotarRechazo(db, IP, "knockout", "DATOS");
  assert.deepEqual((await respuestaDeRechazo(db, { slug: "knockout", ip: IP, motivo: "RIESGO", frenoClave: k, dePrueba: false })).cuerpo,
    { error: "PAGO_RECHAZADO", detalle: "OTRO" });
  assert.equal(await pagoFrenado(db, k), "2026-10-13T20:30:00.000Z");
});

test("la función mira el freno DESPUÉS del antirobot, y antes del cupo del negocio y de crear el pedido", () => {
  // `tienda/index.ts` no se ejecuta en las pruebas (Deno.serve y la base): se mira el orden en su texto.
  // Antes del antirobot, la respuesta PAGO_EN_PAUSA serviría para preguntar gratis si un teléfono tuvo un rechazo.
  const fuente = readFileSync(new URL("../../tienda/index.ts", import.meta.url), "utf8");
  const pedir = fuente.slice(fuente.indexOf("// ── pedir ──"));
  const orden = ['await antirobot(p.captcha, "tienda_pedido", ip)', "await claveDeFreno(", "await pagoFrenado(admin, frenoClave)", 'error: "PAGO_EN_PAUSA"',
                 "consumirCupos(admin, cupos.despuesDelCaptcha", 'admin.rpc("tienda_crear_pedido"'].map((t) => pedir.indexOf(t));
  assert.ok(orden.every((i) => i > 0), JSON.stringify(orden));
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b));
  // Y es la única consulta del freno de todo el archivo: no hay otra antes.
  assert.equal(fuente.split("pagoFrenado(").length, 2);
  // El pago guarda su clave (para el rechazo que llega tarde), nunca el teléfono ni la IP.
  assert.match(pedir, /\.update\(\{ freno_clave: frenoClave \}\)/);
});

// ── Modo de prueba (0178) ───────────────────────────────────────────────────────────────────────
test("modo de prueba: los rechazos no tocan ningún contador; ni el motivo se esconde, ni la IP se bloquea, ni el negocio se pausa", async () => {
  const db = contadores();
  // 30 rechazos seguidos desde la misma IP y 30 desde otras diez: en un negocio real, motivo escondido, IP fuera y negocio en pausa.
  for (let i = 0; i < 60; i++) {
    const r = await respuestaDeRechazo(db, { slug: "vim-pruebas", ip: i < 30 ? "1.2.3.4" : `10.0.0.${(i % 10) + 1}`, motivo: "FONDOS", frenoClave: null, dePrueba: true });
    assert.deepEqual(r, { cuerpo: { error: "PAGO_RECHAZADO", detalle: "FONDOS" }, pausar: false }, `rechazo ${i + 1}`);
  }
  assert.equal(db.usos.size, 0);
  assert.equal(await ipSinPagoEnLinea(db, "1.2.3.4", "vim-pruebas"), false);
  // Y los mismos 60 en un negocio real sí cuentan: la exención es solo del modo de prueba.
  const real = contadores();
  let pausas = 0;
  for (let i = 0; i < 60; i++) {
    const r = await respuestaDeRechazo(real, { slug: "knockout", ip: i < 30 ? "1.2.3.4" : `10.0.0.${(i % 10) + 1}`, motivo: "FONDOS", frenoClave: null, dePrueba: false });
    if (r.pausar) pausas++;
    if (i === RECHAZOS.ipConDetalle) assert.equal(r.cuerpo.detalle, "OTRO");
  }
  assert.ok(pausas > 0);
  assert.equal(await ipSinPagoEnLinea(real, "1.2.3.4", "knockout"), true);
});

test("modo de prueba: el freno por riesgo sí aplica (es el mismo código que en producción)", async () => {
  const db = contadores();
  assert.deepEqual(await respuestaDeRechazo(db, { slug: "vim-pruebas", ip: IP, motivo: "RIESGO", frenoClave: await clave(), dePrueba: true }),
    { cuerpo: { error: "PAGO_RECHAZADO", detalle: "RIESGO", hasta: "2026-10-13T20:30:00.000Z" }, pausar: false });
  assert.equal(db.usos.size, 0);
});

test("lo que no cuenta como tarjeta rechazada (un reto del banco que se dejó) sigue sin contar, y la verificación fallida cuenta solo para la IP", async () => {
  const db = contadores();
  const d = { slug: "knockout", ip: IP, frenoClave: await clave(), dePrueba: false };
  await respuestaDeRechazo(db, { ...d, motivo: "SIN_VERIFICAR" });
  assert.equal(db.usos.size, 0);
  await respuestaDeRechazo(db, { ...d, motivo: "VERIFICACION" });
  assert.deepEqual([...db.usos.keys()], ["tienda:pago-rechazo:ip:1.2.3.4"]);
});
