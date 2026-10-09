import test from "node:test";
import assert from "node:assert/strict";
import { crearEspejo, codigoDeError } from "./delivery-espejo.mjs";

const CAJA = "cccccccc-0000-0000-0000-0000000000cc";
const NUBE = { cloudUrl: "https://nube.test", anonKey: "anon", deviceToken: "DEV" };

/** Base local de mentira: registra SQL y responde lo mínimo que usa el agente. */
function poolFalso({ turnoAbierto = true, locales = [], fallaTicket = null, fallaEspejoLocal = false, fallaTicketTienda = null, extrasTienda = [], reporte = [], fallaReporte = null } = {}) {
  const sql = [];
  const query = async (texto, params) => {
    sql.push({ texto, params });
    if (fallaEspejoLocal && texto.startsWith("INSERT INTO delivery_pedidos")) throw new Error("disco lleno");
    if (texto.startsWith("SELECT id, ticket_id, estado FROM delivery_pedidos")) return { rows: locales };
    if (texto.startsWith("SELECT 1 FROM turnos")) return { rows: turnoAbierto ? [{}] : [] };
    if (texto.startsWith("SELECT crear_ticket_desde_app")) { if (fallaTicket) throw new Error(fallaTicket); return { rows: [{ crear_ticket_desde_app: "tk-local" }] }; }
    if (texto.startsWith("SELECT crear_ticket_desde_tienda")) { if (fallaTicketTienda) throw fallaTicketTienda; return { rows: [{ crear_ticket_desde_tienda: "tk-tienda" }] }; }
    if (texto.startsWith("SELECT p.id, p.ultimo_error")) return { rows: extrasTienda };
    if (texto.startsWith("SELECT p.id, p.folio_corto, p.estado")) { if (fallaReporte) throw fallaReporte; return { rows: reporte }; }
    return { rows: [] };
  };
  return { sql, query, connect: async () => ({ query, release() {} }) };
}

/** Nube de mentira: responde delivery-espejo y delivery-accion y registra las llamadas. */
function nubeFalsa({ pedidos, conexiones = [{ id: "cx1", auto_aceptar: true, tiempo_prep_min: 12, config: {} }], reclamoOk = true, aceptarStatus = 200, siguienteEnMs = 10_000, tienda, alAceptar = null, alReportar = (b) => [200, { ok: true, estado: b.estado }] }) {
  const llamadas = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    llamadas.push({ url: String(url), auth: init.headers.Authorization, body });
    const resp = (status, obj) => new Response(JSON.stringify(obj), { status });
    if (String(url).endsWith("/delivery-espejo")) return resp(200, { ahora: "2026-09-03T10:00:00Z", caja_id: CAJA, sucursal_id: "s", conexiones, pedidos, siguiente_en_ms: siguienteEnMs, ...(tienda === undefined ? {} : { tienda }) });
    if (body.accion === "reclamar") return reclamoOk ? resp(200, { ok: true }) : resp(409, { error: "RECLAMADO_POR_OTRA_CAJA" });
    if (body.accion === "aceptar" && alAceptar) return resp(...alAceptar(body));
    if (body.accion === "aceptar") return aceptarStatus === 200 ? resp(200, { ok: true, gestion: "ESCRITORIO" }) : resp(aceptarStatus, { error: "UBER_ERROR" });
    if (body.accion === "rechazar") return resp(200, { ok: true });
    if (body.accion === "estado") return resp(...alReportar(body));
    return resp(400, { error: "ACCION_DESCONOCIDA" });
  };
  return { llamadas, fetchFn };
}

const pedido = (extra = {}) => ({
  id: "p1", tenant_id: "t", sucursal_id: "s", conexion_id: "cx1", app: "APP_UBEREATS", id_externo: "u-1", folio_corto: "2A003",
  estado: "RECIBIDO", gestion: "ESCRITORIO", gestion_caja_id: null, items: [], items_sin_mapear: null,
  vence_aceptacion: "2026-09-03T10:11:00Z", recibido_at: "2026-09-03T10:00:00Z", ...extra,
});

test("tick: espeja, reclama, crea el ticket local y acepta en Uber con el token de dispositivo", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido()] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.deepEqual(r, { espejados: 1, creados: 1, aceptados: 1, avisos: 0 });
  assert.ok(pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_conexiones")), "espeja conexiones");
  const up = pool.sql.find((q) => q.texto.startsWith("INSERT INTO delivery_pedidos"));
  assert.ok(up, "espeja pedidos");
  assert.ok(up.texto.includes('"ticket_id" = COALESCE(delivery_pedidos."ticket_id", EXCLUDED."ticket_id")'), "conserva el ticket local");
  assert.ok(pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app") && q.params[0] === "p1"), "crea el ticket local");
  const acciones = nube.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body.accion);
  assert.deepEqual(acciones, ["reclamar", "aceptar"]);
  assert.ok(nube.llamadas.every((l) => l.auth === "Bearer DEV"), "siempre con el token de dispositivo");
  assert.equal(nube.llamadas.at(-1).body.tiempo_prep_min, 12, "el accept lleva el prep de la conexión");
});

test("tick: si otra caja ya reclamó, no crea ticket ni acepta", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido()], reclamoOk: false });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.equal(r.creados, 0);
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app")));
  assert.deepEqual(nube.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body.accion), ["reclamar"]);
});

