# Delivery A6 — Estado de tienda y tiempo de preparación en Uber, y pedidos expirados

Fecha: 2026-09-02. Estado: aprobado por Fermín en chat. Construye sobre F1 y F1b (ADR 0011,
migraciones 0090–0092, `delivery-accion`, `delivery-uber-conexion`).

## Objetivo

Cumplir la obligación **A6** del contrato con Uber (`docs/integraciones/delivery/uber-eats/contrato/README.md`:
*Get/Set Store Status* y *Update Prep Time* son "Required" en los Quality & Performance Standards)
y proteger la **tasa de aceptación del 99.9 %**: que la caja pueda pausar la tienda cuando no da
abasto, ajustar el tiempo de preparación, y que ningún pedido se quede "RECIBIDO" para siempre sin
que nadie se entere.

## Decisiones tomadas

- La caja pausa/reanuda la tienda y ajusta el tiempo de preparación **desde la pantalla "Pedidos de
  apps" del POS**, con el JWT del empleado, a través de `delivery-accion`. Cualquier empleado con
  sesión en la caja puede hacerlo: es operación, no configuración.
- El tiempo de preparación vive en `delivery_conexiones.tiempo_prep_min` y se **sincroniza a Uber**
  cada vez que cambia, venga del POS o del admin. El admin deja de escribir la columna directo.
- Estado de tienda: se consulta a Uber y se **cachea 60 s** en `delivery_conexiones.config.tienda`
  (`{ estado, hasta, motivo, consultado_at }`) para no gastar llamadas.
- Si Uber responde 403 `resource_update_not_allowed` al pausar/reanudar (la tienda no tiene
  estrategia de estado "external"), se muestra "Esta tienda solo se pausa desde Uber Eats
  Manager" y no se registra como error de conexión.
- Expiraciones: barrido SQL cada minuto con `pg_cron` **solo donde la extensión exista** (nube). En
  el Postgres embebido de escritorio no se programa nada; la caja de escritorio no recibe pedidos
  de apps directamente (llegan por la nube), así que no pierde funcionalidad.
- Alertas de expiración **en la app** (POS y admin). Push a dispositivos del dueño: fase posterior.
- Fuera de alcance: festivos, `delay_config` (modo ocupado por delay), DiDi/Rappi.

## Contratos con Uber que se usan

- `GET /v1/delivery/store/{id}/status` → `{ status: ONLINE|OFFLINE, is_offline_until?, offline_reason?, offline_reason_metadata? }`.
- `POST /v1/delivery/store/{id}/update-store-status` `{ status, is_offline_until?, reason? }` → `{ status, is_offline_until?, previous_status }`. Scope `eats.store.status.write` (ya incluido en el token de aplicación).
- `POST /v1/delivery/store/{id}/update-store-prep-time` `{ default_prep_time: <segundos, ≤ 10 800> }` → `{ prep_times }`.

## Módulo puro `_shared/delivery/tienda-uber.ts`

Sin I/O, probado con `node --test`:

- `type EstadoTienda = { estado: "EN_LINEA" | "PAUSADA" | "DESCONOCIDO"; hasta: string | null; motivo: string | null; consultado_at: string }`
- `normalizarEstadoTienda(respuesta: unknown, ahora: Date): EstadoTienda` — `ONLINE` → EN_LINEA; `OFFLINE` → PAUSADA con `hasta = is_offline_until` y `motivo = offline_reason`; otro → DESCONOCIDO.
- `estadoCacheVigente(config: unknown, ahora: Date, maxSeg = 60): EstadoTienda | null` — lee `config.tienda`; null si falta o es viejo.
- `cuerpoPausarTienda(ahora: Date, duracion: "30m" | "1h" | "dia", motivo?: string)` → `{ status: "OFFLINE", is_offline_until, reason }`. `dia` = hasta las 23:59:59 hora local de la sucursal (se recibe `zonaHoraria` como parámetro; por defecto `America/Mexico_City`).
- `cuerpoReanudarTienda()` → `{ status: "ONLINE" }`.
- `cuerpoPrepTime(minutos: number)` → `{ default_prep_time: minutos * 60 }`; lanza `PREP_FUERA_DE_RANGO` si no está en 1..180.
- `esErrorEstrategiaExterna(mensaje: string): boolean` — detecta `UBER_HTTP_403` + `resource_update_not_allowed`.

## Cliente Uber (`_shared/delivery/uber.ts`)

