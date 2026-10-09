# Entrega 4 — hechos del código (solo lectura, rama feat/tienda-admin)

Raíz: `vim-pos-tienda/`. Rutas relativas a ella. "nada" = se buscó y no existe.

## 0. Notas de las entregas previas (leídas)
- 1-base:1689 (Entrega 4): la caja manda `tienda: true` y `turno_abierto` en CADA sondeo; quien llame a `crear_ticket_desde_tienda` trata violación de unicidad del cliente como reintentable; si el cajero re-elige zona, `fijar_envio_ticket` repone el envío al precio de hoy.
- 2-funcion:1331-1339: escribir `estado` también en gestión NUBE; TOTAL_NO_COINCIDE / ENVIO_NO_COINCIDE / componente no disponible / producto inexistente → rechazo explícito con motivo cerrado, no expiración silenciosa; «agotado» en caja llega a la nube hasta 10 min después; banderas de IVA de la caja vs nube; forma de pago y nota del cliente por separado (`nota_general` las concatena con ' · '); decidir qué es `ERROR` para tienda; la regla «con repartidor = en camino» no mira el estado de la asignación.
- 3-admin:445: el interruptor solo lo guarda la nube; leer `modulos_efectivos`, no la columna; el admin nunca escribe `pausa_hasta`.
- Spec §8 (design.md:307-360): pantalla «Pedidos en línea», timbre cada 20 s mientras haya RECIBIDO, acciones `aceptar/rechazar/estado/tienda_pausar/tienda_reanudar/presente` en delivery-accion.

## 1. Edge Function `delivery-accion`
Archivo `supabase/functions/delivery-accion/index.ts` (205 líneas).

**Auth** (l.31-53): Bearer JWT → `admin.auth.getUser` (401 `NO_AUTH`/`AUTH_INVALIDA`); `claimsDe`/`tenantDeClaims` (403 `SIN_TENANT`); exige fila activa en `usuarios_acceso` para ese tenant. `esDispositivo = claims.tipo_identidad === "DISPOSITIVO"` (l.45); si es dispositivo, la caja sale del correo (`cajaIdDeEmail`) y se verifica contra `cajas` del tenant (`cajaDispositivo`). El empleado (POS web) y el dispositivo (agente y gateway del escritorio) usan la misma función; el gateway reenvía las llamadas del POS de escritorio con el token de DISPOSITIVO (ver §8), así que desde la caja instalada TODA acción llega como dispositivo.

**Cuerpo** (l.16-20): `{pedido_id, accion, motivo, detalle, tiempo_prep_min, sucursal_id, duracion, minutos, forzar}`. `FALTAN_CAMPOS` 400 si no hay `accion`.

**Acciones** (no existen `presente` ni `estado`; `grep` nada):
| acción | inputs | guard | llama a | SQL | errores |
|---|---|---|---|---|---|
| `tienda_estado/pausar/reanudar/prep` (l.71-102) | `sucursal_id` (+`duracion` 30m/1h/dia, `minutos`, `forzar`) | `accionExigeModulo` → `modulos_efectivos().efectivos.delivery_apps` o 403 `SIN_MODULO_DELIVERY` (l.64-67); busca `delivery_conexiones` (sucursal, `APP_UBEREATS`) → 404 `SIN_CONEXION_UBER` | Uber (`tienda-uber-acciones.ts`) | update `delivery_conexiones.config`, insert `delivery_eventos` | `TIENDA_ESTRATEGIA_UBER` 409, `PREP_FUERA_DE_RANGO` 400, `UBER_ERROR` 502 |
| (todas las de pedido) l.104-110 | `pedido_id` | lee `delivery_pedidos`; 404 `PEDIDO_NO_EXISTE`; **`pedido.app !== "APP_UBEREATS"` → 400 `APP_NO_SOPORTADA`** (un pedido TIENDA, con app `DRIVE_THRU`/`DELIVERY_PROPIO`, muere aquí) | — | — | — |
| `reclamar` (l.131-136) | pedido_id | solo dispositivo (403 `SOLO_DISPOSITIVO`); `gestion` debe ser ESCRITORIO (409 `GESTION_NUBE`); sucursal = la de la caja | — | `delivery_reclamar_pedido(p_pedido,p_caja)`; false → 409 `RECLAMADO_POR_OTRA_CAJA` | |
| `aceptar` (l.137-169) | pedido_id, tiempo_prep_min | estado ∈ RECIBIDO/ERROR si no 409 `ACCION_INVALIDA` | `uber.aceptar` | ESCRITORIO: (si dispositivo reclama) + `delivery_pedido_transicion(ACEPTADO)`; NUBE: `crear_ticket_desde_app` | `SIN_TURNO_ABIERTO`, `ITEM_SIN_MAPEAR`, `RPC_ERROR` 409; `UBER_ERROR` 502 (se ignora `YA_PROCESADA`) |
| `rechazar` (l.170-184) | motivo ∈ AGOTADO/CERRADO/SATURADO/POS_OFFLINE/OTRO (si no, OTRO), detalle | RECIBIDO/ERROR | `uber.rechazar(motivoRechazoUber)` | `delivery_pedido_transicion(RECHAZADO, "MOTIVO[: detalle]")` | `UBER_ERROR` |
| `listo` (l.185-197) | pedido_id | ACEPTADO/EN_PREPARACION | `uber.marcarLista` | `delivery_pedido_transicion(LISTO)` | `UBER_ERROR` |
Todas las de Uber insertan en `delivery_eventos` (`registrarSalida`, con `conexion_id: pedido.conexion_id`, que en TIENDA sería NULL; la columna admite NULL, 0090:111).

