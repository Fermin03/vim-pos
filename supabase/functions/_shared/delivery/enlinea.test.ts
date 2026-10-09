import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES_ENLINEA, MOTIVOS_TIENDA, fallaDeTicket, moduloTiendaActivo, motivoDeTienda, pausaHasta } from "./enlinea.ts";
import { accionExigeModulo } from "./modulo.ts";

test("las cuatro acciones de la tienda propia, y ninguna pide el módulo de apps", () => {
  assert.deepEqual([...ACCIONES_ENLINEA], ["enlinea_estado", "enlinea_pausar", "enlinea_reanudar", "enlinea_presente"]);
  // Un negocio con la tienda y sin apps de delivery no debe toparse con SIN_MODULO_DELIVERY.
  for (const a of ACCIONES_ENLINEA) assert.equal(accionExigeModulo(a), false, a);
});

// ── Motivo de rechazo: lista cerrada ─────────────────────────────────────────
// tienda_seguimiento se lo enseña al cliente: aquí nunca pasa texto del cajero.

test("motivo: cada uno de la lista se conserva", () => {
  for (const m of MOTIVOS_TIENDA) assert.equal(motivoDeTienda(m), m);
  assert.deepEqual([...MOTIVOS_TIENDA], ["AGOTADO", "SATURADO", "CERRADO", "OTRO"]);
});

test("motivo: POS_OFFLINE (que sí vale para Uber) aquí es OTRO", () => {
  assert.equal(motivoDeTienda("POS_OFFLINE"), "OTRO");
});

test("motivo: texto libre, minúsculas, con detalle pegado o ausente → OTRO", () => {
  for (const x of ["se nos acabó el pan, 4771112233", "agotado", "AGOTADO: ya no hay", " AGOTADO", "", null, undefined, 7, {}, ["AGOTADO"]]) {
    assert.equal(motivoDeTienda(x), "OTRO", `con ${JSON.stringify(x)}`);
  }
});

// ── Pausa ────────────────────────────────────────────────────────────────────

const AHORA = new Date("2026-10-09T18:00:00.000Z");

test("pausa de 30 minutos y de 1 hora, contadas desde ahora", () => {
  assert.equal(pausaHasta("30m", AHORA), "2026-10-09T18:30:00.000Z");
  assert.equal(pausaHasta("1h", AHORA), "2026-10-09T19:00:00.000Z");
});

test("pausa indefinida: el 31 dic 2999 (nunca 'infinity', que rompe a quien lo lea como fecha)", () => {
  assert.equal(pausaHasta("indefinida", AHORA), "2999-12-31T00:00:00Z");
});

test("una duración que no es de la lista no pausa nada", () => {
  for (const x of ["dia", "2h", "30M", "", " 30m", null, undefined, 30, {}, "9999h"]) {
    assert.equal(pausaHasta(x, AHORA), null, `con ${JSON.stringify(x)}`);
  }
});

// ── Clasificación de un fallo al crear el ticket ─────────────────────────────

test("sin turno abierto se reintenta: el pedido se queda como está", () => {
  assert.deepEqual(fallaDeTicket("SIN_TURNO_ABIERTO: sucursal 5f0c…"), { reintentable: true, codigo: "SIN_TURNO_ABIERTO" });
});

test("una violación de unicidad (el cliente se creó dos veces a la vez) se reintenta", () => {
  assert.deepEqual(
    fallaDeTicket('duplicate key value violates unique constraint "clientes_tenant_telefono_uq"', "23505"),
    { reintentable: true, codigo: "DUPLICADO" },
  );
});

