// Fase 1 · Verificación E2E del backend local — actúa EXACTAMENTE como el POS (supabase-js).
// device sign-in (GoTrue) → listar empleados (RLS) → pin-login (Edge) → venta por RPC → PAGADO.
// Todo contra el gateway local en localhost. Si esto pasa, el POS corre sin tocar su código.
import { startBackend } from "./backend.mjs";
import pg from "pg";

const GW_PORT = 54350;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
let backend;

try {
  backend = await startBackend({ gatewayPort: GW_PORT, log: () => {} });
  console.log("· backend local arriba");

  // 1) LOGIN DE DISPOSITIVO (supabase.auth.signInWithPassword)
  const dev = await j(await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASS }),
  }));
  if (!dev.body.access_token) throw new Error(`device sign-in falló: ${JSON.stringify(dev.body)}`);
  const deviceToken = dev.body.access_token;
  console.log(`· device sign-in OK (tipo_identidad en claims, tenant en JWT)`);

  // 2) LISTAR EMPLEADOS bajo la sesión de dispositivo (RLS por tenant, vía /rest/v1)
  const accesos = await j(await fetch(`${GW}/rest/v1/usuarios_acceso?select=usuario_id,rol:roles(codigo)&activo=eq.true`, {
    headers: { Authorization: `Bearer ${deviceToken}`, apikey: "anon" },
  }));
  if (accesos.status !== 200) throw new Error(`listar accesos falló: ${accesos.status} ${JSON.stringify(accesos.body)}`);
  const cajeroAcc = accesos.body.find((a) => a.rol?.codigo === "CAJERO");
  if (!cajeroAcc) throw new Error("no encontré un CAJERO en los accesos (RLS)");
  console.log(`· GET /rest/v1/usuarios_acceso (RLS device) → ${accesos.body.length} accesos del tenant`);

  // 3) PIN-LOGIN del empleado (Edge emulada)
  const emp = await j(await fetch(`${GW}/functions/v1/pin-login`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ usuario_id: cajeroAcc.usuario_id, pin: "1234", caja_id: CAJA }),
  }));
  if (!emp.body.access_token) throw new Error(`pin-login falló: ${emp.status} ${JSON.stringify(emp.body)}`);
  const empToken = emp.body.access_token;
  console.log(`· pin-login OK: "${emp.body.usuario.nombre}" (JWT de empleado)`);

  // Setup mínimo del turno (lo hace la apertura de caja del POS; aquí por conexión directa).
  const c = await backend.pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: cajeroAcc.usuario_id, tenant_id: dev.body.user.app_metadata.tenant_id, role: "authenticated" })]);
  const suc = (await c.query("SELECT sucursal_id FROM cajas WHERE id=$1", [CAJA])).rows[0].sucursal_id;
  const abierto = (await c.query("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' ORDER BY fecha_apertura DESC LIMIT 1", [CAJA])).rows[0];
  const turno = abierto ? abierto.id : (await c.query(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'F1-VERIFY',CURRENT_DATE,$4,500,'TOTAL') RETURNING id`,
    [dev.body.user.app_metadata.tenant_id, suc, CAJA, cajeroAcc.usuario_id])).rows[0].id;
  await c.query("COMMIT"); c.release();

  // 4) VENTA por RPC como EMPLEADO (idéntico a supabase.rpc del POS)
  const hdr = { "content-type": "application/json", Authorization: `Bearer ${empToken}`, apikey: "anon" };
  const productos = await j(await fetch(`${GW}/rest/v1/productos?select=id,nombre,precio_base_mxn&order=precio_base_mxn.desc`, { headers: hdr }));
  const prod = productos.body[0];
  console.log(`· GET /rest/v1/productos (RLS empleado) → "${prod.nombre}" $${prod.precio_base_mxn}`);

  const ticket = await j(await fetch(`${GW}/rest/v1/rpc/abrir_ticket`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "PARA_LLEVAR", p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: "f1-verify-ticket", p_usuario_id: cajeroAcc.usuario_id }),
  }));
  const ticketId = ticket.body;
  await j(await fetch(`${GW}/rest/v1/rpc/agregar_item_a_ticket`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ p_ticket_id: ticketId, p_producto_id: prod.id, p_cantidad: 2, p_nota_cocina: null, p_modificadores: [], p_client_id_local: "f1-verify-item" }),
  }));
  const [antes] = (await j(await fetch(`${GW}/rest/v1/tickets?id=eq.${ticketId}&select=folio_completo,total_mxn,estado_fiscal`, { headers: hdr }))).body;
  await j(await fetch(`${GW}/rest/v1/rpc/aplicar_pago`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ p_ticket_id: ticketId, p_metodo_pago: "EFECTIVO", p_monto_mxn: antes.total_mxn, p_monto_recibido_mxn: antes.total_mxn, p_es_pago_al_recibir: false, p_client_id_local: "f1-verify-pago" }),
  }));
  const [fin] = (await j(await fetch(`${GW}/rest/v1/tickets?id=eq.${ticketId}&select=folio_completo,total_mxn,monto_pagado_mxn,estado_fiscal`, { headers: hdr }))).body;
  console.log(`· venta por REST: folio=${fin.folio_completo} pagado=$${fin.monto_pagado_mxn} estado=${fin.estado_fiscal}`);
  if (fin.estado_fiscal !== "PAGADO") throw new Error(`esperaba PAGADO, quedó ${fin.estado_fiscal}`);

  console.log("\n✅ FASE 1 CORE OK — device sign-in + empleados(RLS) + pin-login + venta(RPC) → PAGADO,");
  console.log("   TODO por el gateway local. El POS corre offline cambiando solo la URL de Supabase.");
} catch (e) {
  console.error("\n❌ FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
