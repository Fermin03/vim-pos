// El canje de lealtad por el camino REAL de la caja (ADR 0030): navegador → gateway → lealtad-puente
// → nube → asiento en el Postgres local. Las pruebas unitarias del puente usan un pool falso; aquí
// corren el gateway de verdad, la sesión de un cajero, las migraciones 0156–0159 y la función
// lealtad_asentar_canje. La nube es un servidor local que contesta como la Edge Function.
// Datos temporales y puertos propios (54384/54383/54372/54373): no toca la caja instalada ni choca con los smokes.
// Uso: node src/verify-lealtad-canje.mjs
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startBackend } from "./backend.mjs";
import { abrirTurno, entrarComoCajero, exigir, j } from "./verify-sesion.mjs";

const GW_PORT = 54372;
const NUBE_PORT = 54373;
const GW = `http://localhost:${GW_PORT}`;
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.com.mx";
const DEVICE_PASS = "vim-device-dev";
const CAJA = "99999999-0000-0000-0000-0000000000cc";
const TELEFONO = "4775550199";

const dir = mkdtempSync(path.join(tmpdir(), "vim-verify-lc-"));
let backend, nube;

// ── La nube de mentira ───────────────────────────────────────────────────────
// Guarda los canjes que autoriza y, al asentar, contesta SUS datos (los que la caja debe usar).
const estado = { caida: false, llamadas: [], canjes: new Map(), clienteId: null };
function levantarNube() {
  return new Promise((ok) => {
    const s = http.createServer(async (req, res) => {
      const trozos = [];
      for await (const t of req) trozos.push(t);
      const cuerpo = JSON.parse(Buffer.concat(trozos).toString() || "{}");
      estado.llamadas.push({ url: req.url, auth: req.headers.authorization, cuerpo });
      const send = (st, b) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (estado.caida) return req.socket.destroy(); // corte de red a media petición
      if (req.url !== "/functions/v1/lealtad-canje") return send(404, { error: "NO_EXISTE" });
      if (cuerpo.accion === "saldo") return send(200, { ok: true, saldo: 100, cliente_id: estado.clienteId });
      if (cuerpo.accion === "canjear") {
        estado.canjes.set(cuerpo.canje_id, { ...cuerpo });
        return send(200, { ok: true, canje_id: cuerpo.canje_id, saldo: 100 - cuerpo.puntos });
      }
      if (cuerpo.accion === "asentar") {
        const c = estado.canjes.get(cuerpo.canje_id);
        if (!c) return send(404, { ok: false, error: "CANJE_NO_EXISTE" });
        return send(200, {
          ok: true, canje_id: c.canje_id, ticket_id: c.ticket_id, cliente_id: estado.clienteId, telefono: TELEFONO,
          puntos: c.puntos, monto_mxn: c.puntos, premio_id: null, programa_version: 1,
        });
      }
      return send(400, { error: "ACCION_INVALIDA" });
    });
    s.listen(NUBE_PORT, "127.0.0.1", () => ok(s));
  });
}

