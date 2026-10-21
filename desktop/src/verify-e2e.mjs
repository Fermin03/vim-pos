// Fase 1 · Verificación E2E del backend local — actúa EXACTAMENTE como el POS (supabase-js).
// device sign-in (GoTrue) → listar empleados (RLS) → pin-login (Edge) → venta por RPC → PAGADO.
// Todo contra el gateway local en localhost. Si esto pasa, el POS corre sin tocar su código.
import { startBackend } from "./backend.mjs";
import { entrarComoCajero, j } from "./verify-sesion.mjs";
import pg from "pg";

const GW_PORT = 54350;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";

let backend;

try {
  backend = await startBackend({ gatewayPort: GW_PORT, log: () => {} });
  console.log("· backend local arriba");

  // 1–3) Sesión de la caja (supabase.auth.signInWithPassword), sus empleados bajo RLS por
  // /rest/v1 y el pin-login del cajero (Edge emulada).
  const s = await entrarComoCajero(GW, { email: DEVICE_EMAIL, password: DEVICE_PASS, caja: CAJA });
  console.log(`· device sign-in OK (tipo_identidad en claims, tenant en JWT)`);
  console.log(`· GET /rest/v1/usuarios_acceso (RLS device) → ${s.accesos} accesos del tenant`);
  console.log(`· pin-login OK: "${s.nombre}" (JWT de empleado)`);

  // Setup mínimo del turno (lo hace la apertura de caja del POS; aquí por conexión directa).
  const c = await backend.pool.connect();
  await c.query("BEGIN");
  await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: s.cajeroId, tenant_id: s.tenant, role: "authenticated" })]);
  const suc = (await c.query("SELECT sucursal_id FROM cajas WHERE id=$1", [CAJA])).rows[0].sucursal_id;
  const abierto = (await c.query("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' ORDER BY fecha_apertura DESC LIMIT 1", [CAJA])).rows[0];
  // El código del turno se genera único por corrida. Antes era el literal 'F1-VERIFY' y la tabla
  // tiene UNIQUE (sucursal_id, codigo_turno): mientras quedara un turno ABIERTO se reutilizaba y
  // no se notaba, pero en cuanto algo lo cerraba —verify:dia cierra todos los abiertos al empezar—
  // la siguiente corrida de este verify moría con "duplicate key codigo_turno_unico". Es decir:
  // `npm run verify:dia && npm run verify` fallaba siempre, y parecía una regresión del producto.
  const codigoTurno = `F1-VERIFY-${Date.now().toString(36).toUpperCase()}`;
  const turno = abierto ? abierto.id : (await c.query(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,$5,CURRENT_DATE,$4,500,'TOTAL') RETURNING id`,
    [s.tenant, suc, CAJA, s.cajeroId, codigoTurno])).rows[0].id;
  await c.query("COMMIT"); c.release();

  // 4) VENTA por RPC como EMPLEADO (idéntico a supabase.rpc del POS)
  const { hdr } = s;
  const productos = await j(await fetch(`${GW}/rest/v1/productos?select=id,nombre,precio_base_mxn&order=precio_base_mxn.desc`, { headers: hdr }));
  const prod = productos.body[0];
  console.log(`· GET /rest/v1/productos (RLS empleado) → "${prod.nombre}" $${prod.precio_base_mxn}`);

  const ticket = await j(await fetch(`${GW}/rest/v1/rpc/abrir_ticket`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "PARA_LLEVAR", p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: "f1-verify-ticket", p_usuario_id: s.cajeroId }),
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