test("tick: sin turno abierto solo espeja; el ticket local que falla deja ultimo_error", async () => {
  const sinTurno = poolFalso({ turnoAbierto: false });
  const n1 = nubeFalsa({ pedidos: [pedido()] });
  const r1 = await crearEspejo({ pool: sinTurno, nube: async () => NUBE, cajaId: CAJA, fetchFn: n1.fetchFn }).tick();
  assert.deepEqual(r1, { espejados: 1, creados: 0, aceptados: 0, avisos: 0 });

  const falla = poolFalso({ fallaTicket: "ITEM_SIN_MAPEAR: Malteada" });
  const n2 = nubeFalsa({ pedidos: [pedido({ estado: "ACEPTADO" })] });
  const r2 = await crearEspejo({ pool: falla, nube: async () => NUBE, cajaId: CAJA, fetchFn: n2.fetchFn }).tick();
  assert.equal(r2.creados, 0);
  const err = falla.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.ok(err && err.params[1] === "ITEM_SIN_MAPEAR", "deja el código en ultimo_error");
  assert.ok(!n2.llamadas.some((l) => l.body.accion === "aceptar"), "no acepta si no hay ticket");
});

test("si el accept en Uber falla tras crear el ticket, la vuelta siguiente lo reintenta sin duplicar el ticket (D7)", async () => {
  // Vuelta 1: ticket creado, accept rechazado.
  const pool1 = poolFalso();
  const n1 = nubeFalsa({ pedidos: [pedido()], aceptarStatus: 502 });
  const r1 = await crearEspejo({ pool: pool1, nube: async () => NUBE, cajaId: CAJA, fetchFn: n1.fetchFn }).tick();
  assert.equal(r1.creados, 1);
  assert.equal(r1.aceptados, 0);
  // Vuelta 2: la nube lo sigue mandando RECIBIDO (ya reclamado por esta caja) y la copia local ya
  // tiene el ticket. Antes se saltaba para siempre; ahora se vuelve a aceptar.
  const pool2 = poolFalso({ locales: [{ id: "p1", ticket_id: "tk-local", estado: "RECIBIDO" }] });
  const n2 = nubeFalsa({ pedidos: [pedido({ gestion_caja_id: CAJA })] });
  const r2 = await crearEspejo({ pool: pool2, nube: async () => NUBE, cajaId: CAJA, fetchFn: n2.fetchFn }).tick();
  assert.equal(r2.creados, 0, "no se crea un segundo ticket");
  assert.equal(r2.aceptados, 1);
  assert.ok(!pool2.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app")));
  assert.deepEqual(n2.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body.accion), ["aceptar"]);
});

test("tick: la app canceló un pedido con ticket local → aviso; sin nube → omitido", async () => {
  const pool = poolFalso({ locales: [{ id: "p1", ticket_id: "tk", estado: "ACEPTADO" }] });
  const nube = nubeFalsa({ pedidos: [pedido({ estado: "CANCELADO" })] });
  const r = await crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn }).tick();
  assert.equal(r.avisos, 1);
  const av = pool.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.ok(av && /cancel/i.test(av.params[1]));
  const sin = await crearEspejo({ pool: poolFalso(), nube: async () => null, cajaId: CAJA, fetchFn: nube.fetchFn }).tick();
  assert.deepEqual(sin, { omitido: "sin nube" });
});

test("tras un 401 pide token nuevo con forzar y reintenta; el log dice vigencia y sesión, no el token", async () => {
  const { resumenToken } = await import("./delivery-espejo.mjs");
  const carga = Buffer.from(JSON.stringify({ exp: 1_000_000_000 + 3600, iat: 1_000_000_000, session_id: "abcdef12-0000", sub: "secreto" })).toString("base64url");
  const jwt = `h.${carga}.f`;
  const r = resumenToken(jwt, 1_000_000_000 * 1000 + 60_000);
  assert.match(r, /emitido hace 60s, vence en 3540s, sesión abcdef12/);
  assert.doesNotMatch(r, /secreto/);

  const pool = poolFalso();
  const pedidos = [];
  let llamadasNube = 0;
  const forzados = [];
  const nube = async ({ forzar } = {}) => { llamadasNube++; forzados.push(forzar === true); return { ...NUBE, deviceToken: jwt }; };
  let respuestas = 0;
  const fetchFn = async () => {
    respuestas++;
    return respuestas === 1
      ? new Response(JSON.stringify({ error: "AUTH_INVALIDA", detalle: "session not found" }), { status: 401 })
      : new Response(JSON.stringify({ ahora: "x", caja_id: CAJA, sucursal_id: "s", conexiones: [], pedidos }), { status: 200 });
  };
  const logs = [];
  const agente = crearEspejo({ pool, nube, cajaId: CAJA, fetchFn, log: (m) => logs.push(m) });
  const r1 = await agente.tick();
  assert.equal(r1.error, 401);
  assert.ok(logs.some((m) => /token rechazado \(session not found\)/.test(m) && /sesión abcdef12/.test(m) && !m.includes(jwt)));
  const r2 = await agente.tick();
  assert.equal(r2.error, undefined);
  assert.equal(llamadasNube, 2, "el segundo tick volvió a pedir token");
  assert.deepEqual(forzados, [false, true], "el segundo login fue forzado");
});

// ── Delta y ritmo (optimización 2026-09-09) ──────────────────────────────────
// El agente sondeaba cada 10 s y se traía TODOS los pedidos de las últimas 24 h en cada vuelta,
// tuviera el cliente delivery o no. Ahora pide solo lo que cambió y el servidor le dice cuándo
// volver.

/** Captura las esperas que programa el agente, sin relojes de verdad. */
function relojFalso() {
  const esperas = [];
  return {
    esperas,
    setTimeoutFn: (fn, ms) => { esperas.push(ms); return { unref() {} }; },
    clearTimeoutFn: () => {},
  };
}
const centro = () => 0.5; // jitter neutro

test("el primer sondeo va sin cursor; el siguiente pide solo lo que cambió", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido({ updated_at: "2026-09-03T10:00:05Z" })] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  await agente.tick();
  await agente.tick();
  const sondeos = nube.llamadas.filter((l) => l.url.endsWith("/delivery-espejo"));
  assert.equal(sondeos[0].body.desde, undefined, "el primero va en frío");
  assert.equal(sondeos[1].body.desde, "2026-09-03T10:00:05Z", "el segundo lleva el cursor");
});