try {
  nube = await levantarNube();
  backend = await startBackend({
    dataRoot: dir, pgPort: 54384, restPort: 54383, gatewayPort: GW_PORT, host: "127.0.0.1", log: () => {},
    nube: async () => ({ cloudUrl: `http://127.0.0.1:${NUBE_PORT}`, anonKey: "anon-de-prueba", deviceToken: "token-del-dispositivo" }),
  });
  console.log("· backend temporal y nube de mentira arriba");
  const q = async (sql, p) => (await backend.pool.query(sql, p)).rows;

  // Sesiones: la de la caja (dispositivo) y la de un cajero (PIN), como hace el POS.
  const s = await entrarComoCajero(GW, { email: DEVICE_EMAIL, password: DEVICE_PASS, caja: CAJA });
  const { hdr, rpc, tenant } = s;
  const lealtad = async (cuerpo, cabeceras = hdr) =>
    j(await fetch(`${GW}/functions/v1/lealtad-canje`, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) }));

  // Programa de puntos = dinero, una clienta con 100 puntos en la caja, turno abierto.
  await q("INSERT INTO lealtad_programa (tenant_id, mecanica, porcentaje) VALUES ($1, 'PUNTOS_DINERO', 10)", [tenant]);
  const cliente = (await q("INSERT INTO clientes (tenant_id, nombre, telefono) VALUES ($1, 'Clienta Verify', $2) RETURNING id", [tenant, TELEFONO]))[0].id;
  estado.clienteId = cliente;
  await q("SELECT lealtad_registrar_movimiento(NULL, $1, $2, 'GANADO', 100, 1)", [tenant, cliente]);
  // Turno: lo abre la apertura de caja del POS; aquí por conexión directa.
  const { suc, turno } = await abrirTurno(backend.pool, s, "VERIFY-LC");

  // Una cuenta de esa clienta con un producto que cueste más que el canje.
  const prod = (await q("SELECT id FROM productos WHERE tenant_id = $1 AND precio_base_mxn >= 50 AND NOT es_combo AND deleted_at IS NULL ORDER BY precio_base_mxn LIMIT 1", [tenant]))[0];
  exigir(prod, "el seed no trae un producto de $50 o más");
  const abrir = async (clave) => {
    const id = await rpc("abrir_ticket", { p_sucursal_id: suc, p_caja_id: CAJA, p_turno_id: turno, p_modo_servicio: "PARA_LLEVAR", p_cliente_id: cliente, p_marca_virtual_id: null, p_client_id_local: clave, p_usuario_id: s.cajeroId });
    await rpc("agregar_item_a_ticket", { p_ticket_id: id, p_producto_id: prod.id, p_cantidad: 1, p_nota_cocina: null, p_modificadores: [], p_client_id_local: `${clave}-item` });
    return id;
  };
  const ticket = await abrir("verify-lc-1");
  const totalAntes = Number((await q("SELECT total_mxn FROM tickets WHERE id = $1", [ticket]))[0].total_mxn);
  console.log(`· cuenta abierta por $${totalAntes} a nombre de la clienta`);

  // 1) La cuenta de la CAJA (antes del PIN) no canjea: solo un empleado.
  const sinEmpleado = await lealtad({ accion: "saldo", telefono: TELEFONO }, { ...hdr, Authorization: `Bearer ${s.deviceToken}` });
  exigir(sinEmpleado.status === 403 && sinEmpleado.body.error === "SOLO_EMPLEADO", `la sesión de la caja debía dar 403 SOLO_EMPLEADO y dio ${sinEmpleado.status} ${JSON.stringify(sinEmpleado.body)}`);
  exigir(estado.llamadas.length === 0, "la sesión de la caja no debía llegar a la nube");

  // 2) Canjear: se reenvía con el token del DISPOSITIVO y el empleado de la sesión local.
  const canje = randomUUID();
  const c1 = await lealtad({ accion: "canjear", canje_id: canje, cliente_id: cliente, telefono: TELEFONO, puntos: 40, ticket_id: ticket, usuario_id: "suplantado", tenant_id: "otro" });
  exigir(c1.status === 200 && c1.body.ok === true, `canjear → ${c1.status} ${JSON.stringify(c1.body)}`);
  const visto = estado.llamadas.at(-1);
  exigir(visto.auth === "Bearer token-del-dispositivo", "a la nube debe ir el token del dispositivo, no el del empleado");
  exigir(visto.cuerpo.usuario_id === s.cajeroId, "el empleado sale de la sesión local, no del navegador");
  exigir(!("tenant_id" in visto.cuerpo), "el negocio no viaja desde el navegador");
  exigir((await q("SELECT count(*)::int AS n FROM ticket_canjes_lealtad WHERE ticket_id = $1", [ticket]))[0].n === 0, "canjear NO toca la base local");
  console.log("· canjear: reenviado con la identidad correcta, sin tocar la caja");

  // 3) Asentar: la caja escribe el canje en SU cuenta con los datos que confirmó la nube.
  const a1 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: ticket });
  exigir(a1.status === 200 && a1.body.ok === true, `asentar → ${a1.status} ${JSON.stringify(a1.body)}`);
  const fila = (await q("SELECT cliente_id, puntos, monto_descontado_mxn, created_by, revertido FROM ticket_canjes_lealtad WHERE id = $1", [canje]))[0];
  exigir(fila && fila.cliente_id === cliente && fila.puntos === 40 && Number(fila.monto_descontado_mxn) === 40 && fila.created_by === s.cajeroId && fila.revertido === false,
    `el canje asentado no es el esperado: ${JSON.stringify(fila)}`);
  const t = (await q("SELECT total_mxn, lealtad_mxn FROM tickets WHERE id = $1", [ticket]))[0];
  exigir(Number(t.lealtad_mxn) === 40, `la cuenta debía llevar $40 de lealtad y lleva ${t.lealtad_mxn}`);
  exigir(Math.abs(Number(t.total_mxn) - (totalAntes - 40)) < 0.011, `el total debía bajar $40: antes ${totalAntes}, ahora ${t.total_mxn}`);
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 60, "el saldo local debía quedar en 60");
  const pendientes = await q("SELECT count(*)::int AS n FROM lealtad_movimientos m WHERE m.id = $1", [canje]);
  exigir(pendientes[0].n === 1, "el movimiento del canje debe existir en la caja");
  console.log("· asentar: canje en la cuenta, total y saldo correctos");

  // 4) Reintentar el asiento (se cortó la respuesta) no duplica nada.
  const a2 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: ticket });
  exigir(a2.status === 200, `el reintento debía ser 200 y fue ${a2.status}`);
  exigir((await q("SELECT count(*)::int AS n FROM ticket_canjes_lealtad WHERE ticket_id = $1", [ticket]))[0].n === 1, "el reintento duplicó el canje");
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 60, "el reintento volvió a descontar");

  // 5) El mismo canje no se puede asentar en OTRA cuenta (la nube lo ató a la primera).
  const otra = await abrir("verify-lc-2");
  const a3 = await lealtad({ accion: "asentar", canje_id: canje, ticket_id: otra });
  exigir(a3.status === 502 && a3.body.error === "RESPUESTA_INVALIDA", `asentar en otra cuenta debía rechazarse (502) y dio ${a3.status} ${JSON.stringify(a3.body)}`);
  exigir(Number((await q("SELECT lealtad_mxn FROM tickets WHERE id = $1", [otra]))[0].lealtad_mxn) === 0, "la otra cuenta no debía recibir descuento");

  // 6) Una cuenta que ya tiene un canje vivo rechaza un segundo, con el código que el POS traduce.
  const canje2 = randomUUID();
  await lealtad({ accion: "canjear", canje_id: canje2, cliente_id: cliente, telefono: TELEFONO, puntos: 10, ticket_id: ticket });
  const a4 = await lealtad({ accion: "asentar", canje_id: canje2, ticket_id: ticket });
  exigir(a4.status === 409 && a4.body.error === "TICKET_YA_TIENE_CANJE", `un segundo canje debía dar 409 TICKET_YA_TIENE_CANJE y dio ${a4.status} ${JSON.stringify(a4.body)}`);
  console.log("· reintento idempotente; otra cuenta y segundo canje rechazados");

  // 7) Sin red, canjear dice SIN_RED y la caja no cambia.
  estado.caida = true;
  const c5 = await lealtad({ accion: "canjear", canje_id: randomUUID(), cliente_id: cliente, telefono: TELEFONO, puntos: 5, ticket_id: otra });
  exigir(c5.status === 503 && c5.body.error === "SIN_RED", `sin red debía dar 503 SIN_RED y dio ${c5.status} ${JSON.stringify(c5.body)}`);
  estado.caida = false;

  // 8) Quitar el canje devuelve el saldo y el total, sin pasar por la nube.
  const antesDeQuitar = estado.llamadas.length;
  await rpc("quitar_canje_lealtad", { p_ticket_id: ticket });
  const t2 = (await q("SELECT total_mxn, lealtad_mxn FROM tickets WHERE id = $1", [ticket]))[0];
  exigir(Number(t2.lealtad_mxn) === 0 && Math.abs(Number(t2.total_mxn) - totalAntes) < 0.011, `al quitar el canje la cuenta debía volver a ${totalAntes}: ${JSON.stringify(t2)}`);
  exigir(Number((await q("SELECT saldo FROM lealtad_saldos WHERE cliente_id = $1", [cliente]))[0].saldo) === 100, "al quitar el canje el saldo debía volver a 100");
  exigir(estado.llamadas.length === antesDeQuitar, "quitar el canje no llama a la nube");
  console.log("· sin red se dice; quitar el canje devuelve saldo y total en local");

  console.log("\n✅ Canje de lealtad OK de punta a punta en la caja (gateway + puente + asiento local).");
} catch (e) {
  console.error("\n❌ FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  try { if (backend) await backend.stop(); } catch { /* que un fallo al parar no deje la nube ni el pgdata sin limpiar */ }
  try { if (nube) await new Promise((ok) => nube.close(ok)); } catch { /* idem */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows suelta el pgdata tarde */ }
}
