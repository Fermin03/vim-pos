# Sincronización de inventario con la caja instalada — diseño

**Fecha:** 2026-09-04 · **Decisión:** `docs/decisiones/0013-el-inventario-viaja-por-movimientos.md` ·
**Antecedente:** `docs/superpowers/specs/2026-09-03-recetas-y-compras-design.md` (recetas y compras,
en producción desde el 4 sep 2026).

## 1. Problema

La caja instalada (Electron + Postgres embebido) paga los tickets en su base local, donde el
trigger `trg_tickets_descontar_inventario` (0008) llama `descontar_inventario_por_venta` (0007).
Esa función no descuenta nada porque:

1. El pull (`sync_pull_snapshot`, versión vigente en 0079) no baja insumos, existencias, recetas
   ni componentes: las tablas locales están vacías.
2. Los movimientos que generara no subirían: el push (`sync_push_snapshot`, versión vigente en
   0089) solo acepta las once tablas de venta y cortes.
3. `configuracion_tenant.modulo_inventario_activo` nace en falso y ninguna pantalla lo enciende,
   así que tampoco descuenta el POS web.

Además, 0089 reescribió el push y perdió el aislamiento de filas conflictivas de 0074: hoy una
fila mala rechaza el snapshot entero, `_errores` ya no vuelve, y ya no se registra en
`sync_eventos` ni se sella `cajas.ultima_conexion`.

## 2. Alcance

**Entra:**

1. Pull con seis tablas más (§4).
2. Push con `movimientos_inventario`, recálculo de existencias y alertas en la nube, y
   aislamiento de filas restaurado (§5).
3. Escritorio: aplicar el pull nuevo con corrección por pendientes, subir movimientos, marcar
   con `_vim_mov_ok`, push antes que pull en el ciclo (§6).
4. Interruptor "Descontar inventario al vender" en el panel (§7).
5. Pruebas (§9) y publicación del instalador 0.4.57 (§10).

**No entra:** segunda instalación del mismo negocio (ADR 0004 sigue: escritorio único);
capturar compras, mermas o ajustes desde la caja; reporte de costo de ventas; subir alertas
locales; gating del interruptor por plan.

## 3. Invariantes

- **La verdad del saldo es la nube.** La caja solo sube movimientos; nunca `insumo_stock_sucursal`.
- **Movimiento = fila inmutable, idempotente por `id`.** Reenviar un snapshot no descuenta dos veces.
- **Existencia local = existencia de la nube − pendientes locales.** Un pull nunca devuelve lo
  ya vendido.
- **La venta nunca se bloquea por inventario** (D32): si falla el descuento, la venta se cobra y
  el error se registra.
- **Lista explícita de tablas** en ambos sentidos (ADR 0004): agregar una es una migración.

## 4. Pull (nube → caja) — migración `0101_sync_inventario.sql`, parte 1

`sync_pull_snapshot(p_tenant uuid)` se redefine (`CREATE OR REPLACE`, mismo cuerpo que 0079 más
seis claves):

| Clave del snapshot | Filtro | Nota |
|---|---|---|
| `unidades_medida` | `tenant_id = p_tenant OR tenant_id IS NULL` | las del sistema se siembran por negocio (0035), pero se admite `NULL` por si algún día hay globales |
| `insumos` | `tenant_id = p_tenant` | incluye `deleted_at` y `estado`; la caja no filtra, la función de descuento tampoco |
| `insumo_stock_sucursal` | `tenant_id = p_tenant` | todas las sucursales del negocio, como el resto del pull |
| `recetas` | `tenant_id = p_tenant` | |
| `receta_componentes` | `tenant_id = p_tenant` | |
| `modificador_componentes` | `tenant_id = p_tenant` | |

Cada tabla con `to_jsonb(x)` como las demás. No bajan `conversiones_unidades` (la caja no
convierte: `receta_componentes.cantidad` ya viene en la unidad del insumo), ni `proveedores`,
`compras`, `compra_lineas`, `proveedor_insumo_alias`, `alertas_inventario`, `movimientos_inventario`.

## 5. Push (caja → nube) — migración `0101_sync_inventario.sql`, parte 2

`sync_push_snapshot(p_tenant uuid, p_snapshot jsonb) RETURNS jsonb` se redefine completa,
tomando 0089 como base y restaurando lo de 0070/0073/0074:

1. Tablas en orden, todas con `_vim_apply_rows_detalle` (0074): `turnos, tickets, ticket_items,
   ticket_item_modificadores, pagos, movimientos_caja, delivery_asignaciones, cortes_parciales,
   cortes_caja, cortes_caja_detalle, reportes_z_historico`. Se acumulan `aplicadas` por tabla y
   `_errores` (lista de `{tabla, id, error}`), en `session_replication_role = replica` como hoy.
2. **`movimientos_inventario`**, con una función nueva `_vim_aplicar_movimientos(p_rows jsonb,
   p_tenant uuid) RETURNS jsonb`:
   - Inserta con columnas del `information_schema` del destino (excluye generadas e identidad,
     como el helper de 0074), `WHERE tenant_id = p_tenant`, **`ON CONFLICT (id) DO NOTHING
     RETURNING id`**. Solo las filas devueltas son nuevas.
   - Validación por fila antes de insertar, fuera del camino rápido cuando choca (mismo patrón de
     0074): el insumo existe y es del negocio; la sucursal es del negocio; `cantidad > 0`;
     `tipo` es uno del enum. Una fila que falla va a `_errores` con `tabla = 'movimientos_inventario'`
     y no detiene las demás.
   - **Fuera del modo réplica.** La RPC aplica primero las once tablas en `replica`, después
     ejecuta `SET LOCAL session_replication_role = origin` y solo entonces llama a
     `_vim_aplicar_movimientos`, que corre con triggers y claves foráneas normales (por eso un
     movimiento con insumo inexistente cae solo, fila por fila, a `_errores`). No hace falta
     volver a `replica`: es el último paso. Por cada id nuevo, en orden de `fecha`,
     `INSERT INTO insumo_stock_sucursal (tenant_id, sucursal_id, insumo_id, stock_actual,
     fecha_ultimo_movimiento) VALUES (…, signo × cantidad, fecha) ON CONFLICT (insumo_id,
     sucursal_id) DO UPDATE SET stock_actual = insumo_stock_sucursal.stock_actual + EXCLUDED.stock_actual,
     stock_negativo_flag = (… < 0), fecha_ultimo_movimiento = GREATEST(...)`, y después
     `PERFORM evaluar_alertas_stock(insumo_id, sucursal_id)` una vez por pareja (insumo, sucursal)
     tocada. El signo sale de la misma tabla de `aplicar_movimiento_inventario` (0007 §9.3):
     +1 `ENTRADA_COMPRA, REVERSA_CANCELACION, AJUSTE_POSITIVO, TRANSFERENCIA_ENTRADA`; −1
     `SALIDA_VENTA, SALIDA_MODIFICADOR_EXTRA, MERMA, AJUSTE_NEGATIVO, TRANSFERENCIA_SALIDA,
     DEVOLUCION_PROVEEDOR`.
   - No se llama `aplicar_movimiento_inventario` porque esa función crea el movimiento; aquí el
     movimiento ya existe y solo falta su efecto. No se recalcula el costo promedio del insumo
     (solo lo mueven las compras, que se registran en la nube).
   - Devuelve `{aplicadas, errores, insumos_tocados}`.
3. Registro en `sync_eventos` y sello de `cajas.ultima_conexion` + `dispositivo_descripcion`,
   con el mismo bloque de 0073 (best effort, `RAISE WARNING` si falla).
4. `_ignoradas` como en 0089.
5. Respuesta: `{ <tabla>: n, movimientos_inventario: n, _errores: [...], _ignoradas: [...] }`.

Grants como hoy: `REVOKE … FROM public, anon, authenticated; GRANT … TO service_role` para la RPC
y para la función nueva.

## 6. Escritorio (`desktop/src`)

### 6.1 Pull (`sync-pull.mjs`)

- `PULL_ORDER` agrega, después de `configuracion_tenant`: `unidades_medida, insumos,
  insumo_stock_sucursal, recetas, receta_componentes, modificador_componentes`.
- `CLAVES_NATURALES` agrega `insumo_stock_sucursal: { claves: ["insumo_id", "sucursal_id"],
  dependientes: [] }`. Los movimientos no referencian la fila de existencias, así que borrar la
  local que colisiona es seguro.