test("sin pedidos que espejar no se toca la tabla local de pedidos, pero las conexiones sí", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.equal(r.espejados, 0);
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT id, ticket_id, estado FROM delivery_pedidos")));
  // Entrega 4 de la tienda: el turno SÍ se consulta en cada vuelta, porque viaja en el sondeo
  // (`turno_abierto`) y la nube decide con él si la tienda recibe pedidos. Una sola vez.
  assert.equal(pool.sql.filter((q) => q.texto.startsWith("SELECT 1 FROM turnos")).length, 1, "el turno se consulta una vez por vuelta");
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_pedidos")));
  assert.ok(pool.sql.some((q) => q.texto.startsWith("INSERT INTO delivery_conexiones")), "las conexiones sí se espejan");
});

test("la caja obedece la cadencia que manda el servidor", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 300_000 });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 300_000);
});

test("un servidor que no manda cadencia deja el ritmo de siempre: no rompe con nubes viejas", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: null });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 10_000);
});

test("tras un sondeo fallido la caja espera más, en vez de martillear cada 10 s", async () => {
  const pool = poolFalso();
  const reloj = relojFalso();
  const agente = crearEspejo({
    pool, nube: async () => NUBE, cajaId: CAJA, aleatorio: centro, ...reloj,
    fetchFn: async () => { throw new Error("sin red"); },
  });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 20_000, "primer fallo: el doble");
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 40_000, "segundo fallo: el doble otra vez");
});

test("un sondeo bueno después de fallar borra el backoff", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 30_000 });
  const reloj = relojFalso();
  let rompe = true;
  const agente = crearEspejo({
    pool, nube: async () => NUBE, cajaId: CAJA, aleatorio: centro, ...reloj,
    fetchFn: async (...a) => { if (rompe) throw new Error("sin red"); return nube.fetchFn(...a); },
  });
  await agente.vuelta();
  rompe = false;
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 30_000);
});

test("con un ticket local pendiente la caja no se duerme aunque el servidor mande reposo", async () => {
  const pool = poolFalso({ fallaTicket: "SIN_TURNO_ABIERTO" }); // el ticket no se pudo crear: queda pendiente
  const nube = nubeFalsa({ pedidos: [pedido({ estado: "ACEPTADO" })], siguienteEnMs: 300_000 });
  const reloj = relojFalso();
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(reloj.esperas.at(-1), 10_000);
});

test("si el espejo local falla, el cursor no avanza: la vuelta siguiente vuelve a pedir lo mismo", async () => {
  const pool = poolFalso({ fallaEspejoLocal: true });
  const nube = nubeFalsa({ pedidos: [pedido({ updated_at: "2026-09-03T10:00:05Z" })] });
  const agente = crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn });
  const r = await agente.tick();
  assert.ok(r.error, "la vuelta falló");
  await agente.tick();
  const sondeos = nube.llamadas.filter((l) => l.url.endsWith("/delivery-espejo"));
  assert.equal(sondeos[1].body.desde, undefined, "sigue en frío hasta que el espejo local cuaje");
});

test("codigoDeError traduce los errores de combo (Task 7) y los que ya existían; lo demás se deja tal cual", () => {
  // Texto libre de agregar_combo_a_ticket (0111_combos.sql) — se reconoce por una frase estable.
  assert.equal(codigoDeError('El slot "Bebida" requiere entre 1 y 1 selecciones (recibió 0)'), "COMBO_INCOMPLETO");
  assert.equal(codigoDeError('El producto "Doble" está agotado o pausado'), "PRODUCTO_AGOTADO");
  assert.equal(codigoDeError('El producto "Papas chicas" no es opción del slot "Guarnición"'), "COMBO_OPCION_INVALIDA");
  // Revisión final, punto 6: sexto mensaje sin traducir. Aparece cuando alguien desactiva una
  // opción de un slot en el admin mientras Uber sigue vendiendo la carta vieja.
  assert.equal(codigoDeError('El producto "Papas chicas" está excluido del slot "Guarnición"'), "COMBO_OPCION_EXCLUIDA");

  // Con prefijo de crear_ticket_desde_app (0112_combos_uber.sql) — el código ya viene en el mensaje.
  assert.equal(
    codigoDeError(
      'COMBO_ELECCION_SIN_MAPEAR: el combo "Promo doble" trae una elección que no es un slot activo de este combo o cuyo producto no está mapeado en el catálogo',
    ),
    "COMBO_ELECCION_SIN_MAPEAR",
  );
  assert.equal(
    codigoDeError(
      'COMBO_ELECCION_AMBIGUA: el combo "Promo doble" repite la misma elección de slot con modificadores de segundo nivel en alguna de las repeticiones; no se puede saber a qué unidad va cada extra',
    ),
    "COMBO_ELECCION_AMBIGUA",
  );

  // Los dos códigos que ya se traducían siguen igual, con el formato real que manda la RPC ("CODIGO: resto").
  assert.equal(codigoDeError("SIN_TURNO_ABIERTO: sucursal s1"), "SIN_TURNO_ABIERTO");
  assert.equal(codigoDeError("ITEM_SIN_MAPEAR: Malteada (sin producto genérico configurado)"), "ITEM_SIN_MAPEAR");

  // Anclado: el nombre de un producto que por casualidad contenga el texto de un código con
  // prefijo no debe disparar ese código — solo cuenta si el mensaje EMPIEZA con "CODIGO:".
  assert.equal(codigoDeError('El producto "Combo ITEM_SIN_MAPEAR especial" está agotado o pausado'), "PRODUCTO_AGOTADO");

  // Lo no reconocido se devuelve tal cual (prueba original del brief): mejor un mensaje feo que
  // esconder un fallo que nadie previó.
  assert.equal(codigoDeError("algo raro de postgres"), "algo raro de postgres");
  assert.equal(codigoDeError("SIN_TURNO_ABIERTO"), "SIN_TURNO_ABIERTO");
});

