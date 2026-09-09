import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenciaEspejo, cursorPedido, unirPedidos, REPOSO_MS, NORMAL_MS, RAPIDA_MS } from "./espejo.ts";

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