Se añaden a `ClienteUber`:
- `actualizarEstadoTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>` → `POST …/update-store-status`.
- `actualizarPrepTienda(tiendaId: string, cuerpo: unknown): Promise<unknown>` → `POST …/update-store-prep-time`.
(`estadoTienda(tiendaId)` ya existe.)

## Orquestación compartida `_shared/delivery/tienda-uber-acciones.ts`

Funciones con I/O que usan las dos Edge Functions, para no duplicar:

```ts
type Deps = { db: DbMinima; uber: ClienteUber; ahora: () => Date };
consultarEstadoTienda(deps, conexion, { forzar?: boolean }) → EstadoTienda  // cache 60 s en config.tienda
pausarTienda(deps, conexion, duracion, motivo?) → EstadoTienda              // 403 estrategia → Error("TIENDA_ESTRATEGIA_UBER")
reanudarTienda(deps, conexion) → EstadoTienda
cambiarPrepTienda(deps, conexion, minutos) → { tiempo_prep_min }            // Uber primero; si OK, UPDATE tiempo_prep_min
```
Cada llamada a Uber deja fila en `delivery_eventos` (`SALIDA`, tipo `tienda_estado` / `tienda_pausar` / `tienda_reanudar` / `tienda_prep`).

## `delivery-accion` (POS, JWT de empleado)

Acciones nuevas, con `sucursal_id` en vez de `pedido_id` (se valida que la sucursal sea del tenant
y que tenga conexión Uber en ACTIVA/PAUSADA/ERROR):

| Acción | Campos | Respuesta |
|---|---|---|
| `tienda_estado` | `sucursal_id`, `forzar?` | `{ tienda: EstadoTienda, tiempo_prep_min }` |
| `tienda_pausar` | `sucursal_id`, `duracion: "30m"\|"1h"\|"dia"` | `{ tienda }` |
| `tienda_reanudar` | `sucursal_id` | `{ tienda }` |
| `tienda_prep` | `sucursal_id`, `minutos` | `{ tiempo_prep_min }` |

Errores nuevos: `SIN_CONEXION_UBER` 404, `TIENDA_ESTRATEGIA_UBER` 409, `PREP_FUERA_DE_RANGO` 400,
`UBER_ERROR` 502.

## `delivery-uber-conexion` (admin)

- `prep` (`conexion_id`, `minutos`) → `cambiarPrepTienda`. El admin usa esta acción en vez de
  `actualizarConexion` para los minutos. `auto_aceptar` sigue directo bajo RLS (no toca a Uber).
- `verificar` devuelve además `tienda: EstadoTienda` (ya consulta el estado; se normaliza y cachea).

## Migración `0093_delivery_expirados.sql`

```sql
CREATE OR REPLACE FUNCTION delivery_marcar_expirados() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  WITH exp AS (
    UPDATE delivery_pedidos
    SET estado = 'EXPIRADO', cancelado_at = now(), motivo_cancelacion = 'Venció la ventana de aceptación'
    WHERE estado = 'RECIBIDO' AND vence_aceptacion IS NOT NULL AND vence_aceptacion < now()
    RETURNING id, tenant_id, conexion_id, app, id_externo
  )
  INSERT INTO delivery_eventos (tenant_id, conexion_id, app, direccion, tipo, id_externo, procesado, error)
  SELECT tenant_id, conexion_id, app, 'SALIDA', 'expirado', id_externo, true, 'Pedido expirado sin aceptar' FROM exp;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    UPDATE delivery_conexiones c SET ultimo_error = 'Pedidos expirados sin aceptar: revisar la caja', ultimo_evento_at = now()
    WHERE c.id IN (SELECT conexion_id FROM delivery_eventos WHERE tipo = 'expirado' AND created_at > now() - interval '1 minute');
  END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION delivery_marcar_expirados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_marcar_expirados() TO service_role;

-- Solo donde exista pg_cron (nube). En el Postgres embebido de escritorio no hay cron ni pedidos.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('delivery-expirados') FROM cron.job WHERE jobname = 'delivery-expirados';
    PERFORM cron.schedule('delivery-expirados', '* * * * *', $j$ SELECT delivery_marcar_expirados() $j$);
  END IF;
END $$;
```

Vista para las alertas (RLS por herencia, `security_invoker`):
`vw_delivery_expirados_hoy(tenant_id, sucursal_id, n_expirados, ultimo_expirado_at)` sobre
`delivery_pedidos` con `estado = 'EXPIRADO'` y `cancelado_at::date = CURRENT_DATE` (día natural de
la sucursal; suficiente para una alerta).