test("codigoDeError: un componente que la sucursal no vende (0152)", () => {
  assert.equal(codigoDeError('El producto "Papas" no se vende en esta sucursal'), "PRODUCTO_NO_SE_VENDE");
  assert.equal(codigoDeError('El producto "Papas" está agotado o pausado'), "PRODUCTO_AGOTADO");
});

// ── Tienda en línea (entrega 4) ──────────────────────────────────────────────

const AUTO = { participa: true, aceptacion: "AUTO", pausa_hasta: null };
const MANUAL = { participa: true, aceptacion: "MANUAL", pausa_hasta: null };
const pedidoT = (extra = {}) => pedido({
  id: "t1", canal: "TIENDA", conexion_id: null, app: "DRIVE_THRU", id_externo: "tienda-1", folio_corto: "T-014",
  cliente_email: "ana@correo.mx", tienda_cuenta_id: null, zona_envio_id: null, direccion: null,
  pago_al_recibir: "EFECTIVO", paga_con_mxn: "200.00", ...extra,
});
const acciones = (nube) => nube.llamadas.filter((l) => l.url.endsWith("/delivery-accion")).map((l) => l.body);
const agenteCon = (pool, nube, extra = {}) => crearEspejo({ pool, nube: async () => NUBE, cajaId: CAJA, fetchFn: nube.fetchFn, ...extra });

test("codigoDeError conoce los códigos de crear_ticket_desde_tienda", () => {
  for (const c of ["TOTAL_NO_COINCIDE", "ENVIO_NO_COINCIDE", "DIRECCION_INVALIDA", "CLIENTE_BLOQUEADO", "PRODUCTO_DE_OTRO_NEGOCIO", "OPCION_DE_OTRO_NEGOCIO", "SUCURSAL_DE_OTRO_NEGOCIO"]) {
    assert.equal(codigoDeError(`${c}: lo que sea`), c);
  }
});

test("cada sondeo declara la tienda y dice si hay turno abierto, consultado antes de llamar", async () => {
  for (const turnoAbierto of [true, false]) {
    const pool = poolFalso({ turnoAbierto });
    const nube = nubeFalsa({ pedidos: [] });
    await agenteCon(pool, nube).tick();
    const sondeo = nube.llamadas.find((l) => l.url.endsWith("/delivery-espejo"));
    assert.equal(sondeo.body.tienda, true);
    assert.equal(sondeo.body.turno_abierto, turnoAbierto);
    const turno = pool.sql.find((q) => q.texto.startsWith("SELECT 1 FROM turnos"));
    assert.deepEqual(turno.params, [CAJA], "la sucursal sale de la fila local de esta caja");
    assert.match(turno.texto, /JOIN cajas/);
  }
});

test("una fila de la tienda se guarda con sus columnas; una sin canal (nube vieja) se guarda como APP", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({
    pedidos: [pedidoT({ app: "DELIVERY_PROPIO", zona_envio_id: "z1", direccion: { calle: "Av. X", numero_exterior: "100" } }), pedido()],
    conexiones: [{ id: "cx1", auto_aceptar: false, config: {} }], tienda: MANUAL,
  });
  await agenteCon(pool, nube).tick();
  const ups = pool.sql.filter((q) => q.texto.startsWith("INSERT INTO delivery_pedidos"));
  assert.equal(ups.length, 2);
  const cols = [...ups[0].texto.match(/\(([^)]*)\) VALUES/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const fila = (q) => Object.fromEntries(cols.map((c, i) => [c, q.params[i]]));
  const t = fila(ups[0]);
  assert.equal(t.canal, "TIENDA");
  assert.equal(t.cliente_email, "ana@correo.mx");
  assert.equal(t.zona_envio_id, "z1");
  assert.equal(t.direccion, JSON.stringify({ calle: "Av. X", numero_exterior: "100" }), "jsonb viaja como texto JSON");
  assert.equal(t.pago_al_recibir, "EFECTIVO");
  assert.equal(t.paga_con_mxn, "200.00");
  assert.equal(t.conexion_id, null);
  const u = fila(ups[1]);
  assert.equal(u.canal, "APP");
  assert.equal(u.direccion, null);
});

test("tienda con aceptación MANUAL: el pedido se espeja y espera al cajero", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT()], tienda: MANUAL });
  const r = await agenteCon(pool, nube).tick();
  assert.deepEqual(r, { espejados: 1, creados: 0, aceptados: 0, avisos: 0 });
  assert.deepEqual(acciones(nube), []);
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_")));
});

test("tienda con aceptación AUTO y turno: reclama, crea el ticket con crear_ticket_desde_tienda y acepta", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT()], tienda: AUTO });
  const r = await agenteCon(pool, nube).tick();
  assert.deepEqual(r, { espejados: 1, creados: 1, aceptados: 1, avisos: 0 });
  assert.ok(pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_tienda") && q.params[0] === "t1"));
  assert.ok(!pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_app")), "nunca por el camino de las apps");
  assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }, { accion: "aceptar", pedido_id: "t1" }]);
});

test("tienda AUTO sin turno abierto: no crea nada; una nube que no manda la clave tienda, tampoco", async () => {
  const sinTurno = poolFalso({ turnoAbierto: false });
  const n1 = nubeFalsa({ pedidos: [pedidoT()], tienda: AUTO });
  assert.deepEqual(await agenteCon(sinTurno, n1).tick(), { espejados: 1, creados: 0, aceptados: 0, avisos: 0 });
  assert.deepEqual(acciones(n1), []);
  const pool = poolFalso();
  const n2 = nubeFalsa({ pedidos: [pedidoT()] });
  assert.deepEqual(await agenteCon(pool, n2).tick(), { espejados: 1, creados: 0, aceptados: 0, avisos: 0 });
});