Excerpt — esqueleto (l.29-67 recortado, y 104-110, 128-135):
```ts
servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const claims = claimsDe(token);
  const tenantToken = tenantDeClaims(claims);
  if (!tenantToken) return json({ error: "SIN_TENANT" }, 403);
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id")
    .eq("usuario_id", userResp.user.id).eq("tenant_id", tenantToken).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = tenantToken;
  const esDispositivo = claims.tipo_identidad === "DISPOSITIVO";
  let cajaDispositivo: { id: string; sucursal_id: string } | null = null;
  if (esDispositivo) { /* cajaIdDeEmail → select cajas id,sucursal_id eq tenant */ }
  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);
  if (accionExigeModulo(body.accion)) {
    const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
    if (!moduloDeliveryActivo(mod)) return json({ error: "SIN_MODULO_DELIVERY" }, 403);
  }
  if (ACCIONES_TIENDA.includes(body.accion)) { /* ... l.71-102 ... */ }
  if (!body.pedido_id) return json({ error: "FALTAN_CAMPOS" }, 400);
  const { data: pData } = await admin.from("delivery_pedidos")
    .select("id, tenant_id, sucursal_id, app, id_externo, estado, folio_corto, conexion_id, gestion, gestion_caja_id").eq("id", body.pedido_id).maybeSingle();
  const pedido = pData as Pedido | null;
  if (!pedido || pedido.tenant_id !== tenantId) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
  if (pedido.app !== "APP_UBEREATS") return json({ error: "APP_NO_SOPORTADA" }, 400);
  const reclamarParaCaja = async (): Promise<Response | null> => {
    if (!cajaDispositivo) return null;
    if (pedido.sucursal_id !== cajaDispositivo.sucursal_id) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
    const { data: ok } = await admin.rpc("delivery_reclamar_pedido", { p_pedido: pedido.id, p_caja: cajaDispositivo.id });
    if (ok !== true) return json({ error: "RECLAMADO_POR_OTRA_CAJA", caja: pedido.gestion_caja_id }, 409);
    return null;
  };
```
Excerpt — `aceptar` ESCRITORIO / NUBE (l.137-169):
```ts
case "aceptar": {
  if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
  const { data: cx } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", pedido.conexion_id).maybeSingle();
  const minutos = Number(body.tiempo_prep_min) || Number((cx as { tiempo_prep_min?: number } | null)?.tiempo_prep_min) || 15;
  if (pedido.gestion === "ESCRITORIO") {
    if (esDispositivo) { const r = await reclamarParaCaja(); if (r) return r; }
    try {
      await uber.aceptar(pedido.id_externo, segundosAReadyTime(new Date(), minutos), pedido.folio_corto ?? pedido.id);
      await registrarSalida("accept", true, { minutos, gestion: "ESCRITORIO" });
    } catch (e) {
      await registrarSalida("accept", false, msg(e));
      if (!msg(e).startsWith("YA_PROCESADA")) { registrarError("delivery-accion", "UBER_ERROR", msg(e)); return json({ error: "UBER_ERROR" }, 502); }
    }
    await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "ACEPTADO", p_detalle: null });
    return json({ ok: true, gestion: "ESCRITORIO" });
  }
  const { data: ticketId, error: errRpc } = await admin.rpc("crear_ticket_desde_app", { p_pedido_id: pedido.id });
  if (errRpc) {
    const m = errRpc.message ?? String(errRpc);
    const codigo = m.includes("SIN_TURNO_ABIERTO") ? "SIN_TURNO_ABIERTO" : m.includes("ITEM_SIN_MAPEAR") ? "ITEM_SIN_MAPEAR" : "RPC_ERROR";
    registrarError("delivery-accion", codigo, m);
    return json({ error: codigo }, 409);
  }
  try { await uber.aceptar(...); await registrarSalida("accept", true, { minutos }); }
  catch (e) { /* igual que arriba */ }
  return json({ ok: true, ticket_id: ticketId });
}
```
Excerpt — `rechazar` y `listo` (l.170-197):
```ts
case "rechazar": {
  if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
  const motivo = MOTIVOS.includes(body.motivo as MotivoRechazo) ? (body.motivo as MotivoRechazo) : "OTRO";
  try {
    await uber.rechazar(pedido.id_externo, motivoRechazoUber(motivo, body.detalle));
    await registrarSalida("deny", true, { motivo });
  } catch (e) { /* UBER_ERROR 502 salvo YA_PROCESADA */ }
  await admin.rpc("delivery_pedido_transicion", {
    p_pedido_id: pedido.id, p_estado: "RECHAZADO", p_detalle: `${motivo}${body.detalle ? ": " + body.detalle : ""}`,
  });
  return json({ ok: true });
}
case "listo": {
  if (!["ACEPTADO", "EN_PREPARACION"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
  try { await uber.marcarLista(pedido.id_externo); await registrarSalida("ready", true, {}); }
  catch (e) { /* UBER_ERROR 502 */ }
  await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "LISTO", p_detalle: null });
  return json({ ok: true });
}
```
Excerpt — `tienda_pausar` (l.71-93; `tienda_*` es SOLO Uber):
```ts
if (ACCIONES_TIENDA.includes(body.accion)) {
  if (!body.sucursal_id) return json({ error: "FALTAN_CAMPOS" }, 400);
  const { data: cxData } = await admin.from("delivery_conexiones")
    .select("id, tenant_id, sucursal_id, tienda_id_externo, tiempo_prep_min, config, estado")
    .eq("sucursal_id", body.sucursal_id).eq("app", "APP_UBEREATS").maybeSingle();
  const cx = cxData as (ConexionTienda & { estado: string }) | null;
  if (!cx || cx.tenant_id !== tenantId || !cx.tienda_id_externo || !ESTADOS_CONECTADA.includes(cx.estado)) {
    return json({ error: "SIN_CONEXION_UBER" }, 404);
  }
  const deps = { db: admin as unknown as DbMinima, uber, ahora: () => new Date() };
  try {
    switch (body.accion) {
      case "tienda_pausar": {
        const d = body.duracion === "1h" || body.duracion === "dia" ? body.duracion : "30m";
        return json({ ok: true, tienda: await pausarTienda(deps, cx, d) });
      }
```

**Módulos puros**: `_shared/delivery/modulo.ts` (48 l., puro, probado en `modulo.test.ts`): `ACCIONES_TIENDA = ["tienda_estado","tienda_pausar","tienda_reanudar","tienda_prep"]` (l.20), `accionExigeModulo` (l.31, solo esas cuatro; las de pedido quedan fuera a propósito para poder despachar lo ya vendido), `moduloDeliveryActivo(mod)` = `efectivos.delivery_apps === true` (l.45-48, fail-closed). **Un negocio con `tienda` pero sin `delivery_apps` recibiría `SIN_MODULO_DELIVERY` en cualquier `tienda_*` si se reutilizan estos nombres; `modulo.test.ts` afirma `ACCIONES_TIENDA.length === 4`** (l.7) y que `aceptar/rechazar/listo/reclamar/cancelar/ticket` NO exigen módulo (l.10-14). `tienda-uber-acciones.ts` (86 l.) = I/O de Uber con `deps` inyectadas (`consultarEstadoTienda`, `pausarTienda`, `reanudarTienda`, `cambiarPrepTienda`), probado con db/uber falsos en `tienda-uber-acciones.test.ts` (103 l.). El handler `index.ts` NO se prueba (toca la base); no hay lógica pura para aceptar/rechazar/listo.

**Pruebas de funciones**: `pnpm test:functions` = `node --test --experimental-strip-types supabase/functions/_shared/{pac,delivery,lealtad,tienda}/*.test.ts ...` (package.json:17). Corre en CI (`ci.yml` job build-and-test, paso "Pruebas de las Edge Functions", l.89-98). Convención: lógica pura en `_shared/**` + `.test.ts` Node; handler sin pruebas.

## 2. SQL alrededor de los pedidos
Definiciones vigentes (ninguna rehecha después; migraciones 0161-0163 NO las tocan):
- `delivery_pedido_transicion(p_pedido_id uuid, p_estado text, p_detalle text DEFAULT NULL) RETURNS void` — 0091:129-146. SECURITY DEFINER, solo service_role. **No valida transiciones ni estados** (solo el CHECK de la tabla: RECIBIDO, ACEPTADO, RECHAZADO, EN_PREPARACION, LISTO, ENTREGADO, CANCELADO, EXPIRADO, ERROR, 0090:~99). Sella: `listo_at` (LISTO), `entregado_at` (ENTREGADO), `cancelado_at`+`motivo_cancelacion` (RECHAZADO/CANCELADO/EXPIRADO, con `p_detalle`), `ultimo_error` (ERROR). **No sella `aceptado_at` ni `cancelado_por`**, no limpia `ultimo_error`. `RAISE 'PEDIDO_NO_EXISTE'`.
- `delivery_reclamar_pedido(p_pedido uuid, p_caja uuid) RETURNS boolean` — 0096:30-38. `UPDATE ... SET gestion_caja_id = p_caja WHERE id AND gestion='ESCRITORIO' AND (gestion_caja_id IS NULL OR = p_caja)`; false si no.
- `delivery_enlazar_tickets(p_tenant uuid) RETURNS integer` — 0096:43-55. Empareja `t.origen_creacion='API_EXTERNA' AND t.folio_externo_app = p.id_externo AND t.modo_servicio = p.app` y pone `p.ticket_id`. Sirve para TIENDA sin tocarla (crear_ticket_desde_tienda pone `folio_externo_app = id_externo`, `origen_creacion='API_EXTERNA'`, abre con `modo_servicio = app`). Lo llama `sync-push/index.ts:48` tras cada push (best-effort).
- `delivery_marcar_expirados() RETURNS integer` — vigente en 0097:70+. UPDATE RECIBIDO con `vence_aceptacion < now()` → EXPIRADO (`motivo_cancelacion='Venció la ventana de aceptación'`, `cancelado_at=now()`), inserta `delivery_eventos` (`conexion_id` puede ser NULL), actualiza `delivery_conexiones` por `conexion_id` (NULL → no hace nada), y un aviso por sucursal. Cron `* * * * *` solo con pg_cron (nube). Sin filtro de canal: ya cubre TIENDA. NO mira si ya hay ticket local.
- `delivery_avisar_expirados(p_tenant, p_sucursal, p_n)` — 0097:36-67. Excerpt (títulos/URL fijos de Uber):
```sql
  SELECT nombre INTO v_sucursal FROM sucursales WHERE id = p_sucursal;
  v_titulo := 'Uber Eats: pedido sin aceptar';
  v_cuerpo := CASE WHEN p_n = 1 THEN '1 pedido venció sin aceptar' ELSE p_n || ' pedidos vencieron sin aceptar' END
              || COALESCE(' en ' || v_sucursal, '') || '. Revisa la caja.';
  ... jsonb_build_object('tenant_id', p_tenant, 'titulo', v_titulo, 'cuerpo', v_cuerpo, 'url', '/configuracion/integraciones')
```
  Firma recibe `(tenant, sucursal, n)`: para nombrar el canal hay que cambiar firma o agrupar por canal en `delivery_marcar_expirados` (`_exp_pasada` solo guarda id, tenant_id, sucursal_id).
