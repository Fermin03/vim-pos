import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeIp, cotizacionPublica, cuposDe, ipDeConfianza, leerNegocio, respuestaDeCaptcha, respuestaDeRpc } from "./respuesta.ts";

const PROD = "11111111-2222-3333-4444-555555555555";
const SUC = "99999999-0000-0000-0000-0000000000bb";

// ── La IP que manda el servidor de la tienda ────────────────────────────────────────────────────
test("ip: una IPv4 o IPv6 válida pasa, en minúsculas y sin espacios", () => {
  assert.equal(ipDeConfianza("187.190.1.20"), "187.190.1.20");
  assert.equal(ipDeConfianza(" 2806:2F0:9000::1 "), "2806:2f0:9000::1");
});
test("ip: ausente, vacía, basura o gigante es «desconocida»", () => {
  for (const v of [null, "", "   ", "no-es-ip", "999.1.1.1", "1.2.3.4, 5.6.7.8", "1.2.3.4 x", "<script>", "a".repeat(46), `${"1:".repeat(30)}1`]) {
    assert.equal(ipDeConfianza(v), "desconocida", JSON.stringify(v));
  }
});

// ── Los cupos de cada acción (diseño §10) ───────────────────────────────────────────────────────
test("cupos: leer es 120 cada 600 s por IP, sin nada después del antirobot, y deja pasar si el control falla", () => {
  for (const accion of ["negocio", "menu", "cotizar", "seguimiento"] as const) {
    assert.deepEqual(cuposDe(accion, "1.2.3.4", "knockout"), {
      antes: [{ clave: "tienda:lee:ip:1.2.3.4", ventanaSeg: 600, max: 120 }],
      despuesDelCaptcha: [],
      alFallar: "abrir",
    });
  }
});
test("cupos: pedir gasta 5 por IP antes del antirobot y 60 por negocio solo después; cierra si el control falla", () => {
  assert.deepEqual(cuposDe("pedir", "desconocida", "knockout"), {
    antes: [{ clave: "tienda:pide:ip:desconocida", ventanaSeg: 3600, max: 5 }],
    despuesDelCaptcha: [{ clave: "tienda:pide:negocio:knockout", ventanaSeg: 3600, max: 60 }],
    alFallar: "cerrar",
  });
});
test("cupos: el cupo del negocio nunca va antes del antirobot", () => {
  const { antes } = cuposDe("pedir", "1.2.3.4", "knockout");
  assert.equal(antes.some((c) => c.clave.includes("negocio")), false);
});
test("cupos: con IPv6 la clave es el /64, en leer y en pedir", () => {
  const ip = "2806:2f0:9000:ab:1111:2222:3333:4444";
  assert.equal(cuposDe("menu", ip, "knockout").antes[0]!.clave, "tienda:lee:ip:2806:2f0:9000:ab::/64");
  assert.equal(cuposDe("pedir", ip, "knockout").antes[0]!.clave, "tienda:pide:ip:2806:2f0:9000:ab::/64");
});

