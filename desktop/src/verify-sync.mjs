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

  // Ancla en CAJA (fija): "LIMIT 1" sobre tenants es ambiguo en una base de dev que ya tiene más
  // de un tenant (p.ej. uso real de la app además del fixture sembrado).
  const cajaFixture = (await q("SELECT tenant_id, sucursal_id FROM cajas WHERE id=$1", [CAJA]))[0];
  const tenant = cajaFixture.tenant_id;
  const suc = cajaFixture.sucursal_id;
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

  // ── Inventario (ADR 0013): baja insumo/existencia/receta, corrige por pendientes y descuenta al vender ──
  const pza = (await q("SELECT id FROM unidades_medida WHERE tenant_id=$1 AND codigo='PZA' LIMIT 1", [tenant]))[0]?.id;
  if (!pza) throw new Error("la base local no tiene unidades (¿seed sin sembrar_unidades_base?)");
  const INS = "cccccccc-1111-2222-3333-444444444444";
  const STOCK = "dddddddd-1111-2222-3333-444444444444";
  const REC = "eeeeeeee-1111-2222-3333-444444444444";
  // UPSERT, no UPDATE: este tenant de dev puede no tener fila en configuracion_tenant todavía
  // (una UPDATE sin match se queda callada en 0 filas y descontar_inventario_por_venta, que hace
  // JOIN contra esta tabla, no encuentra nada → tenant_id NULL → calcular_dia_contable revienta).
  await q(`INSERT INTO configuracion_tenant (tenant_id, modulo_inventario_activo) VALUES ($1, true)
           ON CONFLICT (tenant_id) DO UPDATE SET modulo_inventario_activo = true`, [tenant]);
  await q("DELETE FROM _vim_mov_ok").catch(() => {});
  await q("DELETE FROM movimientos_inventario WHERE insumo_id=$1", [INS]);
  // Un movimiento local PENDIENTE (salida de 3) que la nube aún no tiene.
  await pullSnapshot(pool, {
    __watermark: "sim-inv-0",
    unidades_medida: (await q("SELECT * FROM unidades_medida WHERE tenant_id=$1", [tenant])),
    insumos: [{ id: INS, tenant_id: tenant, nombre: "Pan verify", unidad_medida_id: pza, categoria: "PANIFICACION", costo_unitario_mxn: 4,
      metodo_valuacion: "PROMEDIO_PONDERADO", estado: "ACTIVO", stock_minimo_global: 2, stock_critico_global: 1, created_at: new Date(), updated_at: new Date() }],
  }, () => {});
  await q(`INSERT INTO movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, costo_unitario_mxn, stock_antes, stock_despues, fecha, dia_contable)
           VALUES ($1,$2,$3,'SALIDA_VENTA',3,4,10,7,now(),CURRENT_DATE)`, [tenant, suc, INS]);
  // La nube dice 10; la caja debe quedar en 7.
  await pullSnapshot(pool, {
    __watermark: "sim-inv-1",
    insumo_stock_sucursal: [{ id: STOCK, tenant_id: tenant, insumo_id: INS, sucursal_id: suc, stock_actual: 10, stock_negativo_flag: false, created_at: new Date(), updated_at: new Date() }],
    recetas: [{ id: REC, tenant_id: tenant, producto_id: clasica.id, version: 1, costo_total_mxn: 4, activa: true, created_at: new Date(), updated_at: new Date() }],
    receta_componentes: [{ id: "ffffffff-1111-2222-3333-444444444444", tenant_id: tenant, receta_id: REC, insumo_id: INS, cantidad: 1, es_critico: true, orden_visualizacion: 0, created_at: new Date(), updated_at: new Date() }],
  }, (m) => console.log(m));
  const stock7 = Number((await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS, suc]))[0].stock_actual);
  if (stock7 !== 7) throw new Error(`existencia corregida esperada 7, es ${stock7}`);
  console.log(`· existencia bajada 10 − 3 pendientes → ${stock7} (corrección por pendientes OK)`);

  // Vender 1 "Hamburguesa Clásica" en la caja: el trigger local descuenta 1 pza.
  // abrir_ticket/agregar_item_a_ticket/aplicar_pago usan auth.uid() (p.ej. pagos.usuario_id):
  // hace falta el mismo request.jwt.claims que pone supabase/scripts/smoke_sync_push.sql, y
  // set_config(...,true) es de transacción, así que va todo en un solo cliente/transacción.
  // client_id_local único por corrida: abrir_ticket/agregar_item_a_ticket son idempotentes por
  // (tenant, client_id_local), y esta base de dev persiste entre corridas de verify:sync — con un
  // literal fijo, la segunda corrida "reabriría" el ticket YA PAGADO de la corrida anterior.
  const runTag = Date.now().toString(36);
  const cVenta = await pool.connect();
  let ticket;
  try {
    await cVenta.query("BEGIN");
    await cVenta.query("SELECT set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: perfilMaria.id, tenant_id: tenant, role: "authenticated" })]);
    const turno = (await cVenta.query("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' LIMIT 1", [CAJA])).rows[0]?.id
      ?? (await cVenta.query(`INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
                   VALUES ($1,$2,$3,$5,CURRENT_DATE,$4,0,'TOTAL') RETURNING id`, [tenant, suc, CAJA, perfilMaria.id, `VERIFY-INV-${runTag}`])).rows[0].id;
    ticket = (await cVenta.query("SELECT abrir_ticket($1,$2,$3,'PARA_LLEVAR'::modo_servicio,NULL,NULL,$5,$4) AS id", [suc, CAJA, turno, perfilMaria.id, `verify-inv-${runTag}`])).rows[0].id;
    await cVenta.query("SELECT agregar_item_a_ticket($1,$2,1,NULL,'[]'::jsonb,$3)", [ticket, clasica.id, `verify-inv-item-${runTag}`]);
    const total = (await cVenta.query("SELECT total_mxn FROM tickets WHERE id=$1", [ticket])).rows[0].total_mxn;
    await cVenta.query("SELECT aplicar_pago($1,'EFECTIVO'::metodo_pago,$2,$2,NULL,NULL,NULL,false,NULL,$3)", [ticket, total, `verify-inv-pago-${runTag}`]);
    await cVenta.query("COMMIT");
  } catch (e) {
    await cVenta.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cVenta.release();
  }
  const stock6 = Number((await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS, suc]))[0].stock_actual);
  const movs = (await q("SELECT count(*)::int AS n FROM movimientos_inventario WHERE insumo_id=$1 AND ticket_id=$2 AND tipo='SALIDA_VENTA'", [INS, ticket]))[0].n;
  if (stock6 !== 6 || movs !== 1) throw new Error(`la venta local no descontó: existencia ${stock6}, movimientos ${movs}`);
  console.log(`· venta local con receta → existencia ${stock6}, 1 movimiento SALIDA_VENTA ligado al ticket (descuento local OK)`);

  // ── C1: reconciliar receta_componentes por padre (no por clave compuesta fila a fila) ──────
  // `guardar_receta` (0099) borra y reinserta los componentes con ids NUEVOS en cada edición del
  // dueño. El siguiente pull trae la MISMA pareja (receta_id, insumo_id) con otro id: antes esto
  // chocaba contra el índice único `receta_insumo_unico` y hacía ROLLBACK de TODO el pull, para
  // siempre. Ahora reconciliarCatalogo borra por padre (receta_id) antes de insertar.
  const compNuevoId = "11111111-2222-3333-4444-555555555555";
  await pullSnapshot(pool, {
    __watermark: "sim-inv-2",
    receta_componentes: [{ id: compNuevoId, tenant_id: tenant, receta_id: REC, insumo_id: INS, cantidad: 2, es_critico: true, orden_visualizacion: 0, created_at: new Date(), updated_at: new Date() }],
  }, (m) => console.log(m));
  const componentesReceta = await q("SELECT id, cantidad FROM receta_componentes WHERE receta_id=$1", [REC]);
  if (componentesReceta.length !== 1) throw new Error(`C1: esperaba 1 componente para la receta tras reconciliar por padre, hay ${componentesReceta.length}`);
  if (componentesReceta[0].id !== compNuevoId) throw new Error(`C1: el componente no quedó con el id nuevo de la nube (${componentesReceta[0].id})`);
  if (Number(componentesReceta[0].cantidad) !== 2) throw new Error(`C1: cantidad esperada 2, es ${componentesReceta[0].cantidad}`);
  console.log(`· receta_componentes reconciliado por padre (receta_id): 1 componente con id nuevo de la nube, cantidad 2 (C1 OK)`);

  // ── C2: unidades_medida con id de nube distinto al local (misma clave natural codigo+tenant) ──
  // Simula una caja de campo que sembró sus unidades (0035/0085) con gen_random_uuid() antes de
  // que existiera el pull: el código coincide con la nube pero el id no. Se usa KG (no PZA, que ya
  // está en uso por el insumo de esta misma prueba) para no dejar nada colgando de un id borrado.
  const kgLocal = (await q("SELECT id FROM unidades_medida WHERE tenant_id=$1 AND codigo='KG'", [tenant]))[0];
  if (!kgLocal) throw new Error("C2: la base local no tiene la unidad KG (¿seed sin sembrar_unidades_base?)");
  const kgNube = "33333333-0000-0000-0000-000000000099";
  await pullSnapshot(pool, {
    __watermark: "sim-inv-3",
    unidades_medida: [{ id: kgNube, tenant_id: tenant, codigo: "KG", nombre: "Kilogramo", simbolo: "kg", dimension: "MASA", es_unidad_base: true, es_sistema: true, activa: true, orden_visualizacion: 6, created_at: new Date(), updated_at: new Date() }],
  }, (m) => console.log(m));
  const kgTrasPull = (await q("SELECT id FROM unidades_medida WHERE tenant_id=$1 AND codigo='KG'", [tenant]))[0];
  if (kgTrasPull.id !== kgNube) throw new Error(`C2: unidades_medida no se realineó con la nube: local sigue en ${kgTrasPull.id}, esperaba ${kgNube}`);
  console.log(`· unidades_medida reconciliado por clave natural (codigo,tenant_id): id local ahora = id de la nube (C2 OK)`);

  // ── I1: la corrección por pendientes solo toca lo que la nube mandó EN ESTE pull ───────────
  // Antes, corregirExistenciasPorPendientes tomaba TODO movimiento local sin confirmar y corregía
  // su (insumo, sucursal) aunque la nube no lo hubiera mandado en el snapshot — p.ej. un insumo sin
  // fila de existencia todavía en la nube. Eso resta de una fila que la nube nunca tocó: drift de
  // una unidad por pull. Aquí INS2 tiene un movimiento pendiente pero NO viaja en el pull.
  const INS2 = "cccccccc-2222-3333-4444-555555555555";
  await q("DELETE FROM movimientos_inventario WHERE insumo_id=$1", [INS2]);
  await q(`INSERT INTO insumos (id, tenant_id, nombre, unidad_medida_id, categoria, costo_unitario_mxn, metodo_valuacion, estado, stock_minimo_global, stock_critico_global)
           VALUES ($1,$2,'Sal verify',$3,'OTROS',2,'PROMEDIO_PONDERADO','ACTIVO',1,0)
           ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`, [INS2, tenant, pza]);
  await q(`INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual)
           VALUES ($1,$2,$3,20) ON CONFLICT (insumo_id, sucursal_id) DO UPDATE SET stock_actual = 20`, [tenant, INS2, suc]);
  await q(`INSERT INTO movimientos_inventario (tenant_id, sucursal_id, insumo_id, tipo, cantidad, costo_unitario_mxn, stock_antes, stock_despues, fecha, dia_contable)
           VALUES ($1,$2,$3,'SALIDA_VENTA',5,2,20,15,now(),CURRENT_DATE)`, [tenant, suc, INS2]);
  const stockActualINS = (await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS, suc]))[0].stock_actual;
  // El pull manda existencia SOLO de INS (re-envía su valor actual tal cual); INS2 no viaja.
  await pullSnapshot(pool, {
    __watermark: "sim-inv-4",
    insumo_stock_sucursal: [{ id: STOCK, tenant_id: tenant, insumo_id: INS, sucursal_id: suc, stock_actual: stockActualINS, stock_negativo_flag: false, created_at: new Date(), updated_at: new Date() }],
  }, (m) => console.log(m));
  const stockINS2 = Number((await q("SELECT stock_actual FROM insumo_stock_sucursal WHERE insumo_id=$1 AND sucursal_id=$2", [INS2, suc]))[0].stock_actual);
  if (stockINS2 !== 20) throw new Error(`I1: la corrección tocó un insumo que la nube no mandó en este pull; esperaba 20, es ${stockINS2}`);
  console.log(`· corrección por pendientes acotada a lo que trajo el pull: INS2 sin tocar (${stockINS2}) pese a tener un movimiento local pendiente (I1 OK)`);

  console.log("\n✅ SYNC PULL OK — precio + producto + empleado(PIN) + inventario bajaron al device y funcionan;");
  console.log(`   upsert idempotente en orden de FKs + snapshot real de la RPC round-tripea + corrección por pendientes + descuento local. Tablas: ${Object.keys(resumen).join(", ")}.`);
} catch (e) {
  console.error("\n❌ SYNC PULL FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.stop();
}