- **Corrección por pendientes**: después de aplicar `insumo_stock_sucursal`, dentro de la misma
  transacción y con los triggers deshabilitados como hoy:

  ```sql
  UPDATE insumo_stock_sucursal s
     SET stock_actual = s.stock_actual - p.delta,
         stock_negativo_flag = (s.stock_actual - p.delta) < 0
    FROM (
      SELECT m.insumo_id, m.sucursal_id,
             SUM(CASE WHEN m.tipo IN ('ENTRADA_COMPRA','REVERSA_CANCELACION','AJUSTE_POSITIVO','TRANSFERENCIA_ENTRADA')
                      THEN -m.cantidad ELSE m.cantidad END) AS delta
        FROM movimientos_inventario m
        LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id
       WHERE ok.movimiento_id IS NULL
       GROUP BY m.insumo_id, m.sucursal_id
    ) p
   WHERE s.insumo_id = p.insumo_id AND s.sucursal_id = p.sucursal_id;
  ```

  (`delta` es lo que la nube todavía no restó: para una salida pendiente de 3, la existencia
  local queda en nube − 3.) La función pura `deltaPendiente(movimientos)` que calcula el mismo
  número en JS se prueba con `node:test`; el SQL se prueba en `verify-sync.mjs`.

### 6.2 Push (`sync-push.mjs`)

- Tabla local nueva `_vim_mov_ok (movimiento_id uuid PRIMARY KEY, subido_at timestamptz DEFAULT now())`,
  creada junto a `_vim_push_ok` en el arranque.
- `listarPendientes` devuelve además `movimientoIds`: `SELECT id FROM movimientos_inventario m
  LEFT JOIN _vim_mov_ok ok ON ok.movimiento_id = m.id WHERE ok.movimiento_id IS NULL ORDER BY fecha`.
- `construirSnapshotPush` agrega la clave `movimientos_inventario` con esas filas completas
  (`to_jsonb`, excluyendo `costo_total_mxn` que es generada; el helper de la nube la ignora
  también).
- Los movimientos entran en los mismos lotes que las ventas (`MAX_VENTAS_POR_LOTE`,
  `MAX_BYTES_POR_LOTE`); cuando un lote se parte a la mitad, los movimientos se reparten con él.
  Un lote puede contener solo movimientos si no hay ventas pendientes.
- Tras la respuesta: `marcarMovimientosPushed(ids − rechazados)` con
  `INSERT INTO _vim_mov_ok … ON CONFLICT DO NOTHING`. Los rechazados son los ids que vengan en
  `_errores` con `tabla = 'movimientos_inventario'`; se reintentan en el siguiente ciclo y, si
  vuelven a fallar, quedan reportados por `sync-errores.mjs` como hoy (una vez por id, no en cada
  ciclo: se guarda el id en memoria del proceso para no repetir el reporte).
- `_vim_push_ok` no cambia: un ticket se marca subido con la lógica actual, independientemente
  de sus movimientos.

### 6.3 Ciclo (`main.mjs` `syncBestEffort`)

Cuando `tocaPull(nCiclo)`: se ejecuta **push y luego pull** (hoy es pull y luego push). Si el
push falla, el pull se hace igual (la corrección por pendientes protege las existencias) y el
ciclo cuenta el fallo como hoy. `verify-sync-ciclo.mjs` se ajusta al orden nuevo.

### 6.4 Arranque (`runtime.mjs`)

Sin cambios de lógica: las migraciones 0097–0101 se aplican solas al arrancar la versión nueva.
El plan incluye una tarea que arranca un Postgres embebido limpio con las migraciones actuales y
verifica que 0098 (bucket de Storage) se aplica con el shim `desktop/sql/00-compat-shim.sql`;
si no, el shim se amplía con lo mínimo que 0098 necesite (`storage.buckets`).

### 6.5 Descuento local

No cambia: el trigger de 0008 y `descontar_inventario_por_venta` corren en la caja con las
tablas ya pobladas. `evaluar_alertas_stock` corre localmente y puede marcar `productos.estado =
'AGOTADO'`; el siguiente pull trae el estado que decidió la nube. `alertas_inventario` locales
se ignoran.

## 7. Panel — interruptor de activación

En `apps/admin/app/(panel)/inventario/page.tsx`, en la cabecera junto a los enlaces de Compras y
Proveedores: un interruptor "Descontar inventario al vender" (encendido/apagado) con el texto de
ayuda "Cuando está encendido, cada venta descuenta los insumos de la receta del producto. Los
productos sin receta se venden sin descontar." y, si hay productos activos sin receta, "N
productos sin receta" enlazado a `/catalogo/recetas?sin=1`.

