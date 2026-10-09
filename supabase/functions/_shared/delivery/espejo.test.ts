import { test } from "node:test";
import assert from "node:assert/strict";
import { alcanceEspejo, cadenciaEspejo, cursorPedido, respuestaSinModulo, selloLatido, unirPedidos, REPOSO_MS, NORMAL_MS, RAPIDA_MS } from "./espejo.ts";

test("sin conexiones, la caja sondea en reposo: este cliente no vende por apps", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [] }), REPOSO_MS);
});

test("conexiones que no pueden recibir pedidos cuentan como reposo", () => {
  const conexiones = [{ estado: "DESCONECTADA" }, { estado: "PAUSADA" }, { estado: "SIN_CONECTAR" }];
  assert.equal(cadenciaEspejo({ conexiones, pedidosVivos: [] }), REPOSO_MS);
});

test("con una conexión viva pero sin pedidos, ritmo normal", () => {
  assert.equal(cadenciaEspejo({ conexiones: [{ estado: "ACTIVA" }], pedidosVivos: [] }), NORMAL_MS);
});

test("una conexión PENDIENTE ya merece ritmo normal: está por activarse", () => {
  assert.equal(cadenciaEspejo({ conexiones: [{ estado: "PENDIENTE" }], pedidosVivos: [] }), NORMAL_MS);
});

test("un pedido RECIBIDO acelera a ritmo rápido: su ventana de aceptación está corriendo", () => {
  const pedidosVivos = [{ estado: "RECIBIDO" }];
  assert.equal(cadenciaEspejo({ conexiones: [{ estado: "ACTIVA" }], pedidosVivos }), RAPIDA_MS);
});

test("un pedido ya aceptado no acelera: no hay ventana que se venza", () => {
  const pedidosVivos = [{ estado: "EN_PREPARACION" }, { estado: "LISTO" }];
  assert.equal(cadenciaEspejo({ conexiones: [{ estado: "ACTIVA" }], pedidosVivos }), NORMAL_MS);
});

test("un RECIBIDO manda aunque la conexión ya no esté viva: el pedido sigue ahí", () => {
  const conexiones = [{ estado: "DESCONECTADA" }];
  assert.equal(cadenciaEspejo({ conexiones, pedidosVivos: [{ estado: "RECIBIDO" }] }), RAPIDA_MS);
});

test("los tres ritmos van de menor a mayor espera", () => {
  assert.ok(RAPIDA_MS < NORMAL_MS && NORMAL_MS < REPOSO_MS);
});

// ── Unión de listas ──────────────────────────────────────────────────────────
// La respuesta lleva SIEMPRE los pedidos vivos (son pocos y son los que la caja tiene que poder
// atender) más lo que cambió desde el cursor. Sin los vivos, un pedido que la caja no logró
// convertir en ticket no volvería a aparecer nunca: no cambia, así que ningún delta lo trae.

test("une los vivos con el delta sin repetir", () => {
  const vivos = [{ id: "a", recibido_at: "2026-09-09T10:00:00Z" }];
  const delta = [{ id: "b", recibido_at: "2026-09-09T09:00:00Z" }];
  assert.deepEqual(unirPedidos(vivos, delta).map((p) => p.id), ["a", "b"]);
});

test("un pedido en las dos listas aparece una sola vez, con la versión del delta", () => {
  const vivos = [{ id: "a", estado: "RECIBIDO", recibido_at: "2026-09-09T10:00:00Z" }];
  const delta = [{ id: "a", estado: "ACEPTADO", recibido_at: "2026-09-09T10:00:00Z" }];
  const r = unirPedidos(vivos, delta);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.estado, "ACEPTADO", "gana lo más reciente que leyó la base");
});

test("ordena del más nuevo al más viejo", () => {
  const vivos = [{ id: "viejo", recibido_at: "2026-09-09T08:00:00Z" }];
  const delta = [{ id: "nuevo", recibido_at: "2026-09-09T11:00:00Z" }];
  assert.deepEqual(unirPedidos(vivos, delta).map((p) => p.id), ["nuevo", "viejo"]);
});

test("recorta a un tope para que una respuesta no crezca sin límite", () => {
  const muchos = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, recibido_at: "2026-09-09T10:00:00Z" }));
  assert.equal(unirPedidos([], muchos, 200).length, 200);
});

test("dos listas vacías dan una respuesta vacía, no un error", () => {
  assert.deepEqual(unirPedidos([], []), []);
});

// ── Cursor que manda la caja ─────────────────────────────────────────────────

test("acepta un cursor con forma de fecha y lo normaliza a ISO", () => {
  assert.equal(cursorPedido("2026-09-09T10:05:00.123+00:00"), "2026-09-09T10:05:00.123Z");
});