test("tienda ACEPTADO sin ticket local (lo aceptó el cajero): crea el ticket y no vuelve a aceptar", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL });
  const r = await agenteCon(pool, nube).tick();
  assert.equal(r.creados, 1);
  assert.ok(pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_tienda")));
  assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }]);
});

test("tienda: un fallo reintentable deja el pedido como está y la caja vuelve pronto", async () => {
  const unicidad = Object.assign(new Error('duplicate key value violates unique constraint "clientes_tenant_telefono_uq"'), { code: "23505" });
  for (const falla of [new Error("SIN_TURNO_ABIERTO: sucursal s"), unicidad, new Error("canceling statement due to statement timeout")]) {
    const pool = poolFalso({ fallaTicketTienda: falla });
    const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL, siguienteEnMs: 300_000 });
    const reloj = relojFalso();
    const agente = agenteCon(pool, nube, { aleatorio: centro, ...reloj });
    await agente.vuelta();
    assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }], `${falla.message}: ni rechaza ni cancela`);
    assert.equal(reloj.esperas.at(-1), 10_000, "queda pendiente: se reintenta pronto");
  }
});

test("tienda: un fallo que no se arregla reintentando rechaza el pedido RECIBIDO y se lo explica al cajero", async () => {
  const pool = poolFalso({ fallaTicketTienda: new Error("TOTAL_NO_COINCIDE: ticket 150.00 vs pedido 140.00") });
  const nube = nubeFalsa({ pedidos: [pedidoT()], tienda: AUTO });
  const r = await agenteCon(pool, nube).tick();
  assert.equal(r.creados, 0);
  assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }, { accion: "rechazar", pedido_id: "t1", motivo: "OTRO" }]);
  const err = pool.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.equal(err.params[0], "t1");
  assert.match(err.params[1], /cancel/i);
  assert.doesNotMatch(err.params[1], /TOTAL_NO_COINCIDE/, "texto para el cajero, no el código");
});

test("tienda: el mismo fallo sobre un pedido ya ACEPTADO lo reporta CANCELADO con motivo OTRO", async () => {
  const pool = poolFalso({ fallaTicketTienda: new Error("Producto 7d1e no existe o está eliminado") });
  const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL });
  await agenteCon(pool, nube).tick();
  assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }, { accion: "estado", pedido_id: "t1", estado: "CANCELADO", motivo: "OTRO" }]);
  assert.ok(pool.sql.some((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error") && /cancel/i.test(q.params[1])));
});

test("tienda: si la nube no tomó la cancelación, la caja vuelve pronto a intentarlo", async () => {
  const pool = poolFalso({ fallaTicketTienda: new Error("DIRECCION_INVALIDA: pedido t1") });
  const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL, siguienteEnMs: 300_000, alReportar: () => [502, { error: "RPC_ERROR" }] });
  const reloj = relojFalso();
  await agenteCon(pool, nube, { aleatorio: centro, ...reloj }).vuelta();
  assert.equal(reloj.esperas.at(-1), 10_000);
});

test("un pedido de Uber en la misma vuelta sigue su camino de siempre", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT({ vence_aceptacion: "2026-09-03T10:05:00Z" }), pedido()], tienda: AUTO });
  const r = await agenteCon(pool, nube).tick();
  assert.deepEqual(r, { espejados: 2, creados: 2, aceptados: 2, avisos: 0 });
  assert.deepEqual(pool.sql.filter((q) => q.texto.startsWith("SELECT crear_ticket_desde_")).map((q) => [q.texto, q.params[0]]), [
    ["SELECT crear_ticket_desde_tienda($1)", "t1"],
    ["SELECT crear_ticket_desde_app($1)", "p1"],
  ]);
  assert.deepEqual(acciones(nube), [
    { accion: "reclamar", pedido_id: "t1" }, { accion: "aceptar", pedido_id: "t1" },
    { accion: "reclamar", pedido_id: "p1" }, { accion: "aceptar", pedido_id: "p1", tiempo_prep_min: 12 },
  ]);
});

