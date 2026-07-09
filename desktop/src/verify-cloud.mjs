// Fase 1 · #3 — Test del sync REAL contra la nube (post-deploy). Ejercita el ciclo completo
// device↔cloud usando las Edge Functions sync-pull/sync-push desplegadas en tu Supabase.
//
// Requiere (env), tras despausar el cloud y desplegar las 2 Edge + migraciones 0055/0056:
//   VIM_CLOUD_URL     = https://pbiaxzvmssjsxdwqrumb.supabase.co
//   VIM_CLOUD_ANON    = <anon key del proyecto>            (pública; Vercel/dashboard)
//   VIM_DEVICE_EMAIL  = caja-<caja_id>@dispositivos.vimpos.mx
//   VIM_DEVICE_PASS   = <clave del dispositivo>
// Uso:  VIM_CLOUD_URL=… VIM_CLOUD_ANON=… VIM_DEVICE_EMAIL=… VIM_DEVICE_PASS=… npm run verify:cloud
import { startBackend } from "./backend.mjs";
import { pullFromCloud } from "./sync-pull.mjs";
import { pushToCloud } from "./sync-push.mjs";

const { VIM_CLOUD_URL: cloudUrl, VIM_CLOUD_ANON: anonKey, VIM_DEVICE_EMAIL: email, VIM_DEVICE_PASS: pass } = process.env;
let backend;

try {
  if (!cloudUrl || !anonKey || !email || !pass) {
    console.error("❌ Falta configurar el env de nube: VIM_CLOUD_URL, VIM_CLOUD_ANON, VIM_DEVICE_EMAIL, VIM_DEVICE_PASS.");
    console.error("   (Despausa el cloud + despliega sync-pull/sync-push + migraciones 0055/0056 primero — ver RUNBOOK.)");
    process.exit(2);
  }

  backend = await startBackend({ log: () => {} });
  console.log("· backend local arriba");

  // 1) Login del dispositivo contra la NUBE (GoTrue real)
  const r = await fetch(`${cloudUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login de dispositivo en la nube falló: ${JSON.stringify(s).slice(0, 200)}`);
  const deviceToken = s.access_token;
  const opts = { cloudUrl, anonKey, deviceToken };
  console.log("· device sign-in contra la NUBE OK");

  // Tenant real del cloud (del claim del JWT del dispositivo).
  const tenantCloud = JSON.parse(atob(deviceToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).tenant_id;

  // 2) PULL real: baja la rebanada del tenant desde la nube al Postgres local
  const rp = await pullFromCloud(backend.pool, opts, (m) => console.log("  [pull]", m));
  console.log(`· PULL real OK: ${Object.keys(rp).length} tablas bajadas de la nube`);
  // Mostrar QUÉ bajó (datos reales de tu cloud, ahora en la caja local):
  const q = async (sql, p) => (await backend.pool.query(sql, p)).rows;
  const ten = (await q("SELECT nombre_comercial FROM tenants WHERE id=$1", [tenantCloud]))[0];
  const nSuc = (await q("SELECT count(*)::int n FROM sucursales WHERE tenant_id=$1", [tenantCloud]))[0].n;
  const nProd = (await q("SELECT count(*)::int n FROM productos WHERE tenant_id=$1", [tenantCloud]))[0].n;
  const nEmp = (await q("SELECT count(*)::int n FROM usuarios_acceso WHERE tenant_id=$1", [tenantCloud]))[0].n;
  console.log(`  → tenant real "${ten?.nombre_comercial ?? tenantCloud}": ${nSuc} sucursales · ${nProd} productos · ${nEmp} accesos, ahora en la caja local`);

  // 3) PUSH real: sube las ventas terminales locales a la nube (0 si la caja local no tiene ventas del tenant real)
  const rs = await pushToCloud(backend.pool, opts, (m) => console.log("  [push]", m));
  console.log(`· PUSH real OK: ${rs.subidos} ventas subidas a la nube`);

  console.log("\n✅ SYNC REAL device↔nube OK — pull (referencia↓) + push (ventas↑) contra tu Supabase cloud.");
} catch (e) {
  console.error("\n❌ SYNC REAL FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