- `sucursal_con_espejo(p_sucursal uuid, p_segundos integer DEFAULT 90) RETURNS boolean` — 0096:19-26; mira `cajas.espejo_apps_at`. (`sucursal_recibe_pedidos`, 0161:851, mira `espejo_turno_abierto_at`.)
- `vw_delivery_expirados_hoy` — 0093:43-48: `tenant_id, sucursal_id, n_expirados, ultimo_expirado_at` de `delivery_pedidos WHERE estado='EXPIRADO' AND cancelado_at::date = CURRENT_DATE` (UTC, sin filtro de canal), `security_invoker=on`, GRANT SELECT authenticated.
- **RLS/grants de `delivery_pedidos`** (0090:144-170): RLS on; `REVOKE ALL FROM anon, authenticated`; `GRANT SELECT TO authenticated`; `GRANT SELECT, INSERT, UPDATE TO service_role`; única política `delivery_pedidos_select USING (tenant_id = current_tenant_id())`. **`authenticated` NO puede UPDATE** (ni INSERT/DELETE); cualquier empleado/dispositivo del tenant lee toda la fila (incl. teléfono/dirección). Trigger `set_updated_at`. 0161 no cambió grants. Índices: `idx_delivery_pedidos_sucursal_activos` (parcial RECIBIDO/ACEPTADO/EN_PREPARACION/LISTO), `_suc_updated`, `_suc_recibido`, `idx_delivery_pedidos_seguimiento` único.
- El POS lee `delivery_pedidos` directo con `employeeClient` (ver §5 SELECT): columnas `id, app, id_externo, folio_corto, estado, tipo_entrega, cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion, recibido_at, ticket_id, ultimo_error, ticket:tickets(folio_completo)`. **No pide `canal`, `cliente_telefono`, `direccion`, `zona_envio_id`, `pago_al_recibir`, `paga_con_mxn`, `envio_mxn`, `subtotal_mxn`, `cliente_email`.** Tampoco filtra por canal (hoy los pedidos TIENDA ya saldrían en la lista, pero con la tarjeta de Uber).
- `crear_ticket_desde_tienda` (0161:400-549) deja el pedido en ACEPTADO con `ticket_id` y `aceptado_at` él mismo; acepta partir de RECIBIDO/ERROR/ACEPTADO; cliente por `lealtad_resolver_cliente` o INSERT en `clientes`; dirección en `direcciones_cliente`; `PERFORM fijar_envio_ticket`; `nota_general = concat_ws(' · ', pago, nota_cliente)`; errores `PEDIDO_NO_EXISTE`, `PEDIDO_NO_ES_DE_TIENDA`, `PEDIDO_NO_ACEPTABLE`, `SUCURSAL_DE_OTRO_NEGOCIO`, `SIN_TURNO_ABIERTO`, `CLIENTE_BLOQUEADO`, `DIRECCION_INVALIDA`, `ENVIO_NO_COINCIDE`, `TOTAL_NO_COINCIDE`. Usa `_delivery_items_a_ticket(ticket, items, NULL)` (sin producto genérico: producto no mapeado → error). `tienda_seguimiento` (0162:782-848): para gestión NUBE con ticket deriva LISTO/ENTREGADO/CANCELADO del ticket; para ESCRITORIO usa solo el `estado` guardado; `ERROR` se ve como EN_PROCESO; motivo de rechazo = primer token antes de ':' ∈ AGOTADO/CERRADO/SATURADO/OTRO (POS_OFFLINE → OTRO).

## 3. Agente de escritorio
`desktop/src/delivery-espejo.mjs` (244 l.), `-plan.mjs` (103), `-ritmo.mjs` (42).

**Cuerpo que manda hoy**: `llamar(opts, "delivery-espejo", { desde: cursor ?? undefined })` (l.136). **NO manda `tienda` ni `turno_abierto`.** `alcanceEspejo` en el servidor exige `cuerpo.tienda === true` (espejo.ts:62), así que hoy una caja nunca recibe pedidos TIENDA ni sella `espejo_turno_abierto_at`. El tick solo consulta `turnos` cuando `pedidos.length > 0` (l.145-149): para mandar `turno_abierto` en CADA sondeo hay que mover esa consulta antes de la llamada (o hacerla siempre).

**Token**: `crearEspejo({pool, nube, cajaId,...})`; `nube` = `tokenDeNubeCacheado` de main.mjs:1085 (cache 20 min, `forzar` tras 401) → `tokenDeNube()` (main.mjs:768) = login de dispositivo con las credenciales guardadas (`leerNube()`), devuelve `{cloudUrl, anonKey, deviceToken}`. `cajaId` = `cajaIdDeEmail(leerNube()?.email)`. 401 → `tokenCache=null; forzarLogin=true` y log `token rechazado (...)` (l.117-124). Timeout 15 s por llamada (l.112).

Excerpt — `upsertSql`, columnas y estado local (l.18-29):
```js
function upsertSql(tabla, columnas, conservar = []) {
  const cols = columnas.map((c) => `"${c}"`).join(", ");
  const vals = columnas.map((_, i) => `$${i + 1}`).join(", ");
  const set = columnas.filter((c) => c !== "id").map((c) =>
    conservar.includes(c) ? `"${c}" = COALESCE(${tabla}."${c}", EXCLUDED."${c}")` : `"${c}" = EXCLUDED."${c}"`).join(", ");
  return `INSERT INTO ${tabla} (${cols}) VALUES (${vals}) ON CONFLICT (id) DO UPDATE SET ${set}`;
}
const SQL_CONEXION = upsertSql("delivery_conexiones", COLUMNAS_CONEXION);
const COLS_PEDIDO_LOCAL = [...COLUMNAS_PEDIDO, "payload_raw", "ticket_id"];
const SQL_PEDIDO = upsertSql("delivery_pedidos", COLS_PEDIDO_LOCAL, ["ticket_id"]);
const json = (v) => (v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v);
```
`COLUMNAS_PEDIDO` (plan.mjs:5-13) = las 41 columnas de APP + `gestion, gestion_caja_id`; **no incluye `canal, cliente_email, tienda_cuenta_id, zona_envio_id, direccion, pago_al_recibir, paga_con_mxn`** (el servidor SÍ las manda a cajas con `tienda:true`: index.ts:31). Sin añadirlas, el upsert local de una fila TIENDA toma `canal='APP'` por default y viola `delivery_pedido_app_valida` (app DRIVE_THRU con canal APP / conexion_id NULL), y la transacción entera (Uber incluido) hace ROLLBACK en cada tick, sin avanzar el cursor. Y como `json(f[k] ?? null)` manda NULL para columnas ausentes (nubes viejas), `canal` NOT NULL necesita `?? 'APP'`.