test("un cursor que no es fecha se ignora: se responde en frío en vez de reventar", () => {
  for (const basura of [undefined, null, "", "ayer", 123, {}, "DROP TABLE"]) {
    assert.equal(cursorPedido(basura), null, `con ${String(basura)}`);
  }
});

// ── Guard del módulo (Task 3) ────────────────────────────────────────────────
// Un tenant cuyo dueño no encendió el módulo se contesta en frío, con la misma forma que la
// respuesta normal, para que la caja duerma sin necesitar código nuevo del lado del escritorio.

test("sin módulo: respuesta vacía y a reposo", () => {
  const r = respuestaSinModulo("caja-1", "suc-1");
  assert.deepEqual(r.conexiones, []);
  assert.deepEqual(r.pedidos, []);
  assert.equal(r.siguiente_en_ms, REPOSO_MS);
  assert.equal(r.caja_id, "caja-1");
  assert.equal(r.sucursal_id, "suc-1");
});

// ── Tienda en línea (0161 §6) ────────────────────────────────────────────────

test("con la tienda viva y sin conexiones de apps, ritmo normal: la ventana de 90 s de caja lista lo necesita", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [], tienda: true }), NORMAL_MS);
});

test("la tienda apagada no saca a la caja del reposo", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [], tienda: false }), REPOSO_MS);
});

test("un pedido RECIBIDO manda sobre la tienda: ritmo rápido", () => {
  assert.equal(cadenciaEspejo({ conexiones: [], pedidosVivos: [{ estado: "RECIBIDO" }], tienda: true }), RAPIDA_MS);
});

test("alcance: solo apps, como hasta hoy", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true }, cuerpo: {} }),
    { conApps: true, conTienda: false, canales: ["APP"], turnoAbierto: false });
});

test("alcance: una caja que no declara entender la tienda no recibe sus pedidos aunque el módulo esté encendido", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true, tienda: true }, cuerpo: {} }),
    { conApps: true, conTienda: false, canales: ["APP"], turnoAbierto: false });
});

test("alcance: caja nueva con tienda y apps recibe los dos canales", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { delivery_apps: true, tienda: true }, cuerpo: { tienda: true, turno_abierto: true } }),
    { conApps: true, conTienda: true, canales: ["APP", "TIENDA"], turnoAbierto: true });
});

test("alcance: tienda sin apps", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { tienda: true }, cuerpo: { tienda: true } }),
    { conApps: false, conTienda: true, canales: ["TIENDA"], turnoAbierto: false });
});

test("alcance: la caja dice que entiende la tienda pero el negocio no la tiene", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: {}, cuerpo: { tienda: true, turno_abierto: true } }),
    { conApps: false, conTienda: false, canales: [], turnoAbierto: true });
});

test("alcance: solo un true estricto cuenta; un cuerpo raro no abre nada", () => {
  assert.deepEqual(alcanceEspejo({ efectivos: { tienda: true }, cuerpo: { tienda: "true", turno_abierto: 1 } }),
    { conApps: false, conTienda: false, canales: [], turnoAbierto: false });
});

// ── Sello del latido (0161 §6) ───────────────────────────────────────────────
// El turno abierto se sella como marca de tiempo y solo cuando la caja lo afirma: una caja que deja
// de afirmarlo no escribe nada, la marca envejece sola y la tienda de esa sucursal se cierra.

const AHORA = "2026-10-08T18:00:00.000Z";

test("sello: un cuerpo vacío solo sella el latido, como las cajas que hoy están en servicio", () => {
  assert.deepEqual(selloLatido({}, AHORA), { espejo_apps_at: AHORA });
});

test("sello: declarar la tienda sin turno abierto no sella el turno", () => {
  assert.deepEqual(selloLatido({ tienda: true }, AHORA), { espejo_apps_at: AHORA });
  assert.deepEqual(selloLatido({ tienda: true, turno_abierto: false }, AHORA), { espejo_apps_at: AHORA });
});

test("sello: turno abierto sin declarar la tienda no sella el turno", () => {
  assert.deepEqual(selloLatido({ turno_abierto: true }, AHORA), { espejo_apps_at: AHORA });
});

test("sello: con la tienda declarada y el turno abierto se sellan las dos marcas, con la misma hora", () => {
  assert.deepEqual(selloLatido({ tienda: true, turno_abierto: true }, AHORA),
    { espejo_apps_at: AHORA, espejo_turno_abierto_at: AHORA });
});

test("sello: solo un true estricto cuenta", () => {
  assert.deepEqual(selloLatido({ tienda: "true", turno_abierto: true }, AHORA), { espejo_apps_at: AHORA });
  assert.deepEqual(selloLatido({ tienda: true, turno_abierto: 1 }, AHORA), { espejo_apps_at: AHORA });
  assert.deepEqual(selloLatido({ tienda: 1, turno_abierto: "true" }, AHORA), { espejo_apps_at: AHORA });
});
