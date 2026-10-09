import test from "node:test";
import assert from "node:assert/strict";
import { planificarEspejo, filaLocal, puedeCrear, cursorDe, COLUMNAS_PEDIDO, estadoAReportar, fallaDeTicket, avisoDeFalla } from "./delivery-espejo-plan.mjs";

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

test("planificarEspejo: RECIBIDO con ticket local de esta caja → aAceptar (el accept anterior falló) (D7)", () => {
  const r = planificarEspejo({
    conexiones: [cx()],
    pedidos: [ped({ gestion_caja_id: CAJA })],
    localPedidos: [{ id: "p1", ticket_id: "tk" }],
    turnoAbierto: true, cajaId: CAJA,
  });
  assert.deepEqual(r.aAceptar, ["p1"]);
  assert.deepEqual(r.aCrear, [], "el ticket no se vuelve a crear");
  // Ya aceptado, de otra caja o de gestión NUBE: nada que reintentar aquí.
  const ok = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ estado: "ACEPTADO", gestion_caja_id: CAJA })], localPedidos: [{ id: "p1", ticket_id: "tk" }], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(ok.aAceptar, []);
  const otra = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ gestion_caja_id: OTRA })], localPedidos: [{ id: "p1", ticket_id: "tk" }], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(otra.aAceptar, []);
  const nube = planificarEspejo({ conexiones: [cx()], pedidos: [ped({ gestion: "NUBE" })], localPedidos: [{ id: "p1", ticket_id: "tk" }], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(nube.aAceptar, []);
  const sinTicket = planificarEspejo({ conexiones: [cx()], pedidos: [ped()], localPedidos: [], turnoAbierto: true, cajaId: CAJA });
  assert.deepEqual(sinTicket.aAceptar, [], "sin ticket local va por aCrear, no por aquí");
});

// ── Cursor del delta ─────────────────────────────────────────────────────────
// El cursor vive en memoria del agente y NO se espeja: el trigger set_updated_at pisa updated_at
// con el reloj local en cada UPDATE, así que la copia local no sirve para preguntarle a la nube
// "¿qué cambió desde…?". Un reinicio de la caja hace arranque en frío y ya.

test("el cursor avanza al updated_at más nuevo de lo que llegó", () => {
  const filas = [{ updated_at: "2026-09-09T10:00:00Z" }, { updated_at: "2026-09-09T10:05:00Z" }];
  assert.equal(cursorDe(filas, null), "2026-09-09T10:05:00Z");
});

test("sin filas, el cursor se queda donde estaba", () => {
  assert.equal(cursorDe([], "2026-09-09T10:05:00Z"), "2026-09-09T10:05:00Z");
});

test("el cursor nunca retrocede", () => {
  const filas = [{ updated_at: "2026-09-09T09:00:00Z" }];
  assert.equal(cursorDe(filas, "2026-09-09T10:05:00Z"), "2026-09-09T10:05:00Z");
});

test("una fila sin updated_at usable no mueve el cursor ni lo rompe", () => {
  const filas = [{ updated_at: null }, { updated_at: "no es fecha" }, {}];
  assert.equal(cursorDe(filas, "2026-09-09T10:05:00Z"), "2026-09-09T10:05:00Z");
  assert.equal(cursorDe(filas, null), null);
});

test("compara por instante, no por texto: distinta precisión y huso siguen ordenándose bien", () => {
  const filas = [{ updated_at: "2026-09-09T10:05:00.123456+00:00" }];
  assert.equal(cursorDe(filas, "2026-09-09T04:00:00-06:00"), "2026-09-09T10:05:00.123456+00:00");
});

// ── Tienda en línea (entrega 4) ──────────────────────────────────────────────
// Un pedido de la tienda es canal TIENDA, sin conexión, y su `app` es el modo de servicio.

const AUTO = { participa: true, aceptacion: "AUTO", pausa_hasta: null };
const MANUAL = { participa: true, aceptacion: "MANUAL", pausa_hasta: null };
const pedT = (extra = {}) => ped({
  canal: "TIENDA", conexion_id: null, app: "DRIVE_THRU", id_externo: "t-1", cliente_email: "a@b.mx", tienda_cuenta_id: "tc1",
  zona_envio_id: null, direccion: null, pago_al_recibir: "EFECTIVO", paga_con_mxn: "200.00", ...extra,
});
const planT = (pedidos, extra = {}) => planificarEspejo({ conexiones: [cx()], pedidos, localPedidos: [], turnoAbierto: true, cajaId: CAJA, tienda: AUTO, ...extra });

test("filaLocal: un pedido de la tienda conserva sus columnas; uno sin canal (nube vieja) es APP", () => {
  const f = filaLocal(pedT({ app: "DELIVERY_PROPIO", zona_envio_id: "z1", direccion: { calle: "Av. X" } }), undefined);
  assert.equal(f.canal, "TIENDA");
  assert.equal(f.cliente_email, "a@b.mx");
  assert.equal(f.tienda_cuenta_id, "tc1");
  assert.equal(f.zona_envio_id, "z1");
  assert.deepEqual(f.direccion, { calle: "Av. X" });
  assert.equal(f.pago_al_recibir, "EFECTIVO");
  assert.equal(f.paga_con_mxn, "200.00");
  const vieja = filaLocal(ped(), undefined);
  assert.equal(vieja.canal, "APP", "canal es NOT NULL en la base local");
  assert.equal(vieja.direccion, null);
});