Excerpt — tick completo (l.128-217, íntegro salvo comentarios):
```js
async function tick() {
  if (corriendo) return { omitido: "en curso" };
  corriendo = true;
  try {
    const opts = await opcionesNube();
    if (!opts) { fallos++; return { omitido: "sin nube" }; }
    const r = await llamar(opts, "delivery-espejo", { desde: cursor ?? undefined });
    if (!r.ok) { fallos++; log(`espejo HTTP ${r.status} ${r.body?.error ?? ""}`); return { error: r.status }; }
    fallos = 0;
    const { conexiones = [], pedidos = [], sucursal_id: sucursalId, siguiente_en_ms: siguiente } = r.body;
    cadencia = cadenciaAceptada(siguiente, cadaMs);
    let plan = { upserts: [], aCrear: [], aAceptar: [], avisos: [] };
    if (pedidos.length) {
      const { rows: localPedidos } = await pool.query(
        `SELECT id, ticket_id, estado FROM delivery_pedidos WHERE id = ANY($1::uuid[])`, [pedidos.map((p) => p.id)]);
      const { rows: turnos } = await pool.query(
        `SELECT 1 FROM turnos WHERE sucursal_id = $1 AND estado = 'ABIERTO' LIMIT 1`, [sucursalId]);
      plan = planificarEspejo({ conexiones, pedidos, localPedidos, turnoAbierto: turnos.length > 0, cajaId });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const c of conexiones) await client.query(SQL_CONEXION, COLUMNAS_CONEXION.map((k) => json(c[k] ?? null)));
      for (const f of plan.upserts) await client.query(SQL_PEDIDO, COLS_PEDIDO_LOCAL.map((k) => json(f[k] ?? null)));
      for (const a of plan.avisos) await client.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [a.pedidoId, a.motivo]);
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
    cursor = cursorDe(pedidos, cursor);
    let creados = 0, aceptados = 0, reintentables = 0;
    for (const id of plan.aCrear) {
      const pedido = pedidos.find((p) => p.id === id);
      const conexion = conexiones.find((c) => c.id === pedido?.conexion_id);
      const rec = await llamar(opts, "delivery-accion", { accion: "reclamar", pedido_id: id });
      if (!rec.ok) { log(`pedido ${pedido?.folio_corto ?? id}: ${rec.body?.error ?? rec.status} (no es de esta caja)`); continue; }
      try { await pool.query(`SELECT crear_ticket_desde_app($1)`, [id]); creados++; }
      catch (e) {
        const m = String(e?.message ?? e); const codigo = codigoDeError(m);
        await pool.query(`UPDATE delivery_pedidos SET ultimo_error = $2 WHERE id = $1`, [id, codigo]).catch(() => {});
        log(`pedido ${pedido?.folio_corto ?? id}: no se pudo crear el ticket local (${codigo})`);
        reintentables++; continue;
      }
      if (pedido?.estado === "RECIBIDO") {
        const ac = await llamar(opts, "delivery-accion", { accion: "aceptar", pedido_id: id, tiempo_prep_min: conexion?.tiempo_prep_min ?? 15 });
        if (ac.ok || ac.body?.error === "ACCION_INVALIDA") aceptados++;
        else { reintentables++; log(`pedido ${pedido?.folio_corto ?? id}: accept en Uber falló (${ac.body?.error ?? ac.status}); se reintenta`); }
      }
    }
    for (const id of plan.aAceptar ?? []) { /* mismo aceptar; reintento si el accept anterior falló */ }
    pendiente = reintentables > 0;
    if (creados || aceptados || plan.avisos.length) log(`${pedidos.length} pedidos espejados · ${creados} tickets creados · ${aceptados} aceptados · ${plan.avisos.length} avisos`);
    return { espejados: pedidos.length, creados, aceptados, avisos: plan.avisos.length };
  } catch (e) { fallos++; log(`tick falló: ${e?.message ?? e}`); return { error: String(e?.message ?? e) }; }
  finally { corriendo = false; }
}
```
Cosas que el tick hace hoy y que chocan con TIENDA: llama `crear_ticket_desde_app` (sin rama por `canal`); `conexion` es undefined (conexion_id NULL); manda `tiempo_prep_min ?? 15`; `codigoDeError` solo conoce códigos de apps/combos (`PREFIJOS_DE_ERROR`, l.51; falta `TOTAL_NO_COINCIDE`, `ENVIO_NO_COINCIDE`, `CLIENTE_BLOQUEADO`, `DIRECCION_INVALIDA`, unicidad de cliente); `SIN_TURNO_ABIERTO` aparece como reintentable; los avisos dicen «La app canceló este pedido: cancela el ticket en caja» (plan.mjs:66). El estado de un pedido ya aceptado NO se reporta a la nube en ningún caso (no hay llamada de estado).

**Reintentos / cadencia / log**: no hay reintento inmediato; `reintentables>0` → `pendiente=true` → `esperaEspejo` no duerme más de `PENDIENTE_MS=10 s`. El servidor dicta `siguiente_en_ms` (`cadenciaEspejo`: RAPIDA 10 s con algún RECIBIDO, NORMAL 30 s con tienda o conexión ACTIVA/PENDIENTE, REPOSO 300 s); la caja lo acota a [5 s, 600 s] (`cadenciaAceptada`), backoff `base*2^fallos` con tope 300 s, jitter ±10% (ritmo.mjs:114-145). La spec §8 pide 10 s mientras haya pedidos vivos de tienda; hoy `cadenciaEspejo` solo da 10 s con RECIBIDO (un pedido ACEPTADO/LISTO vivo da 30 s si `tienda` true). Log: `log(...)` → `console.log("· [espejo]", m)` (main.mjs:1121); mensajes en español, solo cuando hay creados/aceptados/avisos o errores.

Excerpt — `planificarEspejo` (plan.mjs:54-83; regla de auto-aceptar l.75-78):
```js
export function planificarEspejo({ conexiones = [], pedidos = [], localPedidos = [], turnoAbierto = false, cajaId }) {
  const porId = new Map(localPedidos.map((l) => [l.id, l]));
  const conexionDe = new Map(conexiones.map((c) => [c.id, c]));
  const upserts = []; const candidatos = []; const avisos = []; const aAceptar = [];
  for (const p of pedidos) {
    const local = porId.get(p.id);
    upserts.push(filaLocal(p, local));
    const conTicketLocal = Boolean(local?.ticket_id);
    if (CERRADOS_POR_LA_APP.has(p.estado) && conTicketLocal) {
      avisos.push({ pedidoId: p.id, motivo: "La app canceló este pedido: cancela el ticket en caja" });
      continue;
    }
    if (p.gestion !== "ESCRITORIO") continue;
    if (p.gestion_caja_id && p.gestion_caja_id !== cajaId) continue;
    if (conTicketLocal) { if (p.estado === "RECIBIDO") aAceptar.push(p); continue; }
    const cx = conexionDe.get(p.conexion_id);
    const porCajero = p.estado === "ACEPTADO";
    const autoOk = p.estado === "RECIBIDO" && cx?.auto_aceptar === true && turnoAbierto && puedeCrear(p, cx);
    if (porCajero || autoOk) candidatos.push(p);
  }
  candidatos.sort(/* por vence_aceptacion */); aAceptar.sort(/* idem */);
  return { upserts, aCrear: candidatos.map((p) => p.id), aAceptar: aAceptar.map((p) => p.id), avisos };
}
```
Salidas: `upserts` (filaLocal de TODOS), `aCrear`, `aAceptar`, `avisos`. Para TIENDA `cx` es undefined → `autoOk` siempre false (falta leer `tienda_config.aceptacion`). **El servidor NO manda `tienda_config.aceptacion` ni `minutos_aceptacion` ni `pausa_hasta`: el sondeo solo pregunta `tienda_sucursales.select("participa")`** (delivery-espejo/index.ts:103-106) aunque la spec §8 dice «el sondeo trae ese dato». Respuesta actual: `{ahora, caja_id, sucursal_id, conexiones, pedidos, siguiente_en_ms}`. `cadenciaEspejo({conexiones, pedidosVivos, tienda: tiendaViva})`.
Servidor, excerpts (delivery-espejo/index.ts:55-56, 80-83, 85-89, 92-107):
```ts
const cuerpo = (await req.json().catch(() => ({})) ?? {}) as { desde?: unknown; turno_abierto?: unknown; tienda?: unknown };
...
const alcance = alcanceEspejo({ efectivos, cuerpo });
if (alcance.canales.length === 0) { return json(respuestaSinModulo(caja.id, caja.sucursal_id)); }
const pedidosDe = () => admin.from("delivery_pedidos")
  .select(alcance.conTienda ? COLS_PEDIDO_TIENDA : COLS_PEDIDO)
  .eq("tenant_id", tenantId).eq("sucursal_id", caja.sucursal_id)
  .in("canal", alcance.canales)
  .order("recibido_at", { ascending: false }).limit(TOPE_PEDIDOS);
```
`COLS_PEDIDO_TIENDA = COLS_PEDIDO + canal, cliente_email, tienda_cuenta_id, zona_envio_id, direccion, pago_al_recibir, paga_con_mxn` (l.31). No trae `seguimiento_hash` ni `payload_raw`. Nota: si la caja manda `tienda:true` pero el negocio solo tiene `tienda` (no `delivery_apps`), `canales=["TIENDA"]`.

