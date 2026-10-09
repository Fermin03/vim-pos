import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeIp, cotizacionPublica, cuposDe, esTopeDeEntradas, ipDeConfianza, leerNegocio, leerPedido, respuestaDeCaptcha, respuestaDeRpc, yaExistia } from "./respuesta.ts";

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
  for (const accion of ["negocio", "menu", "cotizar"] as const) {
    assert.deepEqual(cuposDe(accion, "1.2.3.4", "knockout"), {
      antes: [{ clave: "tienda:lee:ip:1.2.3.4", ventanaSeg: 600, max: 120 }],
      despuesDelCaptcha: [],
      alFallar: "abrir",
    });
  }
});
test("cupos: el seguimiento tiene su bolsa (90 cada 600 s): su sondeo no le quita lecturas al menú ni a cotizar", () => {
  assert.deepEqual(cuposDe("seguimiento", "1.2.3.4", "knockout"), {
    antes: [{ clave: "tienda:sigue:ip:1.2.3.4", ventanaSeg: 600, max: 90 }],
    despuesDelCaptcha: [],
    alFallar: "abrir",
  });
  assert.equal(cuposDe("seguimiento", "2806:2f0:9000:ab:1111:2222:3333:4444", "knockout").antes[0]!.clave, "tienda:sigue:ip:2806:2f0:9000:ab::/64");
});
// Entrega 7: el cupo por IP de `pedir` es por restaurante (8 por hora); antes era 5 compartido.
// Auditoría (B1): delante va uno SOLO por IP (40 por hora). El slug llega aquí sin validar: sin ese
// tope, cada slug inventado le estrenaba un contador a la misma red.
test("cupos: pedir gasta 40 por IP y 8 por IP y restaurante antes del antirobot, y 60 por negocio solo después; cierra si el control falla", () => {
  assert.deepEqual(cuposDe("pedir", "desconocida", "knockout"), {
    antes: [
      { clave: "tienda:pide:ip:desconocida", ventanaSeg: 3600, max: 40 },
      { clave: "tienda:pide:ip:desconocida:knockout", ventanaSeg: 3600, max: 8 },
    ],
    despuesDelCaptcha: [{ clave: "tienda:pide:negocio:knockout", ventanaSeg: 3600, max: 60 }],
    alFallar: "cerrar",
  });
});
test("cupos: el cupo del negocio nunca va antes del antirobot", () => {
  const { antes } = cuposDe("pedir", "1.2.3.4", "knockout");
  assert.equal(antes.some((c) => c.clave.includes("negocio")), false);
});
test("cupos: el tope solo por IP de pedir no depende del slug; el de IP y restaurante sí", () => {
  const a = cuposDe("pedir", "1.2.3.4", "knockout").antes, b = cuposDe("pedir", "1.2.3.4", "slug-inventado-7").antes;
  assert.equal(a[0]!.clave, "tienda:pide:ip:1.2.3.4");
  assert.equal(b[0]!.clave, a[0]!.clave);
  // Lo que una red pide en un restaurante no le quita cupo en otro.
  assert.notEqual(a[1]!.clave, b[1]!.clave);
});
test("cupos: con IPv6 la clave es el /64, en leer y en pedir", () => {
  const ip = "2806:2f0:9000:ab:1111:2222:3333:4444";
  assert.equal(cuposDe("menu", ip, "knockout").antes[0]!.clave, "tienda:lee:ip:2806:2f0:9000:ab::/64");
  assert.deepEqual(cuposDe("pedir", ip, "knockout").antes.map((c) => c.clave),
    ["tienda:pide:ip:2806:2f0:9000:ab::/64", "tienda:pide:ip:2806:2f0:9000:ab::/64:knockout"]);
});
// Auditoría (B4): cuál de los cupos de `entrar` es el del restaurante, para dejarlo en el log al agotarse.
test("cupos: el tope de entradas del restaurante se reconoce por su clave, y el de la IP no", () => {
  const [porIp, porNegocio] = cuposDe("entrar", "1.2.3.4", "knockout").antes;
  assert.equal(esTopeDeEntradas(porNegocio!.clave), true);
  assert.equal(esTopeDeEntradas(porIp!.clave), false);
  for (const accion of ["pedir", "menu", "cuenta"] as const) {
    const c = cuposDe(accion, "1.2.3.4", "knockout");
    assert.equal([...c.antes, ...c.despuesDelCaptcha].some((x) => esTopeDeEntradas(x.clave)), false, accion);
  }
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

// ── Revisión final: TOTAL_CAMBIO lleva el total nuevo ───────────────────────────────────────────
test("rpc: TOTAL_CAMBIO es 409 y su detalle es el total nuevo, con dos decimales", () => {
  assert.deepEqual(respuestaDeRpc("TOTAL_CAMBIO: 125.50"), { status: 409, body: { error: "TOTAL_CAMBIO", detalle: "125.50" } });
  assert.deepEqual(respuestaDeRpc("TOTAL_CAMBIO: 0.00"), { status: 409, body: { error: "TOTAL_CAMBIO", detalle: "0.00" } });
  assert.deepEqual(respuestaDeRpc("TOTAL_CAMBIO: 13500.00"), { status: 409, body: { error: "TOTAL_CAMBIO", detalle: "13500.00" } });
});
test("rpc: un detalle de TOTAL_CAMBIO que no es un importe con dos decimales no sale", () => {
  for (const d of ["125.5", "125", "-1.00", "1,250.00", "NaN", "125.50 MXN", " 125.50", "1.000", "abc", "", "FUERA_DE_HORARIO", PROD, "relation x does not exist"]) {
    assert.deepEqual(respuestaDeRpc(`TOTAL_CAMBIO: ${d}`), { status: 409, body: { error: "TOTAL_CAMBIO" } }, JSON.stringify(d));
  }
});
test("rpc: un importe no vale como detalle de los otros códigos", () => {
  for (const codigo of ["TIENDA_CERRADA", "PRODUCTO_NO_DISPONIBLE", "MODIFICADORES_INVALIDOS", "COMBO_INVALIDO", "PAGO_INVALIDO"]) {
    assert.deepEqual(respuestaDeRpc(`${codigo}: 125.50`), { status: 409, body: { error: codigo } }, codigo);
  }
});

// ── Revisión final: lo que devuelve tienda_crear_pedido ─────────────────────────────────────────
test("pedido: de lo que devuelve el alta salen folio, total y vencimiento; el id interno no", () => {
  const alta = { pedido_id: "id-interno", folio_corto: "TAB12C", total_mxn: "120.00", vence_aceptacion: "2026-10-08T20:07:00+00:00", otra: 1 };
  assert.deepEqual(leerPedido(alta), { folio_corto: "TAB12C", total_mxn: "120.00", vence_aceptacion: "2026-10-08T20:07:00+00:00" });
});
// Auditoría (B3): la base dice si el pedido ya existía (un reintento); es para no repetir el correo,
// y no le sale al cliente.
test("pedido: ya_existia se lee aparte y nunca sale en lo que se le responde al cliente", () => {
  const alta = { pedido_id: "id-interno", folio_corto: "TAB12C", total_mxn: "120.00", vence_aceptacion: "2026-10-08T20:07:00+00:00", ya_existia: true };
  assert.deepEqual(leerPedido(alta), { folio_corto: "TAB12C", total_mxn: "120.00", vence_aceptacion: "2026-10-08T20:07:00+00:00" });
  assert.equal(yaExistia(alta), true);
  for (const x of [{ ...alta, ya_existia: false }, { ...alta, ya_existia: "true" }, { ...alta, ya_existia: 1 }, { folio_corto: "TAB12C" }, null, undefined, "true", [true]]) {
    assert.equal(yaExistia(x), false, JSON.stringify(x));
  }
});
test("pedido: NULL o una forma inesperada es null, no una excepción", () => {
  const bueno = { folio_corto: "TAB12C", total_mxn: "120.00", vence_aceptacion: "2026-10-08T20:07:00+00:00" };
  for (const x of [null, undefined, "x", 5, [], [bueno], {}, { ...bueno, folio_corto: "" }, { ...bueno, folio_corto: 7 }, { ...bueno, total_mxn: 120 },
                   { ...bueno, total_mxn: "120" }, { ...bueno, total_mxn: null }, { ...bueno, vence_aceptacion: null }, { ...bueno, vence_aceptacion: "" },
                   { folio_corto: "TAB12C", total_mxn: "120.00" }]) {
    assert.equal(leerPedido(x), null, JSON.stringify(x));
  }
});

// ════ Entrega 6: cuentas ════════════════════════════════════════════════════════════════════════
const H = "a".repeat(64);
// Entrega 7: además del de la IP, un tope por restaurante. El de la IP va primero: `consumirCupos`
// se detiene en el que no cabe, así que una sola red agotada no le gasta el cupo al restaurante.
test("cupos: entrar es 10 cada 10 min por IP y, después, 300 cada 10 min por restaurante; cierra", () => {
  assert.deepEqual(cuposDe("entrar", "1.2.3.4", "knockout"), {
    antes: [
      { clave: "tienda:entra:ip:1.2.3.4", ventanaSeg: 600, max: 10 },
      { clave: "tienda:entra:negocio:knockout", ventanaSeg: 600, max: 300 },
    ],
    despuesDelCaptcha: [], alFallar: "cerrar",
  });
});
test("cupos: registrar es 5 por hora por IP y, pasado el antirobot, 3 por hora por huella de correo+negocio; cierra", () => {
  assert.deepEqual(cuposDe("registrar", "1.2.3.4", "knockout", H), {
    antes: [{ clave: "tienda:registra:ip:1.2.3.4", ventanaSeg: 3600, max: 5 }],
    despuesDelCaptcha: [{ clave: `tienda:registra:correo:${H}`, ventanaSeg: 3600, max: 3 }], alFallar: "cerrar",
  });
});
test("cupos: pedir recuperación es 3 por hora por IP y, pasado el antirobot, 3 por hora por huella de correo+negocio; cierra", () => {
  assert.deepEqual(cuposDe("recuperar_pedir", "1.2.3.4", "knockout", H), {
    antes: [{ clave: "tienda:recupera:ip:1.2.3.4", ventanaSeg: 3600, max: 3 }],
    despuesDelCaptcha: [{ clave: `tienda:recupera:correo:${H}`, ventanaSeg: 3600, max: 3 }],
    alFallar: "cerrar",
  });
});
test("cupos: registrar o pedir recuperación sin la huella del correo es un error de quien llama, no un cupo de menos", () => {
  for (const accion of ["recuperar_pedir", "registrar"] as const) {
    assert.throws(() => cuposDe(accion, "1.2.3.4", "knockout"), accion);
    assert.throws(() => cuposDe(accion, "1.2.3.4", "knockout", "ana@example.com"), "un correo en claro no es una huella");
  }
});
test("cupos: el tope por correo de registrar y el de recuperar son bolsas distintas", () => {
  assert.notEqual(cuposDe("registrar", "1.2.3.4", "knockout", H).despuesDelCaptcha[0]!.clave, cuposDe("recuperar_pedir", "1.2.3.4", "knockout", H).despuesDelCaptcha[0]!.clave);
});
test("cupos: aplicar la recuperación es 10 por hora por IP y cierra", () => {
  assert.deepEqual(cuposDe("recuperar_aplicar", "1.2.3.4", "knockout"), {
    antes: [{ clave: "tienda:aplica:ip:1.2.3.4", ventanaSeg: 3600, max: 10 }], despuesDelCaptcha: [], alFallar: "cerrar",
  });
});
test("cupos: «Mi cuenta» tiene su bolsa (60 cada 10 min); leer y salir dejan pasar, cambiar cierra", () => {
  const bolsa = [{ clave: "tienda:cuenta:ip:1.2.3.4", ventanaSeg: 600, max: 60 }];
  for (const accion of ["cuenta", "mis_pedidos", "salir"] as const) {
    assert.deepEqual(cuposDe(accion, "1.2.3.4", "knockout"), { antes: bolsa, despuesDelCaptcha: [], alFallar: "abrir" }, accion);
  }
  for (const accion of ["cuenta_guardar", "cuenta_password", "direccion_guardar", "direccion_borrar", "eliminar_cuenta"] as const) {
    assert.deepEqual(cuposDe(accion, "1.2.3.4", "knockout"), { antes: bolsa, despuesDelCaptcha: [], alFallar: "cerrar" }, accion);
  }
});
test("cupos: ninguna acción de cuenta cae en la bolsa de lecturas, y con IPv6 la clave es el /64", () => {
  for (const accion of ["registrar", "entrar", "salir", "recuperar_pedir", "recuperar_aplicar", "cuenta", "cuenta_guardar",
                        "cuenta_password", "direccion_guardar", "direccion_borrar", "mis_pedidos", "eliminar_cuenta"] as const) {
    const { antes } = cuposDe(accion, "2806:2f0:9000:ab:1111:2222:3333:4444", "knockout", H);
    // `entrar` lleva además el tope del restaurante (entrega 7); el primero sigue siendo el de la IP.
    assert.equal(antes.length, accion === "entrar" ? 2 : 1, accion);
    assert.doesNotMatch(antes[0]!.clave, /:lee:|:pide:|:sigue:/, accion);
    assert.match(antes[0]!.clave, /:ip:2806:2f0:9000:ab::\/64$/, accion);
  }
});

test("rpc: datos de cuenta que la base rechaza son 400, sin su detalle; direcciones llenas, 409", () => {
  assert.deepEqual(respuestaDeRpc("CUENTA_INVALIDA_DATOS: el teléfono no tiene 10 dígitos"), { status: 400, body: { error: "CUENTA_INVALIDA_DATOS" } });
  assert.deepEqual(respuestaDeRpc("CUENTA_INVALIDA_DATOS"), { status: 400, body: { error: "CUENTA_INVALIDA_DATOS" } });
  assert.deepEqual(respuestaDeRpc("DIRECCIONES_LLENAS: ya hay 5"), { status: 409, body: { error: "DIRECCIONES_LLENAS" } });
  // Los que ya existían no cambian de estado: `pedir` los sigue recibiendo como 409.
  assert.deepEqual(respuestaDeRpc("DIRECCION_INVALIDA: al recoger no hay dirección"), { status: 409, body: { error: "DIRECCION_INVALIDA" } });
  assert.deepEqual(respuestaDeRpc("CUENTA_INVALIDA: la cuenta no existe en este negocio"), { status: 409, body: { error: "CUENTA_INVALIDA" } });
});