## POS

### `lib/pedidos-apps.ts`
- `leerTiendaUber(token, sucursalId, forzar?)`, `pausarTiendaUber(token, sucursalId, duracion)`,
  `reanudarTiendaUber(token, sucursalId)`, `cambiarPrepUber(token, sucursalId, minutos)` → todas
  llaman a `delivery-accion`.
- `leerExpiradosHoy(token, sucursalId)` → `{ n, ultimo }` desde la vista.
- `mensajeError` cubre `SIN_CONEXION_UBER`, `TIENDA_ESTRATEGIA_UBER`, `PREP_FUERA_DE_RANGO`.
- Helpers puros probados con vitest: `etiquetaTienda(estado)` ("Uber: en línea" / "Uber: pausada hasta 18:40" / "Uber: sin datos"), `opcionesPausa` (30 min / 1 h / resto del día).

### Pantalla "Pedidos de apps" (`pantalla-pedidos-apps.tsx`)
Debajo del encabezado, una barra de tienda (solo si la sucursal tiene conexión Uber):

```
● Uber: en línea      Prep: [−5] 15 min [+5]      [Pausar ▾]
● Uber: pausada hasta 18:40                        [Reanudar]
```
- Pausar abre un menú con "30 minutos", "1 hora", "Resto del día" y pide confirmación en una
  línea ("Uber dejará de mandar pedidos hasta las 18:40").
- El estado se refresca cada 60 s junto con el polling de pedidos (`tienda_estado` sin forzar; el
  servidor decide si va a Uber). Botones de 44 px como el resto del POS.
- Si la caja no tiene conexión Uber, la barra no aparece.

### Pantalla de inicio (`pantalla-inicio.tsx` / `home-pos.tsx`)
- Nuevo aviso rojo bajo el encabezado cuando `leerExpiradosHoy` devuelve `n > 0` y el último
  expirado es posterior a la última vez que alguien entró a "Pedidos de apps" en este dispositivo
  (`localStorage["vimpos.apps.vistoExpirados"]`): "Se venció 1 pedido de Uber sin aceptar. Revisa
  Pedidos de apps." Entrar a la pantalla lo marca como visto. Se consulta en el mismo polling de
  10 s que ya existe.

## Admin

- Fila de Apps de delivery: chip de tienda ("En línea" / "Pausada hasta …") que sale de
  `config.tienda` cacheado, y columna **Expirados hoy** desde la vista.
- Prep (min): al cambiar llama `accionConexion("prep", { conexion_id, minutos })`; si Uber falla,
  el valor vuelve al anterior y se muestra el error.
- "Comprobar" muestra también el estado de tienda normalizado.

## Seguridad

- Ninguna ruta nueva expone service_role; el POS y el admin siguen pasando por las Edge Functions
  con su JWT.
- `delivery_marcar_expirados` es SECURITY DEFINER pero no recibe parámetros y solo la ejecuta
  cron (superusuario) o service_role.
- La vista de expirados lleva `security_invoker = on` y hereda el RLS de `delivery_pedidos`.

## Pruebas

- `tienda-uber.test.ts` (node --test): normalización de estado, cache vigente/vencido, cuerpos de
  pausa (30m/1h/día con zona horaria), prep en segundos y rango, detección del 403 de estrategia.
- `tienda-uber-acciones.test.ts` con `DbMinima` y `ClienteUber` falsos: cache evita la llamada,
  `forzar` la hace, pausa registra evento, 403 → `TIENDA_ESTRATEGIA_UBER`, prep escribe en BD
  solo si Uber respondió OK.
- pgTAP `0006_delivery_expirados.test.sql`: la función marca solo los vencidos, deja evento,
  no toca ACEPTADOS; la vista respeta RLS; `authenticated` no ejecuta la función.
- vitest POS: `etiquetaTienda`, `opcionesPausa`, `mensajeError` nuevos.
- Typecheck POS y admin; `pnpm test` completo.
- Navegador (Supabase local + `delivery-accion` servida con credenciales falsas): barra de tienda con
  "sin datos" y errores amables; banner de expirados tras forzar `delivery_marcar_expirados()` en
  SQL con un pedido vencido.

## Documentación que cambia

- Contrato README: A6 → ✅; sección "Estándares de calidad" enlaza a esta spec.
- Runbook `delivery-uber-sandbox.md`: cómo probar pausa/prep y expirados.
- `supabase/functions/README.md`: acciones nuevas.