**`directivas.mjs`**: `debeSondearApps = (d) => d?.modulos?.delivery_apps === true` (l.105). Solo delivery: un negocio con tienda y sin delivery_apps NO arranca el agente. `modulos` en las directivas = `efectivos` completo de `modulos_efectivos` (resolver_directivas lo copia entero; ya trae la clave `tienda`, 0161:~750). Pruebas: `directivas.test.mjs`.
Excerpt — arranque/parada en `main.mjs` (l.1083-1150, 818-822):
```js
let espejo = null;
const poolLocal = poolVigente(() => backend?.pool);
function iniciarSync() {
  ... if (backend) backend.nube = tokenDeNubeCacheado;
  const cajaId = cajaDeEstaCaja();
  const { directivas: d } = directivas.leer();
  if (backend?.pool && cajaId && debeSondearApps(d) && !espejo) {
    espejo = crearEspejo({ pool: poolLocal, nube: tokenDeNubeCacheado, cajaId, log: (m) => console.log("· [espejo]", m) });
    espejo.iniciar();
  } else if (!cajaId) { console.log("· [espejo] omitido (la caja no está vinculada a la nube)"); }
  else if (!debeSondearApps(d)) { console.log("· [espejo] omitido (el cliente no tiene el módulo de apps de delivery)"); }
}
function sincronizarEspejoConModulo(d) {
  const activo = debeSondearApps(d);
  if (!activo && espejo) { try { espejo.detener(); } catch {} espejo = null; console.log("· [espejo] detenido (...)"); }
  else if (activo && !espejo) { /* crearEspejo + iniciar si backend?.pool && cajaId */ }
}
function detenerSync() { ciclo.detener(); ...; try { espejo?.detener(); } catch {} espejo = null; }
// latido (l.818-822): directivas.guardar(j.directivas); sincronizarEspejoConModulo(directivas.leer().directivas);
```
**Pruebas**: `pnpm test:escritorio` = `node --test desktop/src/*.test.mjs` (package.json:25; CI: job `desktop`, `ci.yml` l.171-177 `node --test src/*.test.mjs`). `delivery-espejo.test.mjs` (290 l.), `-plan.test.mjs` (116), `-ritmo.test.mjs` (54), `directivas.test.mjs` usan pool y nube FALSOS (`poolFalso`, `nubeFalsa` con `fetchFn`): **no necesitan Postgres**. Los que sí levantan Postgres/pg: `arranque-reintentos`, `auth`, `parada`, `privilegios`, `sync-push` `.test.mjs` (grep de `startLocalBackend`/`pg.`); la validación real de SQL local va en `desktop/scripts/smokes.mjs` (`npm run smokes`, Postgres embebido recién sembrado, corre `supabase/scripts/smoke_*.sql`; ya existen `smoke_tienda_{canal,ticket,estado,pedido,caja_lista,...}.sql`) y en `verify-*.mjs`. Tests actuales no cubren una fila TIENDA ni `crear_ticket_desde_tienda` desde el agente.

## 4. Base local de la caja
- **Migraciones**: `runtime.mjs:439-457` — crea `_vim_migraciones(nombre PK, aplicada_at)`, lee `readdirSync(migrationsDir)` (carpeta `resources/migrations` empaquetada desde `../supabase/migrations`, desktop/package.json:64-65; en dev `MIGRATIONS`) ordenado, ejecuta cada `.sql` no registrado y lo inserta. Falla con `Migración X falló`. Por tanto 0161-0163 (y la que cree entrega 4) viajan SOLO con el instalador y se aplican al arrancar; 0161 crea también `tienda_config`, `tienda_sucursales`, etc. en la base local (vacías: no hay sync de ellas).
- **¿`delivery_pedidos` se sincroniza?** NO por pull/push: solo por el agente de espejo. `PULL_ORDER` (sync-pull.mjs:11-57) trae `zonas_envio` (l.16), `clientes` (l.39) y `cajas`, `productos`, `configuracion_tenant`, etc.; **NO `tienda_config`, `tienda_sucursales`, `direcciones_cliente`, `delivery_pedidos`, `delivery_conexiones`**. `direcciones_cliente` solo SUBE (sync-push.mjs:561,633,665 las incluye junto con los clientes del ticket) y se re-apunta en el pull (sync-pull.mjs:220). Es decir: clientes y zonas bajan; las direcciones que cree `crear_ticket_desde_tienda` en la caja existen solo localmente hasta el push; la caja no sabe de `tienda_config.aceptacion`, ni de horario/pausa (eso solo lo sabe la nube, y hoy el sondeo no lo envía).
- **Push**: `sync-push.mjs:34` `TERMINALES = ["PAGADO","FACTURADO","CANCELADO"]` — solo tickets terminales suben (y se re-suben si cambian). Un ticket de tienda abierto/impreso/asignado NO está en la nube hasta que se cobra o cancela. En la nube `delivery_enlazar_tickets` (sync-push/index.ts:44-50) pone `delivery_pedidos.ticket_id` solo entonces. Consecuencia: para pedidos ESCRITORIO la nube no puede derivar LISTO desde el ticket (a diferencia de la rama NUBE de `tienda_seguimiento`); hace falta que la caja lo reporte con una acción nueva.
- Conflicto previsto: `crear_ticket_desde_tienda` local puede crear un `clientes` (tenant, telefono) que ya existe en la nube pero aún no bajó → violación de unicidad al subir (la nota 1-base:1689 pide tratarlo como reintentable). El pull ya tiene fusión de duplicados por teléfono (sync-pull.mjs:~738-761).
- Sello de la libreta: los pedidos `delivery_pedidos` locales conservan `ticket_id` en el upsert (`conservar=["ticket_id"]`). El pull de la nube re-espeja `estado` (p.ej. RECIBIDO si el aceptar en la nube falló) sobre el ACEPTADO local que dejó la función.