Lib `apps/admin/app/lib/inventario.ts`: `leerModuloInventario(): Promise<boolean>` y
`activarModuloInventario(activo: boolean): Promise<void>` sobre `configuracion_tenant`
(`select modulo_inventario_activo` / `update … where tenant_id = …`; la política
`config_tenant` de 0003 lo permite). `listarRecetasResumen` ya da el conteo de sin receta.

Apagarlo no revierte nada; solo deja de descontar de ahí en adelante. Confirmación al apagar:
"Las ventas dejarán de descontar inventario. Las existencias no cambian."

## 8. Errores

- Movimiento rechazado por la nube: queda en `_errores`, no se marca, se reintenta; el ticket sí
  se marca subido. Reporte por `sync-errores.mjs` una vez por id.
- Insumo borrado en la nube después de que la caja lo descontó: el movimiento entra (la FK a
  `insumos` sigue existiendo; `deleted_at` es lógico). Si el insumo no existe físicamente, la
  fila va a `_errores` y se reporta.
- Push que falla completo: comportamiento actual (backoff), más la corrección por pendientes en
  el pull.
- Desfase de esquema (caja vieja, nube nueva): las columnas se resuelven por `information_schema`
  del destino, como hoy.

## 9. Pruebas

- **SQL:** `supabase/scripts/smoke_sync_inventario.sql`: crea insumo con existencia 10 en la
  nube; aplica `sync_push_snapshot` con dos `SALIDA_VENTA` (3 y 2) y una `REVERSA_CANCELACION`
  (1) → existencia 6, `alerta_actual` según umbrales, movimiento con `stock_antes` intacto;
  re-aplica el mismo snapshot → sigue 6 (idempotencia); un movimiento con insumo de otro tenant
  → `_errores` con ese id y los demás aplicados; una fila de `pagos` mal formada → `_errores`
  y el resto aplicado (aislamiento restaurado); `sync_eventos` tiene una fila nueva y
  `cajas.ultima_conexion` quedó sellada. `smoke_sync_push.sql` sigue en verde.
- **pgTAP:** `0003_grants_secdef.test.sql` cubre la RPC; se agrega la función nueva a la lista.
- **Escritorio:** `sync-pull.test.mjs` (nuevo, `node:test`) para `deltaPendiente`;
  `verify-sync.mjs` extiende el snapshot simulado con insumos/existencias/recetas y verifica
  que una existencia bajada de 10 con una salida pendiente de 3 queda en 7 y que
  `descontar_inventario_por_venta` local descuenta al pagar; `verify-push.mjs` verifica que el
  snapshot incluye movimientos y que `_vim_mov_ok` evita re-subirlos; `verify-push-aislado.mjs`
  vuelve a verde; `verify-sync-ciclo.mjs` con el orden push→pull.
- **Punta a punta local:** caja de desarrollo contra Supabase local: encender el interruptor,
  receta de 150 g de carne, vender en la caja, correr un ciclo, ver en el panel la existencia
  descontada y el movimiento ligado al ticket.

## 10. Publicación

1. Migración 0101 a producción (`supabase db push`), admin por push a `main`.
2. `desktop/package.json` → 0.4.57; `npm run dist` (más de diez minutos; comprobar la fecha del
   `.exe`); `gh release create`; `npm run release-manifest`; `PUT` de `latest.json` al bucket
   `actualizaciones` (RUNBOOK del escritorio §105-152 y memoria "Publicar latest.json").
3. La caja de Knock-Out se actualiza sola; el descuento empieza cuando Fermín enciende el
   interruptor y hay recetas.

## 11. Orden de construcción sugerido

1. Migración 0101 (pull + push + función nueva) con `smoke_sync_inventario.sql`.
2. Escritorio: pull (orden, clave natural, corrección) + prueba de nodo + `verify-sync`.
3. Escritorio: push (pendientes, snapshot, `_vim_mov_ok`, `_errores`) + `verify-push` y
   `verify-push-aislado`.
4. Ciclo push→pull + `verify-sync-ciclo`.
5. Arranque limpio con migraciones hasta 0101 (0098 y el shim).
6. Interruptor en el panel.
7. Punta a punta local; despliegue de migración y admin; versión, dist, release, manifiesto.