test("la nube cerró un pedido de la tienda con ticket local abierto → aviso; con el ticket ya cancelado, no", async () => {
  const abierto = poolFalso({ locales: [{ id: "t1", ticket_id: "tk", estado: "ACEPTADO" }], extrasTienda: [{ id: "t1", ultimo_error: null, ticket_estado: "ABIERTO" }] });
  const n1 = nubeFalsa({ pedidos: [pedidoT({ estado: "EXPIRADO" })], tienda: MANUAL });
  assert.equal((await agenteCon(abierto, n1).tick()).avisos, 1);
  const av = abierto.sql.find((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  assert.equal(av.params[1], "El pedido en línea se canceló: cancela el ticket en caja");
  const cancelado = poolFalso({ locales: [{ id: "t1", ticket_id: "tk", estado: "CANCELADO" }], extrasTienda: [{ id: "t1", ultimo_error: null, ticket_estado: "CANCELADO" }] });
  const n2 = nubeFalsa({ pedidos: [pedidoT({ estado: "CANCELADO" })], tienda: MANUAL });
  assert.equal((await agenteCon(cancelado, n2).tick()).avisos, 0);
});

// ── Reporte de estado ────────────────────────────────────────────────────────
const filaReporte = (extra = {}) => ({ id: "t1", folio_corto: "T-014", estado: "ACEPTADO", ticket_estado: "ABIERTO", ticket_impreso_at: null, asignado: false, ...extra });
const estadosLocales = (pool) => pool.sql.filter((q) => q.texto.startsWith("UPDATE delivery_pedidos SET estado")).map((q) => q.params);

test("reporte: el ticket impreso, asignado, cobrado o cancelado se le dice a la nube, y se guarda lo que ella responde", async () => {
  const casos = [
    [{ ticket_impreso_at: "2026-10-09T10:00:00Z" }, "LISTO"],
    [{ asignado: true }, "LISTO"],
    [{ ticket_estado: "PAGADO" }, "ENTREGADO"],
    [{ ticket_estado: "FACTURADO", estado: "LISTO" }, "ENTREGADO"],
    [{ ticket_estado: "CANCELADO", estado: "LISTO" }, "CANCELADO"],
  ];
  for (const [extra, esperado] of casos) {
    const pool = poolFalso({ reporte: [filaReporte(extra)] });
    const nube = nubeFalsa({ pedidos: [] });
    await agenteCon(pool, nube).tick();
    assert.deepEqual(acciones(nube), [{ accion: "estado", pedido_id: "t1", estado: esperado }], JSON.stringify(extra));
    assert.deepEqual(estadosLocales(pool), [["t1", esperado]]);
  }
});

test("reporte: sin nada nuevo que decir no se llama a la nube", async () => {
  // (Entrega 7: un ACEPTADO con ticket abierto YA tiene algo que decir —«ya lo tengo»—; salió de esta lista.)
  for (const extra of [{ estado: "LISTO", ticket_impreso_at: "2026-10-09T10:00:00Z" }, { estado: "EN_PREPARACION" }]) {
    const pool = poolFalso({ reporte: [filaReporte(extra)] });
    const nube = nubeFalsa({ pedidos: [] });
    await agenteCon(pool, nube).tick();
    assert.deepEqual(acciones(nube), [], JSON.stringify(extra));
  }
});

test("reporte: la consulta solo mira pedidos de la tienda con ticket y vivos", async () => {
  const pool = poolFalso();
  await agenteCon(pool, nubeFalsa({ pedidos: [] })).tick();
  const q = pool.sql.find((x) => x.texto.startsWith("SELECT p.id, p.folio_corto, p.estado"));
  assert.ok(q, "se consulta en cada vuelta");
  assert.match(q.texto, /JOIN tickets t ON t\.id = p\.ticket_id/);
  assert.match(q.texto, /t\.estado_fiscal AS ticket_estado/, "el estado del ticket es estado_fiscal: `tickets.estado` no existe");
  assert.match(q.texto, /delivery_asignaciones/);
  assert.match(q.texto, /p\.canal = 'TIENDA'/);
  assert.match(q.texto, /p\.gestion = 'ESCRITORIO'/, "los del POS web los pone al día la nube; reportarlos daría 409");
  assert.match(q.texto, /p\.estado IN \('ACEPTADO', 'EN_PREPARACION', 'LISTO'\)/);
});

test("reporte: si la nube lo rechaza o se cae, el estado local no cambia", async () => {
  for (const [status, espera] of [[502, 10_000], [404, 300_000]]) {
    const pool = poolFalso({ reporte: [filaReporte({ ticket_estado: "PAGADO" })] });
    const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 300_000, alReportar: () => [status, { error: "X" }] });
    const reloj = relojFalso();
    await agenteCon(pool, nube, { aleatorio: centro, ...reloj }).vuelta();
    assert.deepEqual(estadosLocales(pool), [], `HTTP ${status}`);
    assert.equal(reloj.esperas.at(-1), espera, `HTTP ${status}: solo una caída se reintenta con prisa`);
  }
});

test("reporte: una respuesta que no avanza se guarda y NO se repite en cada vuelta; si algo cambia, sí", async () => {
  // Reporté LISTO y la nube dice que quedó ACEPTADO (no debería pasar; si pasa, no se martillea).
  const fila = filaReporte({ ticket_impreso_at: "2026-10-09T10:00:00Z" });
  const pool = poolFalso({ reporte: [fila] });
  const nube = nubeFalsa({ pedidos: [], alReportar: () => [200, { ok: true, estado: "ACEPTADO" }] });
  const logs = [];
  const agente = agenteCon(pool, nube, { log: (m) => logs.push(m) });
  await agente.tick();
  await agente.tick();
  await agente.tick();
  assert.equal(acciones(nube).length, 1, "una sola llamada en tres vueltas");
  assert.equal(logs.filter((m) => /LISTO/.test(m)).length, 1, "y un solo renglón en el log");
  assert.equal(agente.estado().pendiente, false, "no deja a la caja sondeando con prisa");
  // El ticket se cobra: ahora hay otra cosa que decir, y se dice.
  fila.ticket_estado = "PAGADO";
  await agente.tick();
  assert.deepEqual(acciones(nube).map((b) => b.estado), ["LISTO", "ENTREGADO"]);
});

test("reporte: una nube 4xx tampoco se martillea, pero un 401 sí se reintenta en la vuelta siguiente", async () => {
  const pool = poolFalso({ reporte: [filaReporte({ ticket_estado: "PAGADO" })] });
  const n400 = nubeFalsa({ pedidos: [], alReportar: () => [400, { error: "ACCION_DESCONOCIDA" }] });
  const a = agenteCon(pool, n400);
  await a.tick(); await a.tick();
  assert.equal(acciones(n400).length, 1);
  const n401 = nubeFalsa({ pedidos: [], alReportar: () => [401, { error: "AUTH_INVALIDA" }] });
  const b = agenteCon(poolFalso({ reporte: [filaReporte({ ticket_estado: "PAGADO" })] }), n401);
  await b.tick(); await b.tick();
  assert.equal(acciones(n401).length, 2);
});

// ── Ronda de arreglos tras la revisión ───────────────────────────────────────
const avisosAlCajero = (pool) => pool.sql.filter((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error")).map((q) => q.params);

test("tienda: un producto agotado en un pedido ya ACEPTADO lo cancela en vez de reintentar sin fin", async () => {
  for (const m of ['El producto "Doble" está agotado o pausado', 'El producto "Papas" no se vende en esta sucursal', 'El slot "Bebida" requiere entre 1 y 1 selecciones (recibió 0)']) {
    const pool = poolFalso({ fallaTicketTienda: new Error(m) });
    const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL, siguienteEnMs: 300_000 });
    const reloj = relojFalso();
    await agenteCon(pool, nube, { aleatorio: centro, ...reloj }).vuelta();
    assert.deepEqual(acciones(nube).at(-1), { accion: "estado", pedido_id: "t1", estado: "CANCELADO", motivo: "OTRO" }, m);
    assert.equal(reloj.esperas.at(-1), 300_000, "cancelado: no queda nada pendiente");
  }
});

