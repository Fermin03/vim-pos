// Fase 1 · Verificación del DÍA COMPLETO por el gateway local (lo que hace la UI, sin atajos):
// device sign-in → pin-login → abrir turno → venta → reporte X → arqueo → reporte Z → CERRADO.
// Prueba que abrir/cerrar turno y el corte de caja funcionan 100% offline por el gateway.
import { startBackend } from "./backend.mjs";

const GW_PORT = 54350;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";

const subDe = (tok) => JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub;
let backend;

async function api(method, path, token, body) {
  const r = await fetch(`${GW}${path}`, {
    method,
    headers: { "content-type": "application/json", apikey: "anon", Authorization: `Bearer ${token}`, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
const rpc = (path, token, body) => api("POST", `/rest/v1/rpc/${path}`, token, body);

try {
  backend = await startBackend({ gatewayPort: GW_PORT, log: () => {} });

  // 1) Auth device + empleado (por el gateway)
  const dev = await api("POST", `/auth/v1/token?grant_type=password`, "x", { email: DEVICE_EMAIL, password: DEVICE_PASS });
  const dtok = dev.access_token;
  const tenant = dev.user.app_metadata.tenant_id;
  const cajero = (await api("GET", `/rest/v1/usuarios_acceso?select=usuario_id,rol:roles(codigo)&activo=eq.true`, dtok)).find((a) => a.rol?.codigo === "CAJERO").usuario_id;
  const emp = await api("POST", `/functions/v1/pin-login`, dtok, { usuario_id: cajero, pin: "1234", caja_id: CAJA });
  const tok = emp.access_token;
  const suc = (await api("GET", `/rest/v1/cajas?id=eq.${CAJA}&select=sucursal_id,numero`, tok))[0];
  console.log(`· login device + cajero "${emp.usuario.nombre}"`);

  // Cerrar turnos abiertos previos (por conexión directa, con fecha_cierre) para partir limpio.
  await backend.pool.query("UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=$1 AND estado='ABIERTO'", [CAJA]);

  // 2) ABRIR TURNO por el gateway (igual que lib/turno.abrirTurno: insert a turnos)
  const codigo = `VD-${Date.now().toString().slice(-8)}`;
  const turno = (await api("POST", `/rest/v1/turnos`, tok, {
    tenant_id: tenant, sucursal_id: suc.sucursal_id, caja_id: CAJA, codigo_turno: codigo,
    dia_contable: new Date().toISOString().slice(0, 10), usuario_apertura_id: subDe(tok),
    fondo_inicial_mxn: 500, fondo_modo: "TOTAL",
  }))[0];
  console.log(`· turno abierto: ${turno.codigo_turno} (fondo $500)`);

  // 3) VENTA (por el gateway, como la caja)
  const prod = (await api("GET", `/rest/v1/productos?select=id,nombre,precio_base_mxn&order=precio_base_mxn.desc&limit=1`, tok))[0];
  const ticketId = await rpc("abrir_ticket", tok, { p_sucursal_id: suc.sucursal_id, p_caja_id: CAJA, p_turno_id: turno.id, p_modo_servicio: "PARA_LLEVAR", p_cliente_id: null, p_marca_virtual_id: null, p_client_id_local: `vd-${Date.now()}`, p_usuario_id: cajero });
  await rpc("agregar_item_a_ticket", tok, { p_ticket_id: ticketId, p_producto_id: prod.id, p_cantidad: 1, p_nota_cocina: null, p_modificadores: [], p_client_id_local: `vd-item-${Date.now()}` });
  const total = Number((await api("GET", `/rest/v1/tickets?id=eq.${ticketId}&select=total_mxn`, tok))[0].total_mxn);
  await rpc("aplicar_pago", tok, { p_ticket_id: ticketId, p_metodo_pago: "EFECTIVO", p_monto_mxn: total, p_monto_recibido_mxn: total, p_es_pago_al_recibir: false, p_client_id_local: `vd-pago-${Date.now()}` });
  console.log(`· venta PAGADA: "${prod.nombre}" $${total} (efectivo)`);

  // 3b) AUTORIZAR-PIN de un superior (supervisor Diego 4321 autoriza una acción del cajero,
  //     offline por el gateway) — cubre cancelar/descuento con PIN superior sin nube.
  const sup = await api("POST", `/functions/v1/autorizar-pin`, tok, {
    pin: "4321", accion: "aplicar_descuento", permiso_codigo: "descuento.manual_aplicar",
    entidad_tipo: "ticket", entidad_id: ticketId, monto: 20, motivo: "verify", caja_id: CAJA, turno_id: turno.id,
  });
  if (!sup?.ok) throw new Error(`autorizar-pin (supervisor) falló: ${JSON.stringify(sup)}`);
  console.log(`· autorizar-pin OK (supervisor Diego autoriza al cajero, offline)`);

  // 4) REPORTE X (previa del corte)
  const x = await rpc("reporte_x", tok, { p_turno_id: turno.id });
  const xr = Array.isArray(x) ? x[0] : x;
  console.log(`· Reporte X: efectivo esperado $${xr.efectivo_esperado_mxn ?? xr.efectivo_esperado ?? "?"} · tickets ${xr.tickets_pagados ?? xr.tickets ?? "?"}`);

  // 5) ARQUEO (declara el efectivo contado = fondo + venta efectivo)
  await rpc("arquear_caja", tok, {
    p_turno_id: turno.id,
    p_declaraciones: [{ metodo_pago: "EFECTIVO", monto_declarado_mxn: 500 + total, nota: "cierre día (verify)" }],
    p_motivo_corte: "CIERRE_TURNO", p_usuario_id: cajero, p_autorizacion_pin_id: null,
  });
  console.log(`· arqueo registrado: efectivo declarado $${500 + total}`);

  // 6) AUTORIZACIÓN PROPIA para cerrar (lo que hace la UI: el cajero con turno.cerrar_propio
  //    se auto-autoriza vía RPC — pasa por el gateway, no requiere la Edge autorizar-pin).
  const aut = await rpc("registrar_autorizacion_propia", tok, {
    p_accion: "cerrar_turno", p_permiso_codigo: "turno.cerrar_propio", p_entidad_tipo: "turno",
    p_entidad_id: turno.id, p_monto: null, p_motivo: "cierre día (verify)", p_caja_id: CAJA, p_turno_id: turno.id,
  });
  const autr = Array.isArray(aut) ? aut[0] : aut;
  if (!autr?.ok) throw new Error(`autorización propia falló: ${JSON.stringify(autr)}`);
  console.log(`· autorización propia OK (${autr.autorizacion_pin_id.slice(0, 8)}…)`);

  // 7) REPORTE Z (corte + cierre del turno) con la autorización
  const z = await rpc("reporte_z", tok, { p_turno_id: turno.id, p_efectivo_declarado_mxn: 500 + total, p_autorizacion_pin_id: autr.autorizacion_pin_id, p_cerrado_por_usuario_id: cajero, p_nota: null });
  const zr = Array.isArray(z) ? z[0] : z;
  console.log(`· Reporte Z generado: folio ${zr.folio_z ?? zr.codigo_z ?? "(z)"}`);

  // 7) Turno CERRADO
  const estado = (await api("GET", `/rest/v1/turnos?id=eq.${turno.id}&select=estado`, tok))[0].estado;
  if (estado !== "CERRADO") throw new Error(`turno no quedó CERRADO: ${estado}`);

  console.log(`\n✅ DÍA COMPLETO OK por el gateway local — login → turno → venta → X → arqueo → Z → CERRADO.`);
  console.log("   Toda la operación de un turno funciona offline por el POS de escritorio, sin atajos.");
} catch (e) {
  console.error("\n❌ DÍA FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