## 5. Pantalla «Pedidos de apps» del POS
- `apps/pos/app/lib/pedidos-apps.ts` (268 l.): `AppPedido = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI"` (l.10), `PedidoAppEstado` los 9 estados (l.8). `PedidoApp` (l.25-30): `id, app, idExterno, folioCorto, estado, tipoEntrega, clienteNombre, notaCliente, items, totalCliente, venceAceptacion, recibidoAt, ticketId, ticketFolio, ultimoError`. Excerpt SELECT (l.35-44):
```ts
export async function leerPedidosApps(token: string, sucursalId: string): Promise<PedidoApp[]> {
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await employeeClient(token)
    .from("delivery_pedidos")
    .select("id, app, id_externo, folio_corto, estado, tipo_entrega, cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion, recibido_at, ticket_id, ultimo_error, ticket:tickets(folio_completo)")
    .eq("sucursal_id", sucursalId)
    .or(`estado.in.(${ACTIVOS.join(",")}),recibido_at.gte.${desde}`)
    .order("recibido_at", { ascending: false })
    .limit(100);
```
  Activos = RECIBIDO, ACEPTADO, EN_PREPARACION, LISTO, ERROR + cerrados de los últimos 30 min. El orden final lo da `ordenarPedidos` (l.159-170): RECIBIDO/ERROR por `vence_aceptacion` asc, luego ACEPTADO/EN_PREP, LISTO, cerrados por recibido desc. `itemsDesdeJson` lee `nombre_app, cantidad, precio_unitario_mxn, nota, alergenos, alergia_nota, producto_id (mapeado), modificadores[{nombre_app,cantidad,modificadores}]`. `accionPedidoApp(token, {pedidoId, accion: "aceptar"|"rechazar"|"listo", motivo, detalle, tiempoPrepMin})` (l.93-111) → POST `urlFuncion("delivery-accion")` con `encabezadosFuncion(token)`; devuelve `{ok, ticketId}` o `{ok:false, error, detalle}`. Mensajes de error específicos de Uber en `mensajeError` (componente l.30-39: SIN_TURNO_ABIERTO, ITEM_SIN_MAPEAR, YA_PROCESADA, SIN_RED, UBER_ERROR) y `mensajeErrorTienda` (l.256-267). Barra de tienda = `leerTiendaUber/pausarTiendaUber/reanudarTiendaUber/cambiarPrepUber` (tienda_estado/pausar/reanudar/prep de `delivery-accion`), refresco 60 s (`REFRESCO_TIENDA_MS`), `etiquetaTienda` («Uber: en línea», etc.).
- `components/pantalla-pedidos-apps.tsx` (292 l.): título «Pedidos de apps» (l.131); chip «N por aceptar»; barra de tienda (l.140-166) oculta si `SIN_CONEXION_UBER` (`sinConexion`); lista en grid; tarjeta (l.186-250): alerta de alergia, `etiquetaApp(p.app)` + folio, estado + cuenta atrás `mmss` (urgente <120 s, borde rojo), `Ticket {folio}`, cliente (`· recoge en tienda` si `tipoEntrega==="RECOGE_CLIENTE"`), ítems con modificadores/nota/alergia, `notaCliente`, «Total en la app», `ultimoError`; botones: Aceptar + Rechazar si RECIBIDO/ERROR; «Marcar listo» si ACEPTADO/EN_PREPARACION (que para TIENDA daría `APP_NO_SOPORTADA` y que la spec dice no añadir). Rechazo: diálogo con `MOTIVOS` AGOTADO («Producto agotado»), SATURADO («Cocina saturada»), CERRADO («Ya cerramos»), OTRO («Otro motivo») (l.19-24); sin campo de detalle. Pantalla refresca cada 10 s y reloj cada 1 s. Sin dirección, teléfono, forma de pago ni zona.
- Banner de expirados: `PantallaInicio` (pantalla-inicio.tsx:180-190) con `expiradosApps>0 && onPedidosApps`, texto «Se venció 1 pedido de app sin aceptar…»; datos de `leerExpiradosHoy` (vista `vw_delivery_expirados_hoy`) y `hayExpiradosSinVer` (localStorage `vimpos.apps.vistoExpirados`).
- Visibilidad: `home-pos.tsx:182` `const hayDelivery = modulos?.delivery_apps === true;` con `const { modulos } = useAcceso();`. `useAcceso` (banda-acceso.tsx:27) lee `leerDirectivas()` cada 60 s (`/__directivas` en escritorio, `mi_acceso()` RPC en web). Render: `if (enPedidosApps && hayDelivery) return <PantallaPedidosApps .../>` (home-pos.tsx:2163-2165); entrada: `onPedidosApps={hayDelivery ? ... : undefined}` (l.1943) y el mosaico `<Acceso label="Pedidos de apps" badge={nPedidosApps} .../>` solo si `onPedidosApps` (pantalla-inicio.tsx:205-209), `requiereTurno={sinTurno}`. **Un negocio con solo `tienda` (sin `delivery_apps`) no vería pantalla, mosaico, badge, sonido ni sondeo.**
- Excerpt — efecto de sondeo + sonido (home-pos.tsx:1360-1402):
```tsx
useEffect(() => {
  if (!hayDelivery) {
    setEnPedidosApps(false);
    return;
  }
  let vivo = true;
  const cargar = () => {
    leerPedidosApps(token, caja.sucursal_id)
      .then((ps) => {
        if (!vivo) return;
        const pendientes = ps.filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR");
        setNPedidosApps(pendientes.length);
        const vistos = idsAppsVistos.current;
        if (vistos === null) {
          idsAppsVistos.current = new Set(ps.map((p) => p.id));
          return;
        }
        const nuevos = ps.filter((p) => !vistos.has(p.id));
        ps.forEach((p) => vistos.add(p.id));
        if (nuevos.length > 0) {
          try { void new Audio("/sonidos/pedido-app.wav").play().catch(() => {}); } catch { /* sin audio: el badge basta */ }
        }
      })
      .catch(() => { /* informativo: sin red la caja sigue vendiendo */ });
    leerExpiradosHoy(token, caja.sucursal_id)
      .then(({ n, ultimo }) => { if (vivo) setExpiradosApps(hayExpiradosSinVer(ultimo) ? n : 0); })
      .catch(() => { /* informativo */ });
  };
  cargar();
  const id = setInterval(cargar, 10000);
  return () => { vivo = false; clearInterval(id); };
}, [hayDelivery, token, caja.sucursal_id]);
```
  Suena una vez por id nuevo (incluye pedidos que ya llegan ACEPTADO/cerrados que no estaban en `vistos`, p.ej. los expirados que entran a la ventana de 30 min); no se repite. El efecto no tiene lógica de repetición; la lista se vuelve a leer completa cada 10 s (la misma consulta que usa la pantalla, que además se repite cada 10 s si está abierta).
- Etiquetas de apps: `etiquetaApp(app: AppPedido)` en pedidos-apps.ts:147 delega en `etiquetaApp` de `packages/db/src/metodos-pago.ts:43` (tipo `AppReparto = "APP_RAPPI" | "APP_UBEREATS" | "APP_DIDI" | "APP_IFOOD" | "APP_OTRO"`, usa `ETIQUETA_MODO[app]` de `modos-servicio`). `DRIVE_THRU`/`DELIVERY_PROPIO` no entran en esos tipos (compila solo con casts). Pruebas: `apps/pos/app/lib/__tests__/pedidos-apps.test.ts` (helpers: segundosRestantes, etiquetas, ordenarPedidos, tienda de Uber, alergias, modificadores, itemsDesdeJson). El componente y el efecto de `home-pos.tsx` NO tienen prueba.

