import test from "node:test";
import assert from "node:assert/strict";
import { planificarEspejo, filaLocal, puedeCrear, COLUMNAS_PEDIDO } from "./delivery-espejo-plan.mjs";

const CAJA = "cccccccc-0000-0000-0000-0000000000cc";
const OTRA = "cccccccc-0000-0000-0000-0000000000c2";
const cx = (extra = {}) => ({ id: "cx1", auto_aceptar: true, config: {}, ...extra });
const ped = (extra = {}) => ({
  id: "p1", tenant_id: "t", sucursal_id: "s", conexion_id: "cx1", app: "APP_UBEREATS", id_externo: "u-1", estado: "RECIBIDO",
  gestion: "ESCRITORIO", gestion_caja_id: null, items: [{ producto_id: "x" }], items_sin_mapear: null,
  vence_aceptacion: "2026-09-03T10:11:00Z", recibido_at: "2026-09-03T10:00:00Z", ...extra,
});

test("filaLocal: copia las columnas, payload vacío y conserva el ticket local", () => {
  const f = filaLocal(ped({ ticket_id: "ticket-nube" }), { id: "p1", ticket_id: "ticket-local" });
  assert.equal(f.ticket_id, "ticket-local");
  assert.deepEqual(f.payload_raw, {});
  for (const c of COLUMNAS_PEDIDO) assert.ok(c in f, `columna ${c}`);
  assert.equal(filaLocal(ped(), undefined).ticket_id, null, "sin fila local no inventa ticket");
});

test("puedeCrear: sin ítems sin mapear, o con producto genérico", () => {
  assert.equal(puedeCrear(ped(), cx()), true);
  assert.equal(puedeCrear(ped({ items_sin_mapear: [{ nombre_app: "x" }] }), cx()), false);
  assert.equal(puedeCrear(ped({ items_sin_mapear: [{ nombre_app: "x" }] }), cx({ config: { producto_generico_id: "g" } })), true);
});

test("planificarEspejo: RECIBIDO con auto-aceptar y turno → aCrear; sin turno → no", () => {
  const con = planificarEspejo({ conexiones: [cx()], pedidos: [ped()], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(con.aCrear, ["p1"]);
  assert.equal(con.upserts.length, 1);
  const sin = planificarEspejo({ conexiones: [cx()], pedidos: [ped()], localPedidos: [], turnoAbierto: false, cajaId: CAJA });
  assert.deepEqual(sin.aCrear, []);
  const manual = planificarEspejo({ conexiones: [cx({ auto_aceptar: false })], pedidos: [ped()], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(manual.aCrear, [], "sin auto-aceptar espera al cajero");
});

test("planificarEspejo: ACEPTADO sin ticket local → aCrear aunque no haya auto-aceptar", () => {
  const r = planificarEspejo({ conexiones: [cx({ auto_aceptar: false })], pedidos: [ped({ estado: "ACEPTADO" })], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(r.aCrear, ["p1"]);
  const ya = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ estado: "ACEPTADO" })], localPedidos: [{ id: "p1", ticket_id: "tk" }], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(ya.aCrear, [], "con ticket local no se repite");
});

test("planificarEspejo: pedidos de otra caja o de gestión NUBE no se crean aquí", () => {
  const otra = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ gestion_caja_id: OTRA })], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(otra.aCrear, []);
  const nube = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ gestion: "NUBE" })], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(nube.aCrear, []);
  assert.equal(nube.upserts.length, 1, "pero sí se espeja");
});

test("planificarEspejo: avisa cuando la app canceló un pedido con ticket local; ordena por vencimiento", () => {
  const r = planificarEspejo({
    conexiones: [cx()],
    pedidos: [
      ped({ id: "tarde", vence_aceptacion: "2026-09-03T10:20:00Z" }),
      ped({ id: "pronto", vence_aceptacion: "2026-09-03T10:05:00Z" }),
      ped({ id: "canc", estado: "CANCELADO" }),
    ],
    localPedidos: [{ id: "canc", ticket_id: "tk-canc" }],
    turnoAbierto: true, cajaId: CAJA,
  });
  assert.deepEqual(r.aCrear, ["pronto", "tarde"]);
  assert.deepEqual(r.avisos, [{ pedidoId: "canc", motivo: "La app canceló este pedido: cancela el ticket en caja" }]);
});