test("filaLocal: la explicación al cajero de un pedido de la tienda ya cerrado no la borra el siguiente espejo", () => {
  const local = { id: "p1", ticket_id: null, ultimo_error: "Se canceló solo" };
  assert.equal(filaLocal(pedT({ estado: "RECHAZADO", ultimo_error: null }), local).ultimo_error, "Se canceló solo");
  assert.equal(filaLocal(pedT({ estado: "ACEPTADO", ultimo_error: null }), local).ultimo_error, null, "vivo: manda la nube");
  assert.equal(filaLocal(ped({ estado: "CANCELADO", ultimo_error: null }), local).ultimo_error, null, "APP: como siempre");
});

test("tienda RECIBIDO: con aceptación MANUAL espera al cajero; con AUTO y turno se crea; AUTO sin turno no", () => {
  assert.deepEqual(planT([pedT()], { tienda: MANUAL }).aCrear, []);
  assert.deepEqual(planT([pedT()]).aCrear, ["p1"]);
  assert.deepEqual(planT([pedT()], { turnoAbierto: false }).aCrear, []);
  assert.deepEqual(planT([pedT()], { tienda: null }).aCrear, [], "sin el dato de la nube no se acepta nada solo");
  assert.deepEqual(planT([pedT()], { tienda: undefined, conexiones: [] }).aCrear, []);
  assert.equal(planT([pedT()], { tienda: MANUAL }).upserts.length, 1, "pero sí se espeja");
});

test("tienda: el auto-aceptar de Uber no decide sobre un pedido de la tienda, ni al revés", () => {
  // Conexión de Uber con auto-aceptar y tienda MANUAL: el de Uber se crea, el de la tienda espera.
  const r = planT([pedT({ id: "t" }), ped({ id: "u" })], { tienda: MANUAL });
  assert.deepEqual(r.aCrear, ["u"]);
  // Tienda AUTO y Uber sin auto-aceptar: al revés.
  const r2 = planT([pedT({ id: "t" }), ped({ id: "u" })], { conexiones: [cx({ auto_aceptar: false })] });
  assert.deepEqual(r2.aCrear, ["t"]);
});

test("tienda ACEPTADO sin ticket local (lo aceptó el cajero) → aCrear, aunque sea MANUAL", () => {
  assert.deepEqual(planT([pedT({ estado: "ACEPTADO" })], { tienda: MANUAL }).aCrear, ["p1"]);
  const ya = planT([pedT({ estado: "ACEPTADO" })], { localPedidos: [{ id: "p1", ticket_id: "tk" }] });
  assert.deepEqual(ya.aCrear, [], "con ticket local no se repite");
});

test("tienda: de otra caja o de gestión NUBE no se crea aquí; RECIBIDO con ticket local → aAceptar", () => {
  assert.deepEqual(planT([pedT({ gestion_caja_id: OTRA })]).aCrear, []);
  assert.deepEqual(planT([pedT({ gestion: "NUBE" })]).aCrear, []);
  const r = planT([pedT({ gestion_caja_id: CAJA })], { localPedidos: [{ id: "p1", ticket_id: "tk" }] });
  assert.deepEqual(r.aAceptar, ["p1"]);
  assert.deepEqual(r.aCrear, []);
});

test("tienda: la nube cerró un pedido con ticket local abierto → aviso para el cajero", () => {
  const motivo = "El pedido en línea se canceló: cancela el ticket en caja";
  for (const estado of ["EXPIRADO", "CANCELADO", "RECHAZADO"]) {
    const r = planT([pedT({ estado })], { localPedidos: [{ id: "p1", ticket_id: "tk", ticket_estado: "ABIERTO" }] });
    assert.deepEqual(r.avisos, [{ pedidoId: "p1", motivo }], estado);
    assert.deepEqual(r.aCrear, []);
  }
  // Sin ticket local no hay nada que cancelar; con el ticket ya cancelado o cobrado, tampoco.
  assert.deepEqual(planT([pedT({ estado: "CANCELADO" })]).avisos, []);
  for (const ticket_estado of ["CANCELADO", "PAGADO", "FACTURADO"]) {
    const r = planT([pedT({ estado: "CANCELADO" })], { localPedidos: [{ id: "p1", ticket_id: "tk", ticket_estado }] });
    assert.deepEqual(r.avisos, [], ticket_estado);
  }
});