## 6. Comandas desde el POS
- `imprimirComandaPorAreas(dc: DatosComanda, lineas: LineaConArea[], registro?: RegistroComanda): Promise<string[]>` (home-pos.tsx:853-880): `agruparComandaPorArea(lineas)` (comanda-builder.ts:137) → un papel por área (si ninguna línea tiene área, uno solo); `estacionParaArea(areaId)` (lib/print/config.ts:116) = estación asignada a esa área en la config **local del navegador** (`leerConfigImpresoras`, localStorage `KEY`), si no la de COCINA; `obtenerImpresoraDeEstacion`; impresión en serie; un fallo no cancela las otras; devuelve los nombres de áreas que fallaron; por cada papel `registrarImpresionComanda` (RPC `imprimir_comanda`, lib/impresiones.ts:34-58, best effort) sin await.
- **Qué sella `comanda_impresa_at`**: el trigger `trg_comanda_imp_actualizar_ticket` de `comanda_impresiones` (0009:1358-1371): en INSERT con `resultado='OK'` y `evento_tipo='IMPRESION_INICIAL'` pone `comanda_impresa_at = COALESCE(comanda_impresa_at, fecha_impresion)`. Es decir, sella al primer papel OK de cualquier área. Con una sola impresora todas las áreas caen en la misma estación (la asignación por defecto), salen varios papeles seguidos en ella, y el primero OK sella.
- Excerpt `imprimirComandaCocina(ticketId: string, soloItems: string[], esAgregado: boolean)` (l.882-907):
```tsx
const imprimirComandaCocina = useCallback(async (ticketId: string, soloItems: string[], esAgregado: boolean) => {
  if (soloItems.length === 0) return; // nada nuevo que mandar: no se gasta papel
  try {
    const datos = await leerTicketParaImpresion(ticketId, {
      token, cajeroNombre: empleado.nombre, cajaNombre: caja.nombre, conLealtad: false,
    });
    const seleccion = datos.lineas.filter((l) => soloItems.includes(l.id) || (l.parentId != null && soloItems.includes(l.parentId)));
    const lineas = lineasParaComanda(seleccion);
    if (lineas.length === 0) return;
    const dc: DatosComanda = { ...comandaDe(datos, lineas), esAgregado };
    const fallidas = await imprimirComandaPorAreas(dc, lineas, { ticketId, evento: "IMPRESION_INICIAL" });
    if (fallidas.length > 0) {
      setError(`El pedido se envió a cocina, pero no se pudo imprimir la comanda de ${fallidas.join(" y ")}.`);
    }
  } catch {
    setError("El pedido se envió a cocina, pero no se pudo imprimir la comanda.");
  }
}, [token, empleado.nombre, caja.nombre, imprimirComandaPorAreas]);
```
  Recibe los ids de renglones (`soloItems`); para un ticket de tienda ya creado habría que pasar todos los `datos.lineas.map(l=>l.id)` o escribir una variante que no filtre. `leerTicketParaImpresion(ticketId, ctx)` (lib/print/ticket-datos.ts:176): lee `tickets` (folio, modo, cliente_id, direccion_entrega_id, nombre_cliente, totales...) y `ticket_items` + área; **no lee `nota_general`**; para `modo_servicio==='DELIVERY_PROPIO'` añade `entrega` vía `leerEntrega` (cliente, teléfono, dirección armada, referencias, notas_repartidor) que usa el ticket del cliente (ticket-builder.ts:64). `comandaDe` (home-pos.tsx:109) pone `cliente: datos.entrega?.cliente ?? datos.meta.nombreCliente`. **La comanda NO imprime `nota_general`, forma de pago, dirección ni teléfono** (DatosComanda, comanda-builder.ts:13+, solo folio, modo, cajero, caja, fecha, cliente, área, esAgregado, líneas con notaCocina/contexto). Existe `nota_imprime_en_comanda` (cobro.ts:146 la pone true al guardar nota_general desde el POS) pero nada del POS la lee para imprimir; `crear_ticket_desde_tienda` no la fija.
- **¿Algo imprime hoy una comanda para un pedido de app aceptado? NO.** Los únicos llamadores de `imprimirComandaCocina`/`PorAreas` son los flujos de captura del cajero (enviar a cocina l.948, 1028, 1223, 1563 canje, 2144), reimpresión (l.1255), anulación (l.931) y la comanda al cobrar de «Para llevar» (l.1644-1658). El agente de escritorio y `delivery-accion` no imprimen. Un ticket de Uber creado por la caja llega a `estado_cocina='EN_COCINA'` (KDS) pero sin papel, salvo que alguien lo reimprima.
- `ticket_impreso_at`: sella `marcar_ticket_impreso(p_ticket_id)` (0149:37-53; GRANT authenticated, service_role) llamada por `marcarTicketImpreso` (cuentas-abiertas.ts:86) desde `pantalla-cuentas-modo.tsx:241` (botón «Imprimir ticket»/«Reimprimir» de las listas Pick-up/Domicilio y Comedor). Reimprimir con ticket ya impreso pide PIN de supervisor. Desde 0114, asignar repartidor, no imprimir, es lo que «saca» un domicilio.
- Una sola impresora: `hayEstacionDeCocinaDedicada()` (config.ts:141) = CAJA≠COCINA; solo condiciona la comanda automática al cobrar de Para llevar. `imprimirComandaPorAreas` imprime igual con una impresora (todas las áreas caen en la estación COCINA, que por defecto es la misma).
- La config de impresoras es por dispositivo (localStorage): una comanda automática solo puede salir desde el navegador/ventana cuyo POS tenga las impresoras; el POS web de un celular y el de la caja instalada serían dos impresores distintos para el mismo ticket → hace falta decidir quién (la spec §8: «ticket es de esta caja», es decir `tickets.caja_id` == `caja.numero`/id de la caja del turno; hay que verificar qué campo del POS identifica la caja: `turno.caja_id`).

## 7. Dónde aparece el ticket de tienda en el POS
- `lib/cuentas-abiertas.ts:44-80` `listarCuentasAbiertas(token, sucursalId, modo)`: `from("tickets").select("id, folio_completo, total_mxn, monto_pendiente_mxn, fecha_apertura, estado_cocina, ticket_impreso_at, nombre_cliente, cliente_id, cliente:clientes(nombre, apellido_paterno), tickets_mesas(...), ticket_items(cantidad, cancelado)")` `.eq("sucursal_id").in("modo_servicio", modos).is("deleted_at", null).eq("en_espera", false).in("estado_fiscal", ["BORRADOR","ABIERTO"]).order("fecha_apertura", asc)`. **Sin filtro de origen, de caja ni de quién lo abrió** → un ticket `API_EXTERNA` con `modo_servicio` DRIVE_THRU (Pick-up) o DELIVERY_PROPIO (Domicilio) aparece (sucursal-wide, cualquier caja). Pick-up: `onPickup` usa `modo` DRIVE_THRU (home-pos.tsx:1992). El título de la tarjeta es el cliente (nombre del cliente registrado o `nombre_cliente`). Badges del inicio `cuentasAbiertas.{pickup,domicilio}` se calculan aparte (misma idea).
- Acciones (pantalla-cuentas-modo.tsx:393-417): Agregar producto, Descuento, Canjear puntos (si hay cliente), Reabrir cuenta (con PIN, si impresa), Imprimir ticket/Reimprimir (marca `ticket_impreso_at`; reimprimir pide PIN), Borrar cuenta (solo vacía) o «Cancelar…» (por productos o toda la cuenta; `ModalCancelarTicket`), «Cobrar $total» (`onCobrar`), «Asignar cliente» (Comedor/Pick-up; domicilio ya trae el suyo), y en Domicilio asignación de repartidor (`asignacionesVivas`/`repartidorPorTicket`). Para `DELIVERY_PROPIO` el panel de detalle muestra cliente, teléfono, dirección (`leerEntregaCuenta`, l.424-440, incl. `notasRepartidor`). **Ninguna de estas pantallas muestra `nota_general`** (forma de pago, «paga con $500», nota del cliente): grep `nota_general` en apps/pos solo aparece en cobro.ts/carrito.ts/sidebar-ticket.tsx (escritura) y kds (lectura en KDS). Tampoco se imprime en comanda ni ticket.
- Un ticket con `origen_creacion='API_EXTERNA'`, `cliente_id`, `direccion_entrega_id`, `zona_envio_id` se maneja como uno normal. El envío ya es un renglón (`cargo_tipo='ENVIO'`). Cobrar un ticket de Domicilio llama `cerrarRepartoAlCobrar` (home-pos.tsx:1662) con efectivo/otros del ticket.
- Cancelar el ticket: `ModalCancelarTicket` (acción `cancelar_ticket`, autorización) → ticket `CANCELADO` (estado_fiscal); en Uber la regla de la spec lo mapea a CANCELADO del pedido.