test("tienda: «no existe» en un pedido de menos de 3 minutos espera al catálogo; pasado ese tiempo, cancela", async () => {
  const recibido = "2026-10-09T10:00:00Z";
  const t0 = Date.parse(recibido);
  for (const m of ["Producto 7d1e no existe o está eliminado", "Opción de modificador 7d1e no existe", "Zona de envío 7d1e no existe, está inactiva o no es de esta sucursal"]) {
    for (const [edad, cancela] of [[30_000, false], [179_999, false], [180_000, true]]) {
      const pool = poolFalso({ fallaTicketTienda: new Error(m) });
      const nube = nubeFalsa({ pedidos: [pedidoT({ recibido_at: recibido })], tienda: AUTO });
      const agente = agenteCon(pool, nube, { ahora: () => t0 + edad });
      await agente.tick();
      const bajas = acciones(nube).filter((b) => b.accion === "rechazar");
      assert.equal(bajas.length, cancela ? 1 : 0, `${m} a los ${edad} ms`);
      assert.equal(agente.estado().pendiente, !cancela, "mientras espera, vuelve pronto");
    }
  }
  // Lo que no depende del catálogo no espera: un total que no coincide cancela aunque acabe de llegar.
  const pool = poolFalso({ fallaTicketTienda: new Error("TOTAL_NO_COINCIDE: ticket 1 vs pedido 2") });
  const nube = nubeFalsa({ pedidos: [pedidoT({ recibido_at: recibido })], tienda: AUTO });
  await agenteCon(pool, nube, { ahora: () => t0 + 1_000 }).tick();
  assert.equal(acciones(nube).filter((b) => b.accion === "rechazar").length, 1);
});

test("tienda: el «se canceló solo» se escribe solo cuando la nube confirmó la baja", async () => {
  const falla = () => poolFalso({ fallaTicketTienda: new Error("DIRECCION_INVALIDA: pedido t1") });
  const caida = falla();
  await agenteCon(caida, nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL, alReportar: () => [502, { error: "RPC_ERROR" }] })).tick();
  assert.deepEqual(avisosAlCajero(caida), [], "la nube no la tomó: el pedido sigue vivo y no se dice que se canceló");
  const tomada = falla();
  await agenteCon(tomada, nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL })).tick();
  assert.equal(avisosAlCajero(tomada).length, 1);
  assert.match(avisosAlCajero(tomada)[0][1], /se canceló solo/);
  // El orden: primero la llamada a la nube, después el texto.
  const iBaja = tomada.sql.findIndex((q) => q.texto.startsWith("UPDATE delivery_pedidos SET ultimo_error"));
  const iTicket = tomada.sql.findIndex((q) => q.texto.startsWith("SELECT crear_ticket_desde_tienda"));
  assert.ok(iBaja > iTicket);
});

test("tienda: ACCION_INVALIDA al aceptar tras crear el ticket no cuenta como aceptado y deja el aviso ya", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT()], tienda: AUTO, siguienteEnMs: 300_000, alAceptar: () => [409, { error: "ACCION_INVALIDA" }] });
  const logs = [];
  const reloj = relojFalso();
  const agente = agenteCon(pool, nube, { log: (m) => logs.push(m), aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.deepEqual(acciones(nube).map((b) => b.accion), ["reclamar", "aceptar"], "el orden crear → aceptar no cambia");
  assert.ok(pool.sql.some((q) => q.texto.startsWith("SELECT crear_ticket_desde_tienda")));
  assert.deepEqual(avisosAlCajero(pool), [["t1", "El pedido en línea se canceló: cancela el ticket en caja"]]);
  assert.ok(logs.some((m) => /T-014/.test(m) && /cerrado/.test(m)));
  assert.ok(!logs.some((m) => /1 aceptados/.test(m)), "no se cuenta como aceptado");
  assert.equal(reloj.esperas.at(-1), 300_000, "no hay nada que reintentar");
  // Lo mismo si el accept era un reintento de una vuelta anterior (el ticket ya existía).
  const pool2 = poolFalso({ locales: [{ id: "t1", ticket_id: "tk", estado: "RECIBIDO" }] });
  const nube2 = nubeFalsa({ pedidos: [pedidoT({ gestion_caja_id: CAJA })], tienda: AUTO, alAceptar: () => [409, { error: "ACCION_INVALIDA", estado: "EXPIRADO" }] });
  const r2 = await agenteCon(pool2, nube2).tick();
  assert.equal(r2.aceptados, 0);
  assert.equal(avisosAlCajero(pool2).length, 1);
});

test("tienda: si ACCION_INVALIDA dice que el pedido ya está aceptado (lo aceptó otra pantalla), no hay aviso", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedidoT()], tienda: AUTO, alAceptar: () => [409, { error: "ACCION_INVALIDA", estado: "ACEPTADO" }] });
  const r = await agenteCon(pool, nube).tick();
  assert.equal(r.aceptados, 1);
  assert.deepEqual(avisosAlCajero(pool), []);
});

test("Uber: ACCION_INVALIDA al aceptar se sigue dando por aceptado, sin aviso (como siempre)", async () => {
  const pool = poolFalso();
  const nube = nubeFalsa({ pedidos: [pedido()], alAceptar: () => [409, { error: "ACCION_INVALIDA", estado: "CANCELADO" }] });
  const r = await agenteCon(pool, nube).tick();
  assert.deepEqual(r, { espejados: 1, creados: 1, aceptados: 1, avisos: 0 });
  assert.deepEqual(avisosAlCajero(pool), []);
});

