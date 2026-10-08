// Verificación de la 0149 por el camino REAL de la caja: sesión de cajero, PostgREST y RLS.
//
// El bug: mandar la comanda a cocina sellaba `comanda_impresa_at`, y la pantalla de cuentas lo
// leía como "el ticket del cliente ya se imprimió" → "Reimprimir" con PIN desde la primera vez.
// Aquí se hace lo mismo que la caja —abrir un domicilio, registrar su comanda, listar las cuentas
// con la consulta de `listarCuentasAbiertas`, sellar con `marcar_ticket_impreso`— y se comprueba
// que la cuenta nace SIN sello de ticket y lo gana solo al imprimirlo.
//
// Corre en una base temporal recién sembrada y en puertos propios: no toca el pgdata de dev ni
// choca con la caja instalada (que ocupa 54329 / 54350).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startBackend } from "./backend.mjs";
import { abrirTurno, entrarComoCajero, exigir, j } from "./verify-sesion.mjs";

const GW_PORT = 54371;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";
// La misma lista de columnas que pide apps/pos/app/lib/cuentas-abiertas.ts.
const SELECT_CUENTAS = "id,folio_completo,total_mxn,monto_pendiente_mxn,fecha_apertura,estado_cocina,ticket_impreso_at,comanda_impresa_at,nombre_cliente,cliente_id,cliente:clientes(nombre,apellido_paterno),tickets_mesas(fecha_liberacion,mesas!mesa_id(numero)),ticket_items(cantidad,cancelado)";

const dir = mkdtempSync(path.join(tmpdir(), "vim-verify-ti-"));
let backend;

try {
  backend = await startBackend({ dataRoot: dir, pgPort: 54398, restPort: 54397, gatewayPort: GW_PORT, host: "127.0.0.1", log: () => {} });
  console.log("· backend temporal arriba (migraciones aplicadas, incluida la 0149)");

  const s = await entrarComoCajero(GW, { email: DEVICE_EMAIL, password: DEVICE_PASS, caja: CAJA });
  const { hdr, rpc } = s;
  console.log(`· sesión de cajero: "${s.nombre}"`);

  // Turno: lo abre la apertura de caja del POS; aquí por conexión directa.
  const { suc, turno } = await abrirTurno(backend.pool, s, "VERIFY-TI");

  // 1) Un domicilio con un producto, enviado a cocina (la comanda se registra como hace la caja).
  const prod = (await j(await fetch(`${GW}/rest/v1/productos?select=id,nombre&limit=1`, { headers: hdr }))).body[0];
  const ticketId = await rpc("abrir_ticket", { p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "DELIVERY_PROPIO", p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: "verify-ti-ticket", p_usuario_id: s.cajeroId });
  await rpc("agregar_item_a_ticket", { p_ticket_id: ticketId, p_producto_id: prod.id, p_cantidad: 1, p_nota_cocina: null, p_modificadores: [], p_client_id_local: "verify-ti-item" });
  await rpc("imprimir_comanda", {
    p_ticket_id: ticketId, p_area_cocina_id: null, p_impresora_identificador: "COCINA",
    p_items_incluidos: [{ cantidad: 1, nombre: prod.nombre, modificadores: [] }],
    p_evento_tipo: "IMPRESION_INICIAL", p_resultado: "OK", p_error_detalle: null, p_razon_reimpresion: null, p_autorizacion_pin_id: null,
  });
  console.log("· domicilio abierto y su comanda registrada (IMPRESION_INICIAL)");

  // 2) Lo que ve la pantalla de Domicilios: la consulta de listarCuentasAbiertas.
  const listar = async () => {
    const r = await j(await fetch(`${GW}/rest/v1/tickets?select=${encodeURIComponent(SELECT_CUENTAS)}&sucursal_id=eq.${suc}&modo_servicio=in.(DELIVERY_PROPIO)&deleted_at=is.null&en_espera=eq.false&estado_fiscal=in.(BORRADOR,ABIERTO)`, { headers: hdr }));
    exigir(r.status === 200, `listar cuentas → ${r.status} ${JSON.stringify(r.body)}`);
    const t = r.body.find((x) => x.id === ticketId);
    exigir(t, "la cuenta no aparece en la lista de domicilios");
    return t;
  };
  let t = await listar();
  exigir(t.comanda_impresa_at != null, "la comanda debía sellar comanda_impresa_at (si no, esta prueba no reproduce el bug)");
  exigir(t.ticket_impreso_at == null, "REGRESIÓN: la cuenta nace con el ticket marcado como impreso → saldría \"Reimprimir\" con PIN");
  console.log("· comanda sellada, ticket SIN sello → el botón dice \"Imprimir ticket\" y no pide PIN");

  // 3) El cajero imprime el ticket: la caja sella por RPC.
  await rpc("marcar_ticket_impreso", { p_ticket_id: ticketId });
  t = await listar();
  exigir(t.ticket_impreso_at != null, "marcar_ticket_impreso no selló bajo la sesión del cajero (¿RLS?)");
  const primero = t.ticket_impreso_at;
  console.log("· ticket impreso → sellado; la siguiente vez dice \"Reimprimir\" y pide PIN");

  // 4) Idempotente: una reimpresión no mueve la fecha de la primera.
  await rpc("marcar_ticket_impreso", { p_ticket_id: ticketId });
  t = await listar();
  exigir(t.ticket_impreso_at === primero, "el sello se movió al marcar por segunda vez");

  // 5) Sin sesión no se puede sellar.
  const anon = await fetch(`${GW}/rest/v1/rpc/marcar_ticket_impreso`, { method: "POST", headers: { "content-type": "application/json", apikey: "anon" }, body: JSON.stringify({ p_ticket_id: ticketId }) });
  exigir(anon.status >= 400, `sin sesión debía rechazarse y respondió ${anon.status}`);
  console.log("· idempotente y cerrado a quien no tiene sesión");

  console.log("\n✅ 0149 OK — la comanda de cocina ya no cuenta como ticket del cliente impreso.");
} catch (e) {
  console.error("\n❌ FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows suelta el pgdata tarde */ }
}