## 8. POS web vs escritorio
- Caja/sucursal/turno: `HomePos` recibe props `caja: DatosCaja` (`tenant_id, sucursal_id, numero, nombre, sucursalNombre, negocioNombre, logoUrl, vertical`, lib/turno.ts:32), `turno` (con `turno.id`, `turno.caja_id`) y `empleado`; `token` = JWT del empleado (pin-login). El `caja_id` del dispositivo sale de su correo (`cajaIdFromEmail`, supabase.ts:92).
- Llamadas a funciones: `urlFuncion(nombre)` = `${URL}/functions/v1/${nombre}` y `encabezadosFuncion(token)` = `{apikey, Authorization: Bearer <token empleado>, Content-Type}` (supabase.ts:189-196). `URL` = `window.__VIM_SUPABASE_URL` (inyectada por el preload del escritorio = gateway local) o `NEXT_PUBLIC_SUPABASE_URL` en web (supabase.ts:8-12).
- En el escritorio el gateway intercepta: `gateway.mjs:314-333` `if (p === "/functions/v1/delivery-accion")` valida la sesión local (`getUser`), toma `backend.nube()` (= `tokenDeNubeCacheado`), 503 `FUNCION_REQUIERE_NUBE` sin nube, reenvía el cuerpo tal cual a `${nube.cloudUrl}/functions/v1/delivery-accion` con `Authorization: Bearer ${nube.deviceToken}`, timeout 15 s, `SIN_RED` 503 si falla el fetch; devuelve status y texto de la nube. `/functions/v1/pin-login`, `autorizar-pin`, `lealtad-canje` son locales; cualquier otra función → 503 `FUNCION_REQUIERE_NUBE` (l.355-358). **Una acción nueva de delivery-accion pasa sin tocar el gateway** (es una sola ruta). Desde el escritorio la identidad que ve la función es el DISPOSITIVO, no el empleado → `cajaDispositivo` definido y `aceptar` en ESCRITORIO hace `reclamarParaCaja`; el POS web llega como empleado (`cajaDispositivo=null`).
- Módulos: `lib/directivas.ts:149-165` `leerDirectivas()` → `fetch("/__directivas")` (archivo del latido, 10 min) y, si no hay escritorio, RPC `mi_acceso`; `Directivas.modulos: Record<string, boolean>` (l.24). `useAcceso()` expone `modulos` y relee cada 60 s.
- ¿Sabe el POS que corre en el escritorio? Sí: `window.__VIM_DESKTOP === true` (`esEscritorio()` en `lib/actualizacion.ts:9-12`; también usado en reportar-error.ts:65 y catalogo-eventos.ts), y `window.__VIM_SALIR` (pantalla-inicio.tsx:118-123). Existe, pero la lógica de pedidos no lo usa hoy.

## 9. Push y sonidos
- `supabase/functions/enviar-push/index.ts`: dos caminos — interno (cabecera `x-vim-interno` + `tenant_id` en cuerpo; así lo llama `delivery_avisar_expirados` vía pg_net) o JWT de un usuario del tenant; payload `{titulo, cuerpo, url?}` (título ≤120); envía a TODAS las filas de `push_suscripciones` del tenant (los dispositivos que activaron notificaciones en el admin); `url` se sanea (`rutaSegura`, SEC CN-014).
- `apps/pos/public/sonidos/`: solo `pedido-app.wav`.

## 10. Versionado y publicación
- `desktop/package.json` version = **0.7.0** (publicada 8 oct). `docs/operacion/actualizaciones.md` §1: 0.0.x corrección, **0.x.0 función** (algo nuevo para el cliente), x.0.0 hito (1.0.0 reservada al lanzamiento); manda el cambio más grande → entrega 4 (caja recibe pedidos de la tienda) = **0.8.0**, y `espejo.ts:48` ya dice «solo mandan las cajas desde la 0.8.0». §2: un instalador por semana, **martes antes de las 10:00**; viernes corte, lunes empaquetar + instalar en VIM Pruebas + lista de lo que incluye a Fermín (sin su visto bueno no se publica); jueves tarde–domingo nada salvo urgencia; etiqueta `git tag vX.Y.Z`; nota para quien cobra, sin jerga.
- `desktop/RUNBOOK.md` «Antes de empaquetar — lista obligatoria» (l.63): 1 `desktop/bin/postgrest.exe` (69,366,272 bytes), 2 `desktop/node_modules` existe, 3 construir desde `vim-pos/` (checkout completo), 4 `npm run dist` termina con `✔ extraResources completos`, 5 tres comprobaciones sobre el resultado antes de publicar (no publicar `.exe` < ~155 MB). Sección «Espejo de pedidos de apps» en RUNBOOK l.420. Migraciones a producción a mano ANTES del merge (memoria del proyecto) y viajan a la caja con el instalador.

## 11. Pruebas
- `apps/pos`: **vitest** (`"test": "vitest run"`, `"typecheck": "tsc --noEmit"`), `vitest.config.ts`: `environment: "node"`, `include: ["app/**/*.test.ts"]` → **solo `.test.ts` en node, sin jsdom/React Testing Library: los componentes `.tsx` y `home-pos.tsx` NO tienen cobertura**; se prueba lógica pura en `app/lib/__tests__/` (37 archivos: pedidos-apps, kds, cobro, zonas-envio, directivas, etc.). Para cubrir el efecto del timbre habría que sacar la lógica a una función pura en `lib/` (patrón del repo).
- CI `.github/workflows/ci.yml`: job `build-and-test`: tipografía (l.59-61), typecheck apps (l.63-66), build (l.68-74), `pnpm -r test` Vitest POS+Admin (l.76-81), `pnpm test:sitio` (l.83-87), `pnpm test:functions` (l.89-98), auditorías. Job `desktop` (l.110-177): `node --check` de `src/*.mjs` y `scripts/*.mjs` (l.160-162) y `node --test src/*.test.mjs` (l.171-177). Job `rls-tests` (l.179-257): `supabase start`, smokes `supabase/scripts/smoke_*.sql` BLOQUEANTE (l.197+), `supabase test db` (pgTAP en `supabase/tests/`, hay `0004-0008_delivery_*.test.sql`).
- Local: `pnpm test:functions`, `pnpm test:escritorio`, `pnpm --filter pos test`, `cd desktop && npm run smokes -- smoke_x.sql`.

## 12. Referencias previas a la tienda en `apps/pos` y `desktop`
**Nada** referencia el canal de la tienda en el código de esas dos carpetas (grep `TIENDA|espejo_turno|canal ===|modulo_tienda|tienda: true` sin coincidencias reales). Las coincidencias de «tienda» son de Uber (`REFRESCO_TIENDA_MS`, `tienda_*`, `TIENDA_ESTRATEGIA_UBER`, pedidos-apps.ts/ pantalla-pedidos-apps.tsx, `tienda_id_externo`/`descuento_tienda_mxn` en delivery-espejo-plan.mjs:9,17). Lo único que ya existe del lado "caja": columna `cajas.espejo_turno_abierto_at` y `sucursal_recibe_pedidos` (0161:847-859), `selloLatido`/`alcanceEspejo`/`cadenciaEspejo({tienda})` (espejo.ts), `COLS_PEDIDO_TIENDA` (delivery-espejo/index.ts:31), `tienda: true` ausente en el agente, `modulos.tienda` ya en `packages/db/src/modulos.ts:6,22`.