test("estadoAReportar: la tabla del ticket local, de arriba hacia abajo", () => {
  const t = (extra = {}) => ({ ticket_estado: "ABIERTO", ticket_impreso_at: null, asignado: false, ...extra });
  assert.equal(estadoAReportar(t({ ticket_estado: "CANCELADO" })), "CANCELADO");
  assert.equal(estadoAReportar(t({ ticket_estado: "CANCELADO", ticket_impreso_at: "2026-10-09T10:00:00Z", asignado: true })), "CANCELADO", "cancelado gana a todo");
  assert.equal(estadoAReportar(t({ ticket_estado: "PAGADO" })), "ENTREGADO");
  assert.equal(estadoAReportar(t({ ticket_estado: "FACTURADO" })), "ENTREGADO");
  assert.equal(estadoAReportar(t({ ticket_estado: "PAGADO", ticket_impreso_at: "2026-10-09T10:00:00Z" })), "ENTREGADO", "cobrado gana a impreso");
  assert.equal(estadoAReportar(t({ ticket_impreso_at: "2026-10-09T10:00:00Z" })), "LISTO");
  assert.equal(estadoAReportar(t({ asignado: true })), "LISTO");
  assert.equal(estadoAReportar(t()), null, "ni impreso ni asignado: nada que decir");
  assert.equal(estadoAReportar(t({ ticket_estado: "EN_PREPARACION" })), null);
});

test("fallaDeTicket: sin turno y unicidad se reintentan", () => {
  assert.deepEqual(fallaDeTicket("SIN_TURNO_ABIERTO: sucursal 5f0c"), { reintentable: true, codigo: "SIN_TURNO_ABIERTO" });
  assert.deepEqual(
    fallaDeTicket('duplicate key value violates unique constraint "clientes_tenant_telefono_uq"', "23505"),
    { reintentable: true, codigo: "DUPLICADO" },
  );
});

test("fallaDeTicket: lo que no se arregla reintentando cancela el pedido, con su código", () => {
  const casos = [
    ["TOTAL_NO_COINCIDE: ticket 150.00 vs pedido 140.00", "TOTAL_NO_COINCIDE"],
    ["ENVIO_NO_COINCIDE: se cotizó un envío de 30.00 y la zona z hoy no cobra", "ENVIO_NO_COINCIDE"],
    ["DIRECCION_INVALIDA: pedido p a domicilio sin zona de envío o con la dirección incompleta", "DIRECCION_INVALIDA"],
    ["CLIENTE_BLOQUEADO: 7d1e", "CLIENTE_BLOQUEADO"],
    ["PRODUCTO_DE_OTRO_NEGOCIO: 7d1e", "PRODUCTO_DE_OTRO_NEGOCIO"],
    ["OPCION_DE_OTRO_NEGOCIO: el renglón x trae una opción de modificador de otro negocio", "OPCION_DE_OTRO_NEGOCIO"],
    ["ITEM_SIN_MAPEAR: Hamburguesa (sin producto genérico configurado)", "ITEM_SIN_MAPEAR"],
    ['COMBO_ELECCION_SIN_MAPEAR: el combo "Combo 1" trae una elección que no es un slot activo', "COMBO_ELECCION_SIN_MAPEAR"],
    ['COMBO_ELECCION_AMBIGUA: el combo "Combo 1" repite la misma elección', "COMBO_ELECCION_AMBIGUA"],
    ["SUCURSAL_DE_OTRO_NEGOCIO: sucursal 5f0c", "SUCURSAL_DE_OTRO_NEGOCIO"],
    ["Producto 7d1e no existe o está eliminado", "PRODUCTO_NO_EXISTE"],
    ['El combo "Combo 1" no está disponible', "PRODUCTO_NO_DISPONIBLE"],
  ];
  for (const [mensaje, codigo] of casos) assert.deepEqual(fallaDeTicket(mensaje), { reintentable: false, codigo }, mensaje);
  assert.deepEqual(fallaDeTicket("TOTAL_NO_COINCIDE: ticket 1 vs pedido 2", "P0001"), { reintentable: false, codigo: "TOTAL_NO_COINCIDE" });
});

test("fallaDeTicket: cualquier otro fallo se reintenta; a nadie se le cancela por un error que no conocemos", () => {
  for (const m of ["canceling statement due to statement timeout", "PEDIDO_NO_ACEPTABLE: estado EXPIRADO", "", 'El producto "Doble" está agotado o pausado']) {
    assert.deepEqual(fallaDeTicket(m), { reintentable: true, codigo: "RPC_ERROR" }, m);
  }
  assert.deepEqual(fallaDeTicket("deadlock detected", "40P01"), { reintentable: true, codigo: "RPC_ERROR" });
  assert.deepEqual(fallaDeTicket(undefined), { reintentable: true, codigo: "RPC_ERROR" });
});

test("avisoDeFalla: le dice al cajero por qué se canceló, sin palabras internas", () => {
  for (const c of ["TOTAL_NO_COINCIDE", "ENVIO_NO_COINCIDE", "DIRECCION_INVALIDA", "CLIENTE_BLOQUEADO", "ITEM_SIN_MAPEAR", "PRODUCTO_NO_EXISTE", "LO_QUE_SEA"]) {
    const t = avisoDeFalla(c);
    assert.match(t, /cancel/i, c);
    assert.doesNotMatch(t, /[A-Z]{3,}_[A-Z]/, `${c}: sin códigos`);
  }
  assert.notEqual(avisoDeFalla("TOTAL_NO_COINCIDE"), avisoDeFalla("CLIENTE_BLOQUEADO"));
});