// ── La clave del cupo por IP: IPv4 completa, IPv6 por su /64 ────────────────────────────────────
test("clave de ip: una IPv4 va completa", () => {
  assert.equal(claveDeIp("187.190.1.20"), "187.190.1.20");
});
test("clave de ip: una IPv6 completa se queda en sus cuatro primeros grupos", () => {
  assert.equal(claveDeIp("2806:02F0:9000:00ab:1111:2222:3333:4444"), "2806:2f0:9000:ab::/64");
});
test("clave de ip: una IPv6 abreviada con :: se expande antes de cortar", () => {
  assert.equal(claveDeIp("2806:2f0:9000::1"), "2806:2f0:9000:0::/64");
  assert.equal(claveDeIp("2806:2f0::"), "2806:2f0:0:0::/64");
  assert.equal(claveDeIp("::1"), "0:0:0:0::/64");
  assert.equal(claveDeIp("2806:2f0:9000:ab::"), "2806:2f0:9000:ab::/64");
});
test("clave de ip: dos direcciones del mismo /64 dan la misma clave; de otro /64, otra", () => {
  assert.equal(claveDeIp("2806:2f0:9000:ab::1"), claveDeIp("2806:2f0:9000:ab:ffff:ffff:ffff:ffff"));
  assert.notEqual(claveDeIp("2806:2f0:9000:ab::1"), claveDeIp("2806:2f0:9000:ac::1"));
});
test("clave de ip: una IPv4 mapeada se trata como IPv4", () => {
  assert.equal(claveDeIp("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(claveDeIp("::FFFF:1.2.3.4"), "1.2.3.4");
  assert.equal(claveDeIp("::ffff:1.2.3.4"), claveDeIp("1.2.3.4"));
});
test("clave de ip: basura da «desconocida»", () => {
  for (const v of ["", "desconocida", "no-es-ip", "999.1.1.1", ":", ":::", "1:2:3", "1:2:3:4:5:6:7:8:9", "1::2::3",
                   "g::1", "12345::1", "1:2:3:4:5:6:7::8", "::ffff:999.1.1.1", "1.2.3.4:80", "fe80::1%eth0"]) {
    assert.equal(claveDeIp(v), "desconocida", JSON.stringify(v));
  }
});

// ── El antirobot que no pasó ────────────────────────────────────────────────────────────────────
test("captcha: sin configurar es 503 (fallo nuestro); cualquier otro motivo es 403", () => {
  assert.deepEqual(respuestaDeCaptcha("NO_CONFIGURADO"), { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } });
  for (const motivo of ["SIN_TOKEN", "RECHAZADO", "SIN_RESPUESTA", "HOSTNAME", "ACCION"] as const) {
    assert.deepEqual(respuestaDeCaptcha(motivo), { status: 403, body: { error: "CAPTCHA_INVALIDO" } }, motivo);
  }
});

// ── El error de una RPC → respuesta ─────────────────────────────────────────────────────────────
test("rpc: los cuatro códigos con detalle lo llevan", () => {
  assert.deepEqual(respuestaDeRpc("TIENDA_CERRADA: FUERA_DE_HORARIO"), { status: 409, body: { error: "TIENDA_CERRADA", detalle: "FUERA_DE_HORARIO" } });
  for (const codigo of ["PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO"]) {
    assert.deepEqual(respuestaDeRpc(`${codigo}: ${PROD}`), { status: 409, body: { error: codigo, detalle: PROD } });
  }
});
test("rpc: cualquier otro código de negocio sale sin su detalle", () => {
  const casos: [string, string][] = [
    ["NO_SE_PUDO_CREAR: no se pudo crear el pedido", "NO_SE_PUDO_CREAR"],
    ["ZONA_INVALIDA: a domicilio hace falta una zona activa de esta sucursal", "ZONA_INVALIDA"],
    [`SUCURSAL_DE_OTRO_NEGOCIO: la sucursal ${SUC} no es de este negocio`, "SUCURSAL_DE_OTRO_NEGOCIO"],
    ["PAGO_INVALIDO: «paga con» va solo en efectivo y entre el total y el total más 5000", "PAGO_INVALIDO"],
    ["CARRITO_INVALIDO", "CARRITO_INVALIDO"],
  ];
  for (const [mensaje, codigo] of casos) {
    assert.deepEqual(respuestaDeRpc(mensaje), { status: 409, body: { error: codigo } }, mensaje);
  }
});
test("rpc: un detalle que no parece un motivo o un id no sale, ni en los cuatro códigos", () => {
  assert.deepEqual(respuestaDeRpc("TIENDA_CERRADA: relation \"tienda_config\" does not exist"), { status: 409, body: { error: "TIENDA_CERRADA" } });
  assert.deepEqual(respuestaDeRpc("COMBO_INVALIDO: "), { status: 409, body: { error: "COMBO_INVALIDO" } });
  assert.deepEqual(respuestaDeRpc(`PRODUCTO_NO_DISPONIBLE: ${"a".repeat(65)}`), { status: 409, body: { error: "PRODUCTO_NO_DISPONIBLE" } });
});
test("rpc: lo que no empieza con un código de negocio es 503 y no lleva nada del mensaje", () => {
  const crudos = [
    "duplicate key value violates unique constraint \"delivery_pedidos_seguimiento_hash_key\"",
    "Could not find the function public.tienda_cotizar(p_items) in the schema cache",
    "TypeError: error sending request",
    "permission denied for function tienda_menu",
    "invalid input syntax for type uuid: \"x\"",
    "FATAL: remaining connection slots are reserved",   // una sola palabra en mayúsculas no es un código
    "ERROR",
    "tienda_cerrada: FUERA_DE_HORARIO",
    " TIENDA_CERRADA: FUERA_DE_HORARIO",
    "TIENDA_CERRADA FUERA_DE_HORARIO",
    "",
  ];
  for (const m of crudos) {
    assert.deepEqual(respuestaDeRpc(m), { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } }, m);
  }
  for (const m of [undefined, null, 5, {}]) {
    assert.deepEqual(respuestaDeRpc(m), { status: 503, body: { error: "SERVICIO_NO_DISPONIBLE" } });
  }
});

// ── Lo que devuelve tienda_negocio ──────────────────────────────────────────────────────────────
test("negocio: separa el tenant (interno) de lo público, y lista las sucursales en minúsculas", () => {
  const publico = { slug: "knockout", nombre: "Knock-Out", sucursales: [{ id: SUC.toUpperCase(), nombre: "Centro" }, { nombre: "sin id" }, null] };
  const n = leerNegocio({ tenant_id: "t-1", publico });
  assert.deepEqual(n, { tenantId: "t-1", publico, nombre: "Knock-Out", sucursales: [SUC] });
  assert.equal(JSON.stringify(n!.publico).includes("t-1"), false);
});
test("negocio: NULL o una forma que no es la esperada es «no hay tienda»", () => {
  for (const x of [null, undefined, "x", [], {}, { tenant_id: "t-1" }, { publico: {} }, { tenant_id: 5, publico: {} }, { tenant_id: "t-1", publico: [] }]) {
    assert.equal(leerNegocio(x), null, JSON.stringify(x));
  }
  assert.deepEqual(leerNegocio({ tenant_id: "t-1", publico: {} }), { tenantId: "t-1", publico: {}, nombre: "", sucursales: [] });
});

// ── La cotización que sale al cliente ───────────────────────────────────────────────────────────
test("cotización: salen los cinco campos públicos y nunca `items`", () => {
  const q = {
    items: [{ producto_id: PROD, precio_unitario_mxn: "120.00" }], renglones: [{ nombre: "Clásica", cantidad: 1, detalle: null, total_mxn: "120.00" }],
    subtotal_mxn: "120.00", envio_mxn: "30.00", envio_total_mxn: "34.80", total_mxn: "154.80", otra_cosa: "interna",
  };
  assert.deepEqual(cotizacionPublica(q), {
    renglones: q.renglones, subtotal_mxn: "120.00", envio_mxn: "30.00", envio_total_mxn: "34.80", total_mxn: "154.80",
  });
});
test("cotización: lo que no es un objeto es null", () => {
  for (const x of [null, undefined, "x", 5, []]) assert.equal(cotizacionPublica(x), null);
});
