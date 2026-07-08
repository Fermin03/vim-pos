// Fase 1 · Verificación del sync PULL contra una "nube simulada" (sin depender del cloud).
// Simula que el Admin, en la nube, cambió un precio, agregó un producto y dio de alta un
// empleado con PIN. Aplica el pull al device y comprueba que TODO se refleja localmente —
// incluido que el PIN del empleado nuevo YA sirve para el login local (el pin_hash bajó y valida).
import { startBackend } from "./backend.mjs";
import { pullSnapshot } from "./sync-pull.mjs";
import { pinLogin } from "./auth.mjs";

const CAJA = "99999999-0000-0000-0000-0000000000cc";
const NUEVO_EMP = "aaaaaaaa-1111-2222-3333-444444444444";
let backend;

try {
  backend = await startBackend({ log: () => {} });
  const pool = backend.pool;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  const tenant = (await q("SELECT id FROM tenants LIMIT 1"))[0].id;
  const suc = (await q("SELECT sucursal_id FROM cajas WHERE id=$1", [CAJA]))[0].sucursal_id;
  const clasica = (await q("SELECT * FROM productos WHERE nombre='Hamburguesa Clásica' LIMIT 1"))[0];
  const rolCajero = (await q("SELECT id FROM roles WHERE codigo='CAJERO' AND es_sistema=true LIMIT 1"))[0].id;
  const perfilMaria = (await q("SELECT * FROM usuarios_perfil WHERE nombre LIKE 'María%' LIMIT 1"))[0];
  const accesoMaria = (await q("SELECT ua.* FROM usuarios_acceso ua JOIN roles r ON r.id=ua.rol_id WHERE r.codigo='CAJERO' AND ua.tenant_id=$1 LIMIT 1", [tenant]))[0];
  const authMaria = (await q("SELECT * FROM auth.users WHERE id=$1", [perfilMaria.id]))[0];
  const hash5678 = (await q("SELECT crypt('5678', gen_salt('bf')) AS h"))[0].h;

  console.log(`· precio actual de "Hamburguesa Clásica": $${clasica.precio_base_mxn}`);

  // ── Snapshot que "viene de la nube" ──────────────────────────────────────────
  const nuevoProd = "bbbbbbbb-5555-6666-7777-888888888888";
  const snapshot = {
    __watermark: "sim-2026-06-11T18:00:00Z",
    // El snapshot trae FILAS COMPLETAS (como el SELECT * de la Edge Function): ON CONFLICT
    // valida NOT NULL en el INSERT antes de resolver el conflicto, así que no valen parciales.
    productos: [
      // 1) cambio de precio (fila completa existente → UPDATE)
      { ...clasica, precio_base_mxn: 135.0 },
      // 2) producto nuevo (fila completa → INSERT)
      { ...clasica, id: nuevoProd, nombre: "Malteada", precio_base_mxn: 60.0 },
    ],
    // 3) empleado nuevo con PIN 5678 (auth.users + perfil con pin_hash + acceso)
    users: [{ ...authMaria, id: NUEVO_EMP, email: "nuevo@knockout.dev" }],
    usuarios_perfil: [{ ...perfilMaria, id: NUEVO_EMP, nombre: "Nuevo Cajero", pin_hash: hash5678 }],
    usuarios_acceso: [{ ...accesoMaria, id: accesoMaria.id ? NUEVO_EMP : undefined, usuario_id: NUEVO_EMP, tenant_id: tenant, sucursal_id: suc, rol_id: rolCajero, activo: true }],
  };

  console.log("· aplicando pull del snapshot del tenant…");
  const resumen = await pullSnapshot(pool, snapshot, (m) => console.log(m));

  // ── Aserciones ───────────────────────────────────────────────────────────────
  const precio = (await q("SELECT precio_base_mxn FROM productos WHERE id=$1", [clasica.id]))[0].precio_base_mxn;
  const malteada = (await q("SELECT nombre, precio_base_mxn FROM productos WHERE id=$1", [nuevoProd]))[0];
  if (Number(precio) !== 135) throw new Error(`precio no se actualizó: ${precio}`);
  if (!malteada || Number(malteada.precio_base_mxn) !== 60) throw new Error("producto nuevo no llegó");
  console.log(`· precio actualizado → $${precio}; producto nuevo → "${malteada.nombre}" $${malteada.precio_base_mxn}`);

  // La prueba de fuego: el PIN del empleado nuevo YA valida en el login local.
  const login = await pinLogin(pool, backend.secret, { usuario_id: NUEVO_EMP, pin: "5678", caja_id: CAJA });
  if (!login.body?.access_token) throw new Error(`el empleado nuevo no pudo entrar: ${JSON.stringify(login.body)}`);
  console.log(`· login local del empleado nuevo (PIN 5678) → OK: "${login.body.usuario.nombre}"`);

  // Idempotencia: re-aplicar el mismo snapshot no rompe nada.
  await pullSnapshot(pool, snapshot, () => {});

  // Camino de PRODUCCIÓN real: la RPC sync_pull_snapshot() arma el snapshot del tenant
  // (exactamente lo que devolverá la Edge Function sync-pull) y el motor lo aplica sin error.
  const real = (await q("SELECT sync_pull_snapshot($1) AS s", [tenant]))[0].s;
  const nTablas = Object.keys(real).filter((k) => Array.isArray(real[k]) && real[k].length).length;
  const resumen2 = await pullSnapshot(pool, real, () => {});
  console.log(`· round-trip con sync_pull_snapshot() (camino de la Edge): ${nTablas} tablas → aplicadas ${Object.keys(resumen2).length} sin error`);

  console.log("\n✅ SYNC PULL OK — precio + producto + empleado(PIN) bajaron al device y funcionan;");
  console.log(`   upsert idempotente en orden de FKs + snapshot real de la RPC round-tripea. Tablas: ${Object.keys(resumen).join(", ")}.`);
} catch (e) {
  console.error("\n❌ SYNC PULL FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