test("reporte: tope de 48 horas, y una excepción ahí no le mete backoff al sondeo", async () => {
  const pool = poolFalso({ fallaReporte: new Error("el backend local se está reiniciando") });
  const nube = nubeFalsa({ pedidos: [pedido()], siguienteEnMs: 30_000 });
  const logs = [];
  const reloj = relojFalso();
  const agente = agenteCon(pool, nube, { log: (m) => logs.push(m), aleatorio: centro, ...reloj });
  await agente.vuelta();
  assert.equal(agente.estado().fallos, 0, "el sondeo no cuenta como fallido");
  assert.equal(reloj.esperas.at(-1), 10_000, "pendiente: se reintenta pronto, sin backoff");
  assert.ok(logs.some((m) => /reporte de estados/.test(m) && /reiniciando/.test(m)), "queda en el log");
  assert.ok(logs.some((m) => /1 tickets creados · 1 aceptados/.test(m)), "y el pedido de Uber de esa vuelta se atendió");
  const q = pool.sql.find((x) => x.texto.startsWith("SELECT p.id, p.folio_corto, p.estado"));
  assert.match(q.texto, /p\.recibido_at > now\(\) - interval '48 hours'/);
});

// ── «Ya lo tengo» (entrega 7) ────────────────────────────────────────────────
test("ya lo tengo: con el ticket creado y el pedido en ACEPTADO se reporta EN_PREPARACION, una vez", async () => {
  const fila = filaReporte();
  const pool = poolFalso({ reporte: [fila] });
  const nube = nubeFalsa({ pedidos: [] });
  const agente = agenteCon(pool, nube);
  await agente.tick();
  assert.deepEqual(acciones(nube), [{ accion: "estado", pedido_id: "t1", estado: "EN_PREPARACION" }]);
  assert.deepEqual(estadosLocales(pool), [["t1", "EN_PREPARACION"]]);
  assert.deepEqual(avisosAlCajero(pool), []);
  fila.estado = "EN_PREPARACION";   // lo que quedó guardado en la base local
  await agente.tick();
  assert.equal(acciones(nube).length, 1, "ya está dicho: no se repite");
});

test("ya lo tengo: en la misma vuelta en que se crea el ticket de un pedido que aceptó el cajero", async () => {
  const pool = poolFalso({ reporte: [filaReporte()] });
  const nube = nubeFalsa({ pedidos: [pedidoT({ estado: "ACEPTADO" })], tienda: MANUAL });
  await agenteCon(pool, nube).tick();
  assert.deepEqual(acciones(nube), [{ accion: "reclamar", pedido_id: "t1" }, { accion: "estado", pedido_id: "t1", estado: "EN_PREPARACION" }]);
  const orden = pool.sql.map((q) => q.texto);
  assert.ok(orden.findIndex((t) => t.startsWith("SELECT crear_ticket_desde_tienda")) < orden.findIndex((t) => t.startsWith("SELECT p.id, p.folio_corto, p.estado")), "primero el ticket, luego el aviso");
});

test("ya lo tengo: si la nube responde un estado posterior, se guarda ese", async () => {
  const pool = poolFalso({ reporte: [filaReporte()] });
  const nube = nubeFalsa({ pedidos: [], alReportar: () => [200, { ok: true, estado: "LISTO" }] });
  await agenteCon(pool, nube).tick();
  assert.deepEqual(estadosLocales(pool), [["t1", "LISTO"]]);
  assert.deepEqual(avisosAlCajero(pool), []);
});

test("ya lo tengo: si la nube ya lo había cancelado, el cajero lee que cancele el ticket", async () => {
  const pool = poolFalso({ reporte: [filaReporte()] });
  const nube = nubeFalsa({ pedidos: [], alReportar: () => [200, { ok: true, estado: "CANCELADO" }] });
  await agenteCon(pool, nube).tick();
  assert.deepEqual(estadosLocales(pool), [["t1", "CANCELADO"]]);
  assert.deepEqual(avisosAlCajero(pool), [["t1", "El pedido en línea se canceló: cancela el ticket en caja"]]);
  // Si quien canceló fue esta caja (el ticket ya está cancelado), no hay nada que avisarle.
  const propio = poolFalso({ reporte: [filaReporte({ ticket_estado: "CANCELADO" })] });
  await agenteCon(propio, nubeFalsa({ pedidos: [] })).tick();
  assert.deepEqual(avisosAlCajero(propio), []);
});

test("ya lo tengo: una nube vieja que responde ESTADO_INVALIDO no se martillea; al imprimir sí se reporta LISTO", async () => {
  const fila = filaReporte();
  const pool = poolFalso({ reporte: [fila] });
  const nube = nubeFalsa({ pedidos: [], siguienteEnMs: 300_000, alReportar: (b) => (b.estado === "EN_PREPARACION" ? [400, { error: "ESTADO_INVALIDO" }] : [200, { ok: true, estado: b.estado }]) });
  let reloj = 1_000_000;
  const tiempos = relojFalso();
  const agente = agenteCon(pool, nube, { ahora: () => reloj, aleatorio: centro, ...tiempos });
  await agente.vuelta(); await agente.tick(); await agente.tick();
  assert.equal(acciones(nube).length, 1, "una sola llamada en tres vueltas");
  assert.deepEqual(estadosLocales(pool), []);
  assert.equal(agente.estado().pendiente, false);
  assert.equal(tiempos.esperas.at(-1), 300_000, "la caja no se queda sondeando con prisa");
  reloj += 5 * 60_000 + 1;
  await agente.tick();
  assert.equal(acciones(nube).length, 2, "pasados 5 minutos lo intenta otra vez");
  fila.ticket_impreso_at = "2026-10-09T10:00:00Z";
  await agente.tick();
  assert.deepEqual(acciones(nube).map((b) => b.estado), ["EN_PREPARACION", "EN_PREPARACION", "LISTO"]);
});
