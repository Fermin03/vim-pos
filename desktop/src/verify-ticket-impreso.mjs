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

const GW_PORT = 54371;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";
// La misma lista de columnas que pide apps/pos/app/lib/cuentas-abiertas.ts.
const SELECT_CUENTAS = "id,folio_completo,total_mxn,monto_pendiente_mxn,fecha_apertura,estado_cocina,ticket_impreso_at,comanda_impresa_at,nombre_cliente,cliente_id,cliente:clientes(nombre,apellido_paterno),tickets_mesas(fecha_liberacion,mesas!mesa_id(numero)),ticket_items(cantidad,cancelado)";

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };
const dir = mkdtempSync(path.join(tmpdir(), "vim-verify-ti-"));
let backend;

try {
  backend = await startBackend({ dataRoot: dir, pgPort: 54398, restPort: 54397, gatewayPort: GW_PORT, host: "127.0.0.1", log: () => {} });
  console.log("· backend temporal arriba (migraciones aplicadas, incluida la 0149)");

  const dev = await j(await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASS }),
  }));
  exigir(dev.body.access_token, `device sign-in falló: ${JSON.stringify(dev.body)}`);
  const tenant = dev.body.user.app_metadata.tenant_id;

  const accesos = await j(await fetch(`${GW}/rest/v1/usuarios_acceso?select=usuario_id,rol:roles(codigo)&activo=eq.true`, {
    headers: { Authorization: `Bearer ${dev.body.access_token}`, apikey: "anon" },
  }));
  const cajero = accesos.body.find((a) => a.rol?.codigo === "CAJERO");
  exigir(cajero, "no hay CAJERO en el seed");

  const emp = await j(await fetch(`${GW}/functions/v1/pin-login`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${dev.body.access_token}` },
    body: JSON.stringify({ usuario_id: cajero.usuario_id, pin: "1234", caja_id: CAJA }),
  }));
  exigir(emp.body.access_token, `pin-login falló: ${emp.status} ${JSON.stringify(emp.body)}`);
  console.log(`· sesión de cajero: "${emp.body.usuario.nombre}"`);
  const hdr = { "content-type": "application/json", Authorization: `Bearer ${emp.body.access_token}`, apikey: "anon" };
  const rpc = async (fn, args) => {
    const r = await j(await fetch(`${GW}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr, body: JSON.stringify(args) }));
    exigir(r.status < 300, `${fn} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };

  // Turno: lo abre la apertura de caja del POS; aquí por conexión directa, como verify-e2e.
  const c = await backend.pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: cajero.usuario_id, tenant_id: tenant, role: "authenticated" })]);
  const suc = (await c.query("SELECT sucursal_id FROM cajas WHERE id=$1", [CAJA])).rows[0].sucursal_id;
  await c.query("UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=$1 AND estado='ABIERTO'", [CAJA]);
  const turno = (await c.query(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'VERIFY-TI',CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [tenant, suc, CAJA, cajero.usuario_id])).rows[0].id;
  await c.query("COMMIT"); c.release();

  // 1) Un domicilio con un producto, enviado a cocina (la comanda se registra como hace la caja).
  const prod = (await j(await fetch(`${GW}/rest/v1/productos?select=id,nombre&limit=1`, { headers: hdr }))).body[0];
  const ticketId = await rpc("abrir_ticket", { p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "DELIVERY_PROPIO", p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: "verify-ti-ticket", p_usuario_id: cajero.usuario_id });
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