test("lo que no se arregla reintentando cancela el pedido, con su código", () => {
  const casos: [string, string][] = [
    ["TOTAL_NO_COINCIDE: ticket 150.00 vs pedido 140.00", "TOTAL_NO_COINCIDE"],
    ["ENVIO_NO_COINCIDE: se cotizó un envío de 30.00 y la zona … hoy no cobra", "ENVIO_NO_COINCIDE"],
    ["DIRECCION_INVALIDA: pedido … a domicilio sin zona de envío o con la dirección incompleta", "DIRECCION_INVALIDA"],
    ["CLIENTE_BLOQUEADO: 7d1e…", "CLIENTE_BLOQUEADO"],
    ["PRODUCTO_DE_OTRO_NEGOCIO: 7d1e…", "PRODUCTO_DE_OTRO_NEGOCIO"],
    ["OPCION_DE_OTRO_NEGOCIO: el renglón … trae una opción de modificador de otro negocio", "OPCION_DE_OTRO_NEGOCIO"],
    ["ITEM_SIN_MAPEAR: Hamburguesa (sin producto genérico configurado)", "ITEM_SIN_MAPEAR"],
    ['COMBO_ELECCION_SIN_MAPEAR: el combo "Combo 1" trae una elección que no es un slot activo', "COMBO_ELECCION_SIN_MAPEAR"],
    ['COMBO_ELECCION_AMBIGUA: el combo "Combo 1" repite la misma elección', "COMBO_ELECCION_AMBIGUA"],
    ["SUCURSAL_DE_OTRO_NEGOCIO: sucursal 5f0c…", "SUCURSAL_DE_OTRO_NEGOCIO"],
    ["Producto 7d1e… no existe o está eliminado", "PRODUCTO_NO_EXISTE"],
    ['El combo "Combo 1" no está disponible', "PRODUCTO_NO_DISPONIBLE"],
    // Textos reales de 0116:170, 0152:336 y 0152:455.
    ["Zona de envío 5f0c1b9e-0000-4000-8000-000000000001 no existe, está inactiva o no es de esta sucursal", "ZONA_NO_DISPONIBLE"],
    ["Opción de modificador 5f0c1b9e-0000-4000-8000-000000000002 no existe", "OPCION_NO_EXISTE"],
    ['El producto "Papas chicas" no se vende en esta sucursal', "PRODUCTO_NO_DISPONIBLE"],
    // Textos reales de 0152:457, :416, :449, :432, :464 y :470.
    ['El producto "Papas chicas" está agotado o pausado', "PRODUCTO_NO_DISPONIBLE"],
    ["El producto 5f0c1b9e-0000-4000-8000-000000000003 no es un combo de este negocio", "PRODUCTO_NO_DISPONIBLE"],
    ["El producto 5f0c1b9e-0000-4000-8000-000000000004 no es válido como componente", "PRODUCTO_NO_DISPONIBLE"],
    ['El slot "Bebida" requiere entre 1 y 1 selecciones (recibió 0)', "PRODUCTO_NO_DISPONIBLE"],
    ['El producto "Malteada" está excluido del slot "Bebida"', "PRODUCTO_NO_DISPONIBLE"],
    ['El producto "Malteada" no es opción del slot "Bebida"', "PRODUCTO_NO_DISPONIBLE"],
  ];
  for (const [mensaje, codigo] of casos) {
    assert.deepEqual(fallaDeTicket(mensaje), { reintentable: false, codigo }, mensaje);
  }
});

test("un código que cancela manda aunque el error traiga otro código de Postgres", () => {
  assert.deepEqual(fallaDeTicket("TOTAL_NO_COINCIDE: ticket 1 vs pedido 2", "P0001"), { reintentable: false, codigo: "TOTAL_NO_COINCIDE" });
});

test("cualquier otro fallo se reintenta: no se le cancela un pedido a nadie por un error que no conocemos", () => {
  // El de 0008:1468 se parece a «no está disponible» pero es de turno: se arregla abriendo uno.
  for (const m of ["Turno 5f0c1b9e-0000-4000-8000-000000000005 no está abierto o no corresponde a la sucursal/caja indicada", "canceling statement due to statement timeout", "PEDIDO_NO_ACEPTABLE: estado EXPIRADO", "", "fetch failed"]) {
    assert.deepEqual(fallaDeTicket(m), { reintentable: true, codigo: "RPC_ERROR" }, m);
  }
  assert.deepEqual(fallaDeTicket("deadlock detected", "40P01"), { reintentable: true, codigo: "RPC_ERROR" });
});

// ── Módulo de la tienda ──────────────────────────────────────────────────────

test("el módulo de la tienda está activo solo con efectivos.tienda === true", () => {
  assert.equal(moduloTiendaActivo({ efectivos: { tienda: true } }), true);
});

test("fail-closed: sin respuesta, sin la clave, con un 'true' de texto o solo permitido → sin módulo", () => {
  assert.equal(moduloTiendaActivo(null), false);
  assert.equal(moduloTiendaActivo(undefined), false);
  assert.equal(moduloTiendaActivo({}), false);
  assert.equal(moduloTiendaActivo({ efectivos: {} }), false);
  assert.equal(moduloTiendaActivo({ efectivos: { delivery_apps: true } }), false);
  assert.equal(moduloTiendaActivo({ efectivos: { tienda: "true" } }), false);
  assert.equal(moduloTiendaActivo({ efectivos: { tienda: false } }), false);
  assert.equal(moduloTiendaActivo({ permitidos: { tienda: true }, efectivos: { tienda: false } }), false);
});
