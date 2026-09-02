# Delivery F1 — Núcleo de pedidos de apps contra Uber Eats (sandbox) · Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un pedido hecho en Uber Eats (sandbox) llegue solo a VIM POS, se acepte dentro de la ventana, cree un ticket pagado en la caja con turno abierto, se vea en el panel "Pedidos de apps" del POS y el cajero pueda marcarlo listo o rechazarlo.

**Architecture:** VIM es el integrador: las credenciales de la app son de VIM (secrets de Supabase) y cada sucursal tiene una `delivery_conexion` con su `store_id` de Uber. Un webhook público (`delivery-webhook-uber`) valida la firma HMAC, guarda el evento y el pedido crudo, responde 200 y después normaliza, decide auto-aceptar, crea el ticket vía un RPC `SECURITY DEFINER` solo para `service_role` y acepta en Uber. El POS lee `delivery_pedidos` bajo RLS con polling de 10 s (como el resto del POS) y las acciones del cajero pasan por `delivery-accion`. Un adaptador puro (`_shared/delivery/uber.ts`) concentra firma, dinero (`amount_e5`), normalización y llamadas HTTP con `fetch` inyectable para poder probarlo con `node --test`.

**Tech Stack:** Postgres/Supabase (migraciones SQL, RLS, pgTAP), Edge Functions Deno (`jsr:@supabase/supabase-js@2`, Web Crypto), Next 15 + React 19 en `apps/pos`, `vitest`, `node --test --experimental-strip-types` para los módulos puros de funciones.

**Spec:** `docs/integraciones/delivery/05-diseno-integracion-vimpos.md` (secciones 1–5, 7, 10) y `03-uber-eats-resumen.md`. OpenAPI de referencia: `docs/integraciones/delivery/uber-eats/openapi/order-fulfillment-api.openapi.json`, `store-api.openapi.json`, `integration-activation-api.openapi.json`.

## Global Constraints

- RLS sagrado: toda tabla con `tenant_id` lleva RLS + política por `current_tenant_id()` y `GRANT` explícito a `authenticated, service_role` (patrón de `0078_catalogo_repartidores.sql`). Ninguna ruta de `apps/pos` ni `apps/admin` usa `service_role`.
- Dinero nunca en float: `numeric(12,2)` en BD; en TS enteros (centavos / e5) hasta el último paso y `toFixed(2)` solo para serializar.
- Español en el dominio (`snake_case` en SQL, `kebab-case` en archivos, `PascalCase` en componentes). Sin `any`: `unknown` + validación.
- Migraciones aditivas, numeradas después de la última (`0089`): esta fase usa **`0090`** y **`0091`**. Tras aplicar: `pnpm db:types` (requiere stack local con Docker).
- Rama: `delivery-f1-uber`. Commits pequeños, mensajes en español, con el trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Ventana de aceptación de Uber: 11.5 min → `vence_aceptacion = recibido_at + interval '11 minutes'` (margen de 30 s).
- Dominios Uber: sandbox `https://sandbox-login.uber.com` + `https://test-api.uber.com`; producción `https://auth.uber.com` + `https://api.uber.com`. Nunca mezclar.
- Fuera de alcance de F1 (van en planes posteriores): admin "Conectar Uber Eats" con OAuth (F1b), espejo de pedidos en la caja de escritorio (F1b), job de salud/abrir-cerrar tienda (F1b), menú y disponibilidad (F4), conciliación (F5), DiDi (F2), Rappi (F3), efectivo en apps (F2).

**Cómo se prueba la BD en esta máquina:** `supabase test db` y los smokes SQL necesitan Docker Desktop corriendo (`supabase start`). Si Docker no está, el paso queda marcado "pendiente de correr" y no se avanza a la siguiente tarea que dependa del RPC sin haberlo corrido al menos una vez.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `docs/decisiones/0011-integracion-apps-de-delivery.md` | ADR: VIM integrador, tablas nuevas, auto-aceptar por defecto, uuid como SKU |
| `supabase/migrations/0090_delivery_conexiones_pedidos.sql` | Tablas `delivery_conexiones`, `delivery_pedidos`, `delivery_eventos`, `delivery_credenciales_app`; RLS; índices; grants |
| `supabase/migrations/0091_delivery_rpc_ticket_desde_app.sql` | RPC `crear_ticket_desde_app`, `delivery_pedido_transicion`; solo `service_role` |
| `supabase/tests/0004_delivery_rls.test.sql` | pgTAP: aislamiento cross-tenant de las 3 tablas con tenant y deny-all de credenciales |
| `supabase/scripts/smoke_delivery_app.sql` | Smoke del RPC: pedido → ticket PAGADO en cocina, idempotencia, sin turno |
| `supabase/functions/_shared/delivery/tipos.ts` | Tipos comunes: `PedidoNormalizado`, `ItemNormalizado`, `AppDelivery` |
| `supabase/functions/_shared/delivery/firma.ts` | `hmacSha256Hex`, `igualesEnTiempoConstante` |
| `supabase/functions/_shared/delivery/uber.ts` | Adaptador Uber puro: dinero e5, normalización, motivos, cliente HTTP con `fetch` inyectable |
| `supabase/functions/_shared/delivery/*.test.ts` | Tests `node --test` de los módulos puros |
| `supabase/functions/delivery-webhook-uber/index.ts` | Receptor público: firma → evento → pedido → procesamiento diferido |
| `supabase/functions/delivery-accion/index.ts` | Acciones del cajero (aceptar / rechazar / listo) con JWT del tenant |
| `supabase/config.toml` | `verify_jwt = false` para el webhook |
| `package.json` | `test:functions` incluye `_shared/delivery/*.test.ts` |
| `apps/pos/app/lib/pedidos-apps.ts` | Lectura de `delivery_pedidos` bajo RLS, helpers puros de tiempo/etiquetas, llamadas a `delivery-accion` |
| `apps/pos/app/lib/__tests__/pedidos-apps.test.ts` | vitest de los helpers puros |
| `apps/pos/app/components/pantalla-pedidos-apps.tsx` | Panel con tarjetas, contador y acciones |
| `apps/pos/app/components/pantalla-inicio.tsx` | Acceso "Pedidos de apps" con badge |
| `apps/pos/app/components/home-pos.tsx` | Ruteo a la pantalla, badge cada 10 s, sonido al llegar |
| `supabase/functions/README.md` | Cómo probar el webhook localmente |

---

## Task 1: Rama y ADR 0011

**Files:**
- Create: `docs/decisiones/0011-integracion-apps-de-delivery.md`
- Modify: `docs/decisiones/README.md` (si lista los ADR; añadir la línea)

- [ ] **Step 1: Crear la rama**

```bash
cd "D:/Users/Fermi/Documents/VIM MARKETING/Vim-marketing managment/PROYECTOS/VIM POS/vim-pos"
git checkout -b delivery-f1-uber
```

- [ ] **Step 2: Escribir el ADR**

```markdown
# 0011 — Integración con apps de delivery: VIM es el integrador

**Fecha:** 2026-09-02 · **Estado:** vigente

## Qué decía el plan
Dark Kitchen §5 y §17: captura manual del pedido en MVP; "arquitectura preparada" para una
integración API futura sin decir cómo se conectaría el comercio ni dónde vivirían las credenciales.
1C.2 §8: conciliación por CSV con `ingesta_metodo 'API'` reservado para Fase 5.

## Qué hacemos ahora
1. **VIM registra una sola aplicación por plataforma** (Uber Eats, DiDi Food, Rappi). Sus
   credenciales son de VIM y viven en secrets de Supabase; el comercio nunca captura credenciales:
   **autoriza su tienda** (OAuth en Uber/Rappi, URL de autorización en DiDi).
2. Tablas nuevas con RLS: `delivery_conexiones` (sucursal × app), `delivery_pedidos` (pedido crudo
   y normalizado, independiente del ticket), `delivery_eventos` (bitácora de webhooks y llamadas),
   `delivery_credenciales_app` (token de aplicación cacheado, solo service_role).
3. Los pedidos entran por Edge Functions públicas que validan la firma de cada app; el ticket lo crea
   `crear_ticket_desde_app` (SECURITY DEFINER, solo service_role) en la caja con turno abierto, con
   `origen_creacion = 'API_EXTERNA'`, `modo_servicio = APP_*`, `folio_externo_app` y pago
   `metodo_pago = APP_*` por el total del ticket.
4. **Auto-aceptar es el modo por defecto** (Rappi da 4 min); el cajero puede rechazar dentro de la
   ventana y marcar listo. El precio del ítem en el ticket es el que pagó el cliente en la app.
5. El identificador que se manda a las apps es el `uuid` de VIM (`productos.id`,
   `opciones_modificador.id`): no hay tabla de mapeo.
6. Orden: Uber (sandbox autoservicio) → DiDi → Rappi. Esta fase solo Uber.

## Por qué
Es el modelo que exigen las tres plataformas (una app del POS, N tiendas). Guardar credenciales
por tenant sería inseguro e innecesario. Separar `delivery_pedidos` del ticket permite recibir
aunque no haya turno y auditar contra la app.

## Consecuencias
- El POS de escritorio no recibe webhooks: en F1 el flujo es nube; el espejo a la caja local es F1b.
- Comisiones y ajustes no están en el ticket; se conocen en la conciliación (F5).
- Un pedido con un producto que no existe en VIM se acepta con el "producto genérico de apps"
  configurado en la conexión; si no hay genérico, queda RECIBIDO y el cajero decide.
- Documentación completa de las tres APIs en `docs/integraciones/delivery/`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/decisiones/0011-integracion-apps-de-delivery.md docs/decisiones/README.md docs/integraciones
git commit -m "docs: ADR 0011 integracion apps de delivery + documentacion capturada de Rappi/DiDi/Uber"
```

---

## Task 2: Migración 0090 — tablas, RLS, grants + test pgTAP

**Files:**
- Create: `supabase/migrations/0090_delivery_conexiones_pedidos.sql`
- Create: `supabase/tests/0004_delivery_rls.test.sql`
- Modify: `supabase/tests/0002_rls_cobertura.test.sql` (no hace falta cambio: `delivery_credenciales_app` no tiene `tenant_id`)

**Interfaces:**
- Produces: tablas `delivery_conexiones(id, tenant_id, sucursal_id, app, estado, tienda_id_externo, auto_aceptar, tiempo_prep_min, config jsonb, …)`, `delivery_pedidos(id, tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado, items jsonb, payload_raw jsonb, ticket_id, vence_aceptacion, …)`, `delivery_eventos`, `delivery_credenciales_app(app, entorno, access_token, vence_at)`.

- [ ] **Step 1: Escribir el test pgTAP (falla porque las tablas no existen)**

```sql
-- supabase/tests/0004_delivery_rls.test.sql
-- RLS de las tablas de delivery por apps (migración 0090). Dos tenants: cada uno ve solo lo suyo,
-- no puede insertar en el otro, y `delivery_credenciales_app` es deny-all para authenticated.
begin;
select plan(8);

select has_table('delivery_conexiones');
select has_table('delivery_pedidos');
select has_table('delivery_eventos');
select has_table('delivery_credenciales_app');

-- Fixture: dos tenants con una sucursal cada uno (los del seed dev + uno nuevo).
insert into tenants (id, nombre_comercial, razon_social, rfc, estado)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Tenant A', 'Tenant A SA', 'AAA010101AAA', 'ACTIVO'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'Tenant B', 'Tenant B SA', 'BBB010101BBB', 'ACTIVO')
on conflict (id) do nothing;
insert into sucursales (id, tenant_id, codigo, nombre)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'A1', 'Suc A'),
       ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B1', 'Suc B')
on conflict (id) do nothing;

insert into delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'APP_UBEREATS', 'ACTIVA', 'store-a'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'APP_UBEREATS', 'ACTIVA', 'store-b');

-- Simular un JWT `authenticated` del tenant A.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '99999999-0000-0000-0000-000000000001', 'tenant_id', 'aaaaaaaa-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select tienda_id_externo from delivery_conexiones order by 1 $$,
  $$ values ('store-a') $$,
  'Tenant A solo ve su conexión');

select throws_ok(
  $$ insert into delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo)
     values ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'APP_UBEREATS', 'ACTIVA', 'x') $$,
  '42501',
  'Tenant A no puede insertar una conexión del tenant B');

select is_empty(
  $$ select 1 from delivery_credenciales_app $$,
  'authenticated no lee credenciales de aplicación (deny-all)');

select throws_ok(
  $$ insert into delivery_credenciales_app (app, entorno, access_token, vence_at) values ('APP_UBEREATS','sandbox','t', now()) $$,
  '42501',
  'authenticated no escribe credenciales de aplicación');

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `supabase test db` (con Docker arriba y `supabase start` hecho)
Expected: FAIL en `has_table('delivery_conexiones')`.

- [ ] **Step 3: Escribir la migración**

```sql
-- ============================================================================
-- 0090 — Integración con apps de delivery (ADR 0011): conexiones, pedidos, bitácora, credenciales.
--
-- `delivery_pedidos` vive aparte del ticket a propósito: un pedido puede llegar sin turno abierto,
-- puede rechazarse sin haber creado ticket, y guarda el JSON tal cual llegó para soporte y para
-- la conciliación contra lo que la app liquida.
-- `delivery_credenciales_app` NO tiene tenant_id: es el token de la aplicación de VIM (uno por app y
-- entorno). RLS activado sin políticas = deny-all para authenticated/anon; solo service_role.
-- ============================================================================

CREATE TABLE delivery_conexiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  marca_virtual_id    uuid NULL REFERENCES marcas_virtuales(id),

  app                 modo_servicio NOT NULL,
  estado              varchar(20) NOT NULL DEFAULT 'SIN_CONECTAR',
  tienda_id_externo   text NULL,              -- store_id (Uber, uuid) / shop_id (DiDi) / rappiId
  tienda_nombre_app   text NULL,
  auto_aceptar        boolean NOT NULL DEFAULT true,
  tiempo_prep_min     integer NOT NULL DEFAULT 15 CHECK (tiempo_prep_min BETWEEN 1 AND 180),
  credencial_tienda   text NULL,              -- solo DiDi (F2): auth_token por tienda
  credencial_vence    timestamptz NULL,
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,   -- producto_generico_id, incremento_pct, webhooks_version…
  ultimo_evento_at    timestamptz NULL,
  ultimo_error        text NULL,
  conectada_at        timestamptz NULL,
  desconectada_at     timestamptz NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),

  CONSTRAINT delivery_conexion_app_valida CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  CONSTRAINT delivery_conexion_estado_valido CHECK (
    estado IN ('SIN_CONECTAR', 'PENDIENTE', 'ACTIVA', 'PAUSADA', 'ERROR', 'DESCONECTADA')),
  CONSTRAINT delivery_conexion_unica UNIQUE (sucursal_id, app)
);
-- El webhook enruta por el id de tienda de la app: debe ser único por app.
CREATE UNIQUE INDEX idx_delivery_conexion_tienda_externa
  ON delivery_conexiones(app, tienda_id_externo) WHERE tienda_id_externo IS NOT NULL;

CREATE TABLE delivery_pedidos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  conexion_id         uuid NOT NULL REFERENCES delivery_conexiones(id) ON DELETE RESTRICT,
  app                 modo_servicio NOT NULL,

  id_externo          text NOT NULL,           -- order_id de la app (string siempre)
  folio_corto         text NULL,               -- display_id / order_index: el que se grita en cocina
  estado              varchar(20) NOT NULL DEFAULT 'RECIBIDO',
  estado_app          text NULL,               -- state/status tal cual lo reporta la app
  tipo_entrega        varchar(25) NULL,        -- APP_REPARTE | RESTAURANTE_REPARTE | RECOGE_CLIENTE
  programado_para     timestamptz NULL,
  vence_aceptacion    timestamptz NULL,

  cliente_nombre      varchar(150) NULL,
  cliente_telefono    varchar(40) NULL,
  cliente_telefono_pin varchar(20) NULL,
  direccion_texto     text NULL,
  nota_cliente        text NULL,

  -- Ítems ya normalizados: [{producto_id, nombre_app, cantidad, precio_unitario_mxn, nota,
  --   modificadores:[{opcion_modificador_id, nombre_app, cantidad, precio_extra_mxn}]}]
  items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  items_sin_mapear    jsonb NULL,

  subtotal_mxn        numeric(12,2) NULL,
  descuento_app_mxn   numeric(12,2) NULL,
  descuento_tienda_mxn numeric(12,2) NULL,
  envio_mxn           numeric(12,2) NULL,
  propina_mxn         numeric(12,2) NULL,
  total_cliente_mxn   numeric(12,2) NULL,
  total_restaurante_mxn numeric(12,2) NULL,
  efectivo_a_cobrar_mxn numeric(12,2) NOT NULL DEFAULT 0,

  payload_raw         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ticket_id           uuid NULL REFERENCES tickets(id),

  repartidor_nombre   varchar(150) NULL,
  repartidor_telefono varchar(40) NULL,
  repartidor_estado   varchar(40) NULL,

  recibido_at         timestamptz NOT NULL DEFAULT now(),
  aceptado_at         timestamptz NULL,
  listo_at            timestamptz NULL,
  entregado_at        timestamptz NULL,
  cancelado_at        timestamptz NULL,
  motivo_cancelacion  text NULL,
  cancelado_por       varchar(20) NULL,        -- APP | RESTAURANTE | TIMEOUT
  ultimo_error        text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delivery_pedido_app_valida CHECK (app IN ('APP_RAPPI', 'APP_UBEREATS', 'APP_DIDI')),
  CONSTRAINT delivery_pedido_estado_valido CHECK (
    estado IN ('RECIBIDO', 'ACEPTADO', 'RECHAZADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO', 'EXPIRADO', 'ERROR')),
  CONSTRAINT delivery_pedido_unico UNIQUE (app, id_externo)
);
CREATE INDEX idx_delivery_pedidos_sucursal_activos
  ON delivery_pedidos(sucursal_id, recibido_at DESC)
  WHERE estado IN ('RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO');
CREATE INDEX idx_delivery_pedidos_ticket ON delivery_pedidos(ticket_id) WHERE ticket_id IS NOT NULL;

CREATE TABLE delivery_eventos (
  id                  bigserial PRIMARY KEY,
  tenant_id           uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT,   -- NULL si no se pudo enrutar
  conexion_id         uuid NULL REFERENCES delivery_conexiones(id),
  app                 modo_servicio NOT NULL,
  direccion           varchar(10) NOT NULL,     -- ENTRADA (webhook) | SALIDA (llamada nuestra)
  tipo                varchar(80) NOT NULL,     -- orders.notification, accept, deny…
  id_externo          text NULL,
  evento_id_externo   text NULL,                -- event_id de Uber: idempotencia
  firma_valida        boolean NULL,
  http_status         integer NULL,
  payload             jsonb NULL,
  respuesta           jsonb NULL,
  procesado           boolean NOT NULL DEFAULT false,
  error               text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_evento_direccion_valida CHECK (direccion IN ('ENTRADA', 'SALIDA'))
);
CREATE UNIQUE INDEX idx_delivery_eventos_evento_externo
  ON delivery_eventos(app, evento_id_externo) WHERE evento_id_externo IS NOT NULL;
CREATE INDEX idx_delivery_eventos_pedido ON delivery_eventos(app, id_externo, created_at DESC);

CREATE TABLE delivery_credenciales_app (
  app                 modo_servicio NOT NULL,
  entorno             varchar(12) NOT NULL,      -- sandbox | produccion
  access_token        text NOT NULL,
  vence_at            timestamptz NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app, entorno)
);

-- ---------------------------------------------------------------------------
-- RLS + grants (patrón 0078: GRANT explícito; RLS filtra por tenant).
-- ---------------------------------------------------------------------------
ALTER TABLE delivery_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_credenciales_app ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON delivery_conexiones TO authenticated, service_role;
GRANT SELECT ON delivery_pedidos TO authenticated;                 -- el POS lee; escribe solo service_role
GRANT SELECT, INSERT, UPDATE ON delivery_pedidos TO service_role;
GRANT SELECT ON delivery_eventos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON delivery_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE delivery_eventos_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_credenciales_app TO service_role;

DO $$ BEGIN
  CREATE POLICY delivery_conexiones_select ON delivery_conexiones FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_conexiones_insert ON delivery_conexiones FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_conexiones_update ON delivery_conexiones FOR UPDATE
    USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_pedidos_select ON delivery_pedidos FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY delivery_eventos_select ON delivery_eventos FOR SELECT USING (tenant_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- delivery_credenciales_app: sin políticas a propósito (deny-all para authenticated/anon).

-- Sello de updated_at (mismo helper que el resto del esquema, 0001).
CREATE TRIGGER trg_delivery_conexiones_updated BEFORE UPDATE ON delivery_conexiones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_delivery_pedidos_updated BEFORE UPDATE ON delivery_pedidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE delivery_conexiones IS 'Sucursal × app de delivery: id de tienda en la app, estado, auto-aceptar, config. ADR 0011.';
COMMENT ON TABLE delivery_pedidos IS 'Pedido recibido de una app (crudo + normalizado), enlazado al ticket cuando se acepta. ADR 0011.';
COMMENT ON TABLE delivery_eventos IS 'Bitácora de webhooks recibidos y llamadas hechas a las apps. Base de la tasa de éxito que exigen.';
COMMENT ON TABLE delivery_credenciales_app IS 'Token OAuth de la aplicación de VIM por app y entorno. Solo service_role.';
```

Antes de aplicar, confirmar el nombre real del helper de `updated_at`: `grep -n "FUNCTION set_updated_at\|FUNCTION actualizar_updated_at" supabase/migrations/0001_extensiones_y_helpers.sql`. Si se llama distinto, usar ese nombre en los dos triggers.

- [ ] **Step 4: Aplicar y correr el test**

Run: `supabase db reset && supabase test db`
Expected: `0004_delivery_rls.test.sql` PASS (8/8) y `0002_rls_cobertura` sigue en verde (las tres tablas con `tenant_id` tienen RLS y política).

- [ ] **Step 5: Regenerar tipos y commit**

```bash
pnpm db:types
git add supabase/migrations/0090_delivery_conexiones_pedidos.sql supabase/tests/0004_delivery_rls.test.sql packages/db/src/database.types.ts
git commit -m "db: 0090 tablas de delivery por apps (conexiones, pedidos, eventos, credenciales) con RLS"
```

---

## Task 3: Migración 0091 — RPC `crear_ticket_desde_app` + smoke

**Files:**
- Create: `supabase/migrations/0091_delivery_rpc_ticket_desde_app.sql`
- Create: `supabase/scripts/smoke_delivery_app.sql`

**Interfaces:**
- Consumes: `abrir_ticket(p_sucursal_id, p_caja_id, p_turno_id, p_modo_servicio, p_cliente_id, p_marca_virtual_id, p_client_id_local, p_usuario_id) → uuid`; `agregar_item_a_ticket(p_ticket_id, p_producto_id, p_cantidad, p_nota_cocina, p_modificadores jsonb, p_client_id_local) → uuid` (modificadores `[{opcion_modificador_id, cantidad}]`); `recalcular_totales_ticket(uuid)`; `aplicar_pago(p_ticket_id, p_metodo_pago, p_monto_mxn, p_monto_recibido_mxn, p_referencia, p_terminal_aprobacion, p_folio_externo, p_es_pago_al_recibir, p_nota, p_client_id_local) → uuid`.
- Produces: `crear_ticket_desde_app(p_pedido_id uuid) RETURNS uuid` (ticket_id; idempotente; lanza `SIN_TURNO_ABIERTO`, `ITEM_SIN_MAPEAR`, `PEDIDO_NO_ACEPTABLE`); `delivery_pedido_transicion(p_pedido_id uuid, p_estado text, p_detalle text) RETURNS void`.

- [ ] **Step 1: Escribir el smoke (falla: la función no existe)**

```sql
-- supabase/scripts/smoke_delivery_app.sql
-- Smoke Delivery F1: pedido de Uber (normalizado) → crear_ticket_desde_app → ticket PAGADO con
-- metodo APP_UBEREATS, ítems al precio de la app, en cocina; idempotente; sin turno lanza error. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja   uuid := '99999999-0000-0000-0000-0000000000cc';
  v_maria  uuid := '99999999-0000-0000-0000-000000000001';
  v_turno uuid; v_conexion uuid; v_pedido uuid; v_ticket uuid; v_ticket2 uuid;
  v_prod uuid; v_opcion uuid; v_grupo uuid;
  v_total numeric; v_estado text; v_cocina text; v_metodo text; v_precio numeric; v_n int;
BEGIN
  -- Usuario y turno (el RPC corre como service_role; el smoke simula esa ausencia de JWT).
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE turnos SET estado='CERRADO', fecha_cierre=now() WHERE caja_id=v_caja AND estado='ABIERTO';

  SELECT id INTO v_prod FROM productos WHERE tenant_id=v_tenant AND nombre='Hamburguesa Clásica' LIMIT 1;
  SELECT om.id, om.grupo_id INTO v_opcion, v_grupo FROM opciones_modificador om
    JOIN productos_grupos_modificadores pg ON pg.grupo_id = om.grupo_id AND pg.producto_id = v_prod
    WHERE om.deleted_at IS NULL LIMIT 1;

  INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tiempo_prep_min)
  VALUES (v_tenant, v_suc, 'APP_UBEREATS', 'ACTIVA', 'store-smoke', 12) RETURNING id INTO v_conexion;

  INSERT INTO delivery_pedidos (tenant_id, sucursal_id, conexion_id, app, id_externo, folio_corto, estado,
    cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion)
  VALUES (v_tenant, v_suc, v_conexion, 'APP_UBEREATS', 'uber-smoke-1', '2A003', 'RECIBIDO',
    'Cliente Uber', 'Sin cebolla por favor',
    jsonb_build_array(
      jsonb_build_object('producto_id', v_prod, 'nombre_app', 'Hamburguesa Clásica', 'cantidad', 2,
        'precio_unitario_mxn', 150.00, 'nota', 'bien cocida',
        'modificadores', CASE WHEN v_opcion IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
          jsonb_build_object('opcion_modificador_id', v_opcion, 'nombre_app', 'extra', 'cantidad', 1, 'precio_extra_mxn', 20.00)) END)),
    340.00, now() + interval '11 minutes')
  RETURNING id INTO v_pedido;

  -- 1) Sin turno abierto → error claro y el pedido sigue RECIBIDO.
  BEGIN
    PERFORM crear_ticket_desde_app(v_pedido);
    RAISE EXCEPTION 'debió fallar sin turno';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SIN_TURNO_ABIERTO%' THEN RAISE; END IF;
    RAISE NOTICE 'sin turno: % (esperado SIN_TURNO_ABIERTO)', SQLERRM;
  END;

  -- 2) Con turno abierto → ticket PAGADO en cocina, precios de la app.
  INSERT INTO turnos(tenant_id, sucursal_id, caja_id, codigo_turno, dia_contable, usuario_apertura_id, fondo_inicial_mxn, fondo_modo)
  VALUES (v_tenant, v_suc, v_caja, 'SMOKE-APP', CURRENT_DATE, v_maria, 500, 'TOTAL') RETURNING id INTO v_turno;

  v_ticket := crear_ticket_desde_app(v_pedido);
  SELECT estado_fiscal, estado_cocina, total_mxn INTO v_estado, v_cocina, v_total FROM tickets WHERE id = v_ticket;
  RAISE NOTICE 'ticket %: fiscal=% cocina=% total=%', v_ticket, v_estado, v_cocina, v_total;
  IF v_estado <> 'PAGADO' THEN RAISE EXCEPTION 'no quedó PAGADO'; END IF;
  IF v_cocina <> 'EN_COCINA' THEN RAISE EXCEPTION 'no entró a cocina'; END IF;
  SELECT precio_unitario_snapshot INTO v_precio FROM ticket_items WHERE ticket_id = v_ticket LIMIT 1;
  IF v_precio <> 150.00 THEN RAISE EXCEPTION 'el ítem no lleva el precio de la app (%)', v_precio; END IF;
  SELECT metodo_pago::text INTO v_metodo FROM pagos WHERE ticket_id = v_ticket LIMIT 1;
  IF v_metodo <> 'APP_UBEREATS' THEN RAISE EXCEPTION 'pago con método %', v_metodo; END IF;
  SELECT estado, ticket_id INTO v_estado, v_ticket2 FROM delivery_pedidos WHERE id = v_pedido;
  IF v_estado <> 'ACEPTADO' OR v_ticket2 <> v_ticket THEN RAISE EXCEPTION 'pedido no quedó ACEPTADO/enlazado'; END IF;
  SELECT folio_externo_app, origen_creacion::text INTO v_metodo, v_cocina FROM tickets WHERE id = v_ticket;
  IF v_metodo <> 'uber-smoke-1' OR v_cocina <> 'API_EXTERNA' THEN RAISE EXCEPTION 'falta folio_externo_app/origen'; END IF;

  -- 3) Idempotente: segunda llamada devuelve el mismo ticket y no duplica pagos.
  v_ticket2 := crear_ticket_desde_app(v_pedido);
  IF v_ticket2 <> v_ticket THEN RAISE EXCEPTION 'no es idempotente'; END IF;
  SELECT count(*) INTO v_n FROM pagos WHERE ticket_id = v_ticket;
  IF v_n <> 1 THEN RAISE EXCEPTION 'pagos duplicados: %', v_n; END IF;

  -- 4) Transición manual: listo.
  PERFORM delivery_pedido_transicion(v_pedido, 'LISTO', NULL);
  SELECT estado INTO v_estado FROM delivery_pedidos WHERE id = v_pedido;
  IF v_estado <> 'LISTO' THEN RAISE EXCEPTION 'transición a LISTO falló'; END IF;

  RAISE NOTICE 'SMOKE DELIVERY APP: OK';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Correr el smoke para ver que falla**

Run (Docker arriba): `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/scripts/smoke_delivery_app.sql`
Expected: error `function crear_ticket_desde_app(uuid) does not exist`.

- [ ] **Step 3: Escribir la migración 0091**

```sql
-- ============================================================================
-- 0091 — Crear el ticket a partir de un pedido de app (ADR 0011).
--
-- Corre como service_role desde las Edge Functions (no hay JWT de empleado). `pagos.usuario_id` es
-- NOT NULL y las RPCs de venta leen auth.uid(), así que aquí se fija el claim `sub` al usuario
-- que abrió el turno: el ticket queda "procesado por la caja", igual que si lo hubiera capturado
-- el cajero en turno. Solo service_role puede ejecutarla; el POS pasa por delivery-accion.
-- ============================================================================
CREATE OR REPLACE FUNCTION crear_ticket_desde_app(p_pedido_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_pedido      delivery_pedidos%ROWTYPE;
  v_conexion    delivery_conexiones%ROWTYPE;
  v_turno       record;
  v_ticket_id   uuid;
  v_item        jsonb;
  v_modif       jsonb;
  v_producto_id uuid;
  v_generico_id uuid;
  v_item_id     uuid;
  v_precio      numeric(12,2);
  v_total       numeric(12,2);
  v_claims_prev text;
BEGIN
  SELECT * INTO v_pedido FROM delivery_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
  IF v_pedido.ticket_id IS NOT NULL THEN RETURN v_pedido.ticket_id; END IF;   -- idempotente
  IF v_pedido.estado NOT IN ('RECIBIDO', 'ERROR') THEN
    RAISE EXCEPTION 'PEDIDO_NO_ACEPTABLE: estado %', v_pedido.estado;
  END IF;

  SELECT * INTO v_conexion FROM delivery_conexiones WHERE id = v_pedido.conexion_id;
  v_generico_id := NULLIF(v_conexion.config->>'producto_generico_id', '')::uuid;

  -- Turno abierto más reciente de la sucursal (cualquier caja).
  SELECT t.id, t.caja_id, t.usuario_apertura_id INTO v_turno
  FROM turnos t
  WHERE t.sucursal_id = v_pedido.sucursal_id AND t.estado = 'ABIERTO'
  ORDER BY t.fecha_apertura DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIN_TURNO_ABIERTO: sucursal %', v_pedido.sucursal_id; END IF;

  -- Actuar como el usuario del turno (auth.uid() en las RPCs de venta).
  v_claims_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_turno.usuario_apertura_id::text, 'tenant_id', v_pedido.tenant_id::text, 'role', 'authenticated')::text,
    true);

  v_ticket_id := abrir_ticket(v_pedido.sucursal_id, v_turno.caja_id, v_turno.id, v_pedido.app,
                              NULL, v_conexion.marca_virtual_id,
                              'app:' || v_pedido.app::text || ':' || v_pedido.id_externo,
                              v_turno.usuario_apertura_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.items) LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::uuid;
    IF v_producto_id IS NULL THEN
      IF v_generico_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_SIN_MAPEAR: % (sin producto genérico configurado)', v_item->>'nombre_app';
      END IF;
      v_producto_id := v_generico_id;
    END IF;

    v_item_id := agregar_item_a_ticket(
      v_ticket_id, v_producto_id, (v_item->>'cantidad')::numeric,
      NULLIF(concat_ws(' · ', CASE WHEN v_producto_id = v_generico_id THEN v_item->>'nombre_app' END, v_item->>'nota'), ''),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('opcion_modificador_id', m->>'opcion_modificador_id', 'cantidad', COALESCE((m->>'cantidad')::int, 1)))
                FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) m
                WHERE NULLIF(m->>'opcion_modificador_id', '') IS NOT NULL), '[]'::jsonb),
      NULL);

    -- El precio del ticket es el que pagó el cliente en la app, no el de catálogo.
    v_precio := (v_item->>'precio_unitario_mxn')::numeric(12,2);
    UPDATE ticket_items SET precio_unitario_snapshot = v_precio WHERE id = v_item_id;
    FOR v_modif IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'modificadores', '[]'::jsonb)) LOOP
      IF NULLIF(v_modif->>'opcion_modificador_id', '') IS NOT NULL THEN
        UPDATE ticket_item_modificadores
        SET precio_extra_snapshot = (v_modif->>'precio_extra_mxn')::numeric(12,2),
            monto_total_mxn = (v_modif->>'precio_extra_mxn')::numeric(12,2) * cantidad * (v_item->>'cantidad')::numeric
        WHERE ticket_item_id = v_item_id AND opcion_modificador_id = (v_modif->>'opcion_modificador_id')::uuid;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM recalcular_totales_ticket(v_ticket_id);

  UPDATE tickets
  SET folio_externo_app = v_pedido.id_externo,
      origen_creacion   = 'API_EXTERNA',
      nombre_cliente    = LEFT(v_pedido.cliente_nombre, 100),
      nota_general      = v_pedido.nota_cliente
  WHERE id = v_ticket_id;

  SELECT total_mxn INTO v_total FROM tickets WHERE id = v_ticket_id;
  IF v_total > 0 THEN
    PERFORM aplicar_pago(v_ticket_id, v_pedido.app::text::metodo_pago, v_total, NULL, NULL, NULL,
                         v_pedido.id_externo, false, 'Pagado en la app',
                         'app-pago:' || v_pedido.app::text || ':' || v_pedido.id_externo);
  END IF;

  -- A cocina de inmediato (el trigger de 0008 sella fecha_envio_cocina).
  UPDATE tickets SET estado_cocina = 'EN_COCINA' WHERE id = v_ticket_id AND estado_cocina = 'SIN_ENVIAR';

  UPDATE delivery_pedidos
  SET ticket_id = v_ticket_id, estado = 'ACEPTADO', aceptado_at = COALESCE(aceptado_at, now()), ultimo_error = NULL
  WHERE id = p_pedido_id;

  PERFORM set_config('request.jwt.claims', v_claims_prev, true);
  RETURN v_ticket_id;
END;
$$;

REVOKE ALL ON FUNCTION crear_ticket_desde_app(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_ticket_desde_app(uuid) TO service_role;
COMMENT ON FUNCTION crear_ticket_desde_app IS 'Crea el ticket (pagado por la app, en cocina) a partir de delivery_pedidos. Idempotente. Solo service_role.';

-- Transición de estado del pedido con sello de tiempo (solo service_role: el POS pasa por delivery-accion).
CREATE OR REPLACE FUNCTION delivery_pedido_transicion(p_pedido_id uuid, p_estado text, p_detalle text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE delivery_pedidos
  SET estado = p_estado,
      listo_at      = CASE WHEN p_estado = 'LISTO' THEN now() ELSE listo_at END,
      entregado_at  = CASE WHEN p_estado = 'ENTREGADO' THEN now() ELSE entregado_at END,
      cancelado_at  = CASE WHEN p_estado IN ('RECHAZADO', 'CANCELADO', 'EXPIRADO') THEN now() ELSE cancelado_at END,
      motivo_cancelacion = CASE WHEN p_estado IN ('RECHAZADO', 'CANCELADO', 'EXPIRADO') THEN p_detalle ELSE motivo_cancelacion END,
      ultimo_error  = CASE WHEN p_estado = 'ERROR' THEN p_detalle ELSE ultimo_error END
  WHERE id = p_pedido_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_EXISTE: %', p_pedido_id; END IF;
END;
$$;
REVOKE ALL ON FUNCTION delivery_pedido_transicion(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delivery_pedido_transicion(uuid, text, text) TO service_role;
```

- [ ] **Step 4: Aplicar y correr el smoke**

Run: `supabase db reset` y luego el `psql … -f supabase/scripts/smoke_delivery_app.sql` del paso 2.
Expected: `NOTICE: SMOKE DELIVERY APP: OK`. Si `abrir_ticket` rechaza por permisos del claim simulado, revisar el mensaje y ajustar el `json_build_object` de claims (añadir `tipo_identidad` si `current_tenant_id()` lo exige; ver `0006_auditoria_y_auth_hook.sql`).

- [ ] **Step 5: Test de grants (0003) y commit**

Run: `supabase test db` → `0003_grants_secdef.test.sql` debe seguir en verde (las dos funciones nuevas son SECURITY DEFINER con `search_path` fijado y sin EXECUTE para `authenticated`).

```bash
git add supabase/migrations/0091_delivery_rpc_ticket_desde_app.sql supabase/scripts/smoke_delivery_app.sql
git commit -m "db: 0091 crear_ticket_desde_app + transicion de pedidos de app (solo service_role)"
```

---

## Task 4: Módulos puros del adaptador Uber (`_shared/delivery/`)

**Files:**
- Create: `supabase/functions/_shared/delivery/tipos.ts`
- Create: `supabase/functions/_shared/delivery/firma.ts`
- Create: `supabase/functions/_shared/delivery/firma.test.ts`
- Create: `supabase/functions/_shared/delivery/uber.ts`
- Create: `supabase/functions/_shared/delivery/uber.test.ts`
- Modify: `package.json` → `"test:functions": "node --test --experimental-strip-types supabase/functions/_shared/pac/*.test.ts supabase/functions/_shared/delivery/*.test.ts"`

**Interfaces (Produces):**

```ts
// tipos.ts
export type AppDelivery = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";
export type ModificadorNormalizado = { opcion_modificador_id: string | null; nombre_app: string; cantidad: number; precio_extra_mxn: string };
export type ItemNormalizado = { producto_id: string | null; nombre_app: string; cantidad: number; precio_unitario_mxn: string; nota: string | null; modificadores: ModificadorNormalizado[] };
export type PedidoNormalizado = {
  app: AppDelivery; id_externo: string; folio_corto: string | null; estado_app: string | null;
  tipo_entrega: "APP_REPARTE" | "RESTAURANTE_REPARTE" | "RECOGE_CLIENTE" | null;
  programado_para: string | null; cliente_nombre: string | null; cliente_telefono: string | null;
  cliente_telefono_pin: string | null; direccion_texto: string | null; nota_cliente: string | null;
  items: ItemNormalizado[]; items_sin_mapear: { nombre_app: string; id_app: string }[];
  subtotal_mxn: string | null; descuento_app_mxn: string | null; descuento_tienda_mxn: string | null;
  envio_mxn: string | null; propina_mxn: string | null; total_cliente_mxn: string | null;
  total_restaurante_mxn: string | null; efectivo_a_cobrar_mxn: string;
};
// Los montos viajan como string decimal "150.00" (numeric en BD), nunca como float.

// firma.ts
export async function hmacSha256Hex(secreto: string, cuerpo: string): Promise<string>;
export function igualesEnTiempoConstante(a: string, b: string): boolean;

// uber.ts
export function e5ADecimal(amountE5: number): string;                 // 750000 → "7.50"
export function segundosAReadyTime(ahora: Date, minutos: number): string; // RFC3339
export function normalizarPedidoUber(orden: unknown, esUuidConocido: (id: string) => boolean): PedidoNormalizado;
export function motivoRechazoUber(motivo: "AGOTADO" | "CERRADO" | "SATURADO" | "POS_OFFLINE" | "OTRO", detalle?: string): { deny_reason: { type: string; info?: string } };
export type ClienteUber = { obtenerToken(): Promise<string>; obtenerOrden(id: string): Promise<unknown>; aceptar(id: string, readyTime: string, folio: string): Promise<void>; rechazar(id: string, cuerpo: unknown): Promise<void>; marcarLista(id: string): Promise<void> };
export function crearClienteUber(cfg: { entorno: "sandbox" | "produccion"; clientId: string; clientSecret: string; fetchFn?: typeof fetch; tokenCache?: { leer(): Promise<string | null>; guardar(t: string, venceAt: Date): Promise<void> } }): ClienteUber;
```

- [ ] **Step 1: Test de firma (falla: no existe el módulo)**

```ts
// supabase/functions/_shared/delivery/firma.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { hmacSha256Hex, igualesEnTiempoConstante } from "./firma.ts";

test("HMAC-SHA256 hex en minúsculas, igual que el ejemplo de Uber (hmac.new(secret, body, sha256).hexdigest())", async () => {
  // Vector conocido: HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
  const h = await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog");
  assert.equal(h, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
});

test("comparación en tiempo constante: iguales → true, distinta longitud o contenido → false", () => {
  assert.equal(igualesEnTiempoConstante("abc", "abc"), true);
  assert.equal(igualesEnTiempoConstante("abc", "abd"), false);
  assert.equal(igualesEnTiempoConstante("abc", "ab"), false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `pnpm test:functions`
Expected: FAIL `Cannot find module './firma.ts'`.

- [ ] **Step 3: Implementar `firma.ts` y `tipos.ts`**

```ts
// supabase/functions/_shared/delivery/firma.ts
// Firma de webhooks. Uber: X-Uber-Signature = HMAC-SHA256(client_secret, body) en hex minúsculas.
// Web Crypto está en Deno y en Node ≥ 20, así que el mismo módulo se prueba con node --test.
export async function hmacSha256Hex(secreto: string, cuerpo: string): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode(cuerpo));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Evita que el tiempo de comparación revele cuántos bytes coincidían. */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

```ts
// supabase/functions/_shared/delivery/tipos.ts
export type AppDelivery = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";
export type TipoEntrega = "APP_REPARTE" | "RESTAURANTE_REPARTE" | "RECOGE_CLIENTE";

export type ModificadorNormalizado = {
  opcion_modificador_id: string | null;
  nombre_app: string;
  cantidad: number;
  precio_extra_mxn: string;   // decimal como texto: "20.00"
};

export type ItemNormalizado = {
  producto_id: string | null;   // null = no existe en el catálogo de VIM
  nombre_app: string;
  cantidad: number;
  precio_unitario_mxn: string;
  nota: string | null;
  modificadores: ModificadorNormalizado[];
};

export type PedidoNormalizado = {
  app: AppDelivery;
  id_externo: string;
  folio_corto: string | null;
  estado_app: string | null;
  tipo_entrega: TipoEntrega | null;
  programado_para: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_telefono_pin: string | null;
  direccion_texto: string | null;
  nota_cliente: string | null;
  items: ItemNormalizado[];
  items_sin_mapear: { nombre_app: string; id_app: string }[];
  subtotal_mxn: string | null;
  descuento_app_mxn: string | null;
  descuento_tienda_mxn: string | null;
  envio_mxn: string | null;
  propina_mxn: string | null;
  total_cliente_mxn: string | null;
  total_restaurante_mxn: string | null;
  efectivo_a_cobrar_mxn: string;
};
```

- [ ] **Step 4: Correr el test de firma → PASS. Commit**

```bash
git add supabase/functions/_shared/delivery/tipos.ts supabase/functions/_shared/delivery/firma.ts supabase/functions/_shared/delivery/firma.test.ts package.json
git commit -m "functions: firma HMAC en tiempo constante y tipos del pedido normalizado de delivery"
```

- [ ] **Step 5: Test del adaptador Uber (falla)**

```ts
// supabase/functions/_shared/delivery/uber.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { e5ADecimal, normalizarPedidoUber, motivoRechazoUber, crearClienteUber, segundosAReadyTime } from "./uber.ts";

const PROD = "11111111-1111-4111-8111-111111111111";
const OPCION = "22222222-2222-4222-8222-222222222222";

/** Orden de restaurante recortada de order-fulfillment-api.openapi.json (restaurant_order). */
const ORDEN = {
  order: {
    id: "bd1ed236-ee79-11ed-a05b-0242ac12A003",
    display_id: "2A003",
    state: "OFFERED",
    status: "ACTIVE",
    fulfillment_type: "DELIVERY_BY_UBER",
    store: { id: "store-1", name: "Knock-Out" },
    customers: [{ id: "c1", name: { display_name: "Uber L", first_name: "Uber", last_name: "L" },
      contact: { phone: { number: "+52-477-000-0000", pin_code: "888 52 337", country_iso2: "MX" } }, is_primary_customer: true }],
    deliveries: [{ id: "d1", status: "SCHEDULED", location: { street_address_line_one: "Blvd. Campestre 100", city: "León" } }],
    carts: [{
      id: "cart1",
      special_instructions: "Tocar el timbre",
      items: [
        { id: PROD, cart_item_id: "ci1", title: "Hamburguesa Clásica", quantity: { amount: 2 },
          customer_request: { special_instructions: "sin cebolla" },
          selected_modifier_groups: [{ id: "g1", title: "Extras",
            selected_items: [{ id: OPCION, title: "Extra queso", quantity: { amount: 1 } }] }] },
        { id: "no-existe", cart_item_id: "ci2", title: "Malteada", quantity: { amount: 1 }, selected_modifier_groups: [] },
      ],
    }],
    payment: { payment_detail: {
      currency_code: "MXN",
      order_total: { gross: { amount_e5: 34000000 } },
      item_charges: { total: { gross: { amount_e5: 32000000 } },
        price_breakdown: [
          { cart_item_id: "ci1", price_type: "ITEM", quantity: { amount: 2 }, unit: { gross: { amount_e5: 15000000 } } },
          { cart_item_id: "ci1", price_type: "OPTION", quantity: { amount: 1 }, unit: { gross: { amount_e5: 2000000 } } },
          { cart_item_id: "ci2", price_type: "ITEM", quantity: { amount: 1 }, unit: { gross: { amount_e5: 4500000 } } },
        ] },
      fees: { total: { gross: { amount_e5: 2500000 } } },
      tips: { total: { gross: { amount_e5: 1000000 } } },
      promotions: { total: { gross: { amount_e5: 500000 } } },
      cash_amount_due: { gross: { amount_e5: 0 } },
    } },
    created_time: "2026-09-02T10:00:00.000Z",
  },
};

test("e5ADecimal: 750000 → 7.50, redondeo a centavos, sin flotantes raros", () => {
  assert.equal(e5ADecimal(750000), "7.50");
  assert.equal(e5ADecimal(34000000), "340.00");
  assert.equal(e5ADecimal(123456), "1.23");
  assert.equal(e5ADecimal(0), "0.00");
});

test("normalizarPedidoUber: ítems por uuid, precio unitario de la app, sin mapear aparte", () => {
  const p = normalizarPedidoUber(ORDEN, (id) => id === PROD || id === OPCION);
  assert.equal(p.app, "APP_UBEREATS");
  assert.equal(p.id_externo, "bd1ed236-ee79-11ed-a05b-0242ac12A003");
  assert.equal(p.folio_corto, "2A003");
  assert.equal(p.tipo_entrega, "APP_REPARTE");
  assert.equal(p.cliente_nombre, "Uber L");
  assert.equal(p.cliente_telefono_pin, "888 52 337");
  assert.equal(p.nota_cliente, "Tocar el timbre");
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].producto_id, PROD);
  assert.equal(p.items[0].cantidad, 2);
  assert.equal(p.items[0].precio_unitario_mxn, "150.00");
  assert.equal(p.items[0].nota, "sin cebolla");
  assert.equal(p.items[0].modificadores[0].opcion_modificador_id, OPCION);
  assert.equal(p.items[0].modificadores[0].precio_extra_mxn, "20.00");
  assert.equal(p.items[1].producto_id, null);
  assert.equal(p.items[1].precio_unitario_mxn, "45.00");
  assert.deepEqual(p.items_sin_mapear, [{ nombre_app: "Malteada", id_app: "no-existe" }]);
  assert.equal(p.total_cliente_mxn, "340.00");
  assert.equal(p.subtotal_mxn, "320.00");
  assert.equal(p.propina_mxn, "10.00");
  assert.equal(p.envio_mxn, "25.00");
  assert.equal(p.descuento_app_mxn, "5.00");
  assert.equal(p.efectivo_a_cobrar_mxn, "0.00");
});

test("normalizarPedidoUber: pickup y BYOC se clasifican", () => {
  const pickup = structuredClone(ORDEN); pickup.order.fulfillment_type = "PICKUP";
  assert.equal(normalizarPedidoUber(pickup, () => true).tipo_entrega, "RECOGE_CLIENTE");
  const byoc = structuredClone(ORDEN); byoc.order.fulfillment_type = "DELIVERY_BY_MERCHANT";
  assert.equal(normalizarPedidoUber(byoc, () => true).tipo_entrega, "RESTAURANTE_REPARTE");
});

test("motivoRechazoUber mapea al catálogo de deny_reason.type", () => {
  assert.deepEqual(motivoRechazoUber("AGOTADO", "sin pan"), { deny_reason: { type: "ITEM_ISSUE", info: "sin pan" } });
  assert.equal(motivoRechazoUber("CERRADO").deny_reason.type, "STORE_CLOSED");
  assert.equal(motivoRechazoUber("SATURADO").deny_reason.type, "RESTAURANT_TOO_BUSY");
  assert.equal(motivoRechazoUber("POS_OFFLINE").deny_reason.type, "POS_OFFLINE");
  assert.equal(motivoRechazoUber("OTRO", "x").deny_reason.type, "OTHER");
});

test("segundosAReadyTime: ahora + minutos en RFC3339 UTC", () => {
  assert.equal(segundosAReadyTime(new Date("2026-09-02T10:00:00.000Z"), 15), "2026-09-02T10:15:00.000Z");
});

test("crearClienteUber: token client_credentials en el dominio del entorno, cacheado; aceptar manda ready time y folio", async () => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fetchFn: typeof fetch = async (url, init) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith("/oauth/v2/token")) {
      return new Response(JSON.stringify({ access_token: "TOK", expires_in: 2592000, token_type: "Bearer" }), { status: 200 });
    }
    return new Response("", { status: 200 });
  };
  let guardado: { t: string; v: Date } | null = null;
  const cliente = crearClienteUber({
    entorno: "sandbox", clientId: "id", clientSecret: "sec", fetchFn,
    tokenCache: { leer: async () => guardado?.t ?? null, guardar: async (t, v) => { guardado = { t, v }; } },
  });
  await cliente.aceptar("ord-1", "2026-09-02T10:15:00.000Z", "K-0001");
  assert.equal(llamadas[0].url, "https://sandbox-login.uber.com/oauth/v2/token");
  assert.equal(llamadas[1].url, "https://test-api.uber.com/v1/delivery/order/ord-1/accept");
  assert.equal((llamadas[1].init.headers as Record<string, string>).Authorization, "Bearer TOK");
  assert.deepEqual(JSON.parse(String(llamadas[1].init.body)), { ready_for_pickup_time: "2026-09-02T10:15:00.000Z", external_reference_id: "K-0001" });
  assert.ok(guardado, "guardó el token en el cache");
  await cliente.marcarLista("ord-1");
  assert.equal(llamadas.length, 3, "la segunda llamada reutiliza el token cacheado");
  assert.equal(llamadas[2].url, "https://test-api.uber.com/v1/delivery/order/ord-1/ready");
});

test("crearClienteUber: 409 al aceptar se reporta como YA_PROCESADA, 5xx como error", async () => {
  const fetchFn: typeof fetch = async (url) =>
    String(url).endsWith("/token") ? new Response(JSON.stringify({ access_token: "T", expires_in: 100 }), { status: 200 })
      : new Response(JSON.stringify({ code: "resource_status_conflict" }), { status: 409 });
  const c = crearClienteUber({ entorno: "sandbox", clientId: "i", clientSecret: "s", fetchFn });
  await assert.rejects(() => c.aceptar("o", "2026-09-02T10:15:00.000Z", "f"), /YA_PROCESADA/);
});
```

- [ ] **Step 6: Correr → FAIL (módulo no existe). Implementar `uber.ts`**

```ts
// supabase/functions/_shared/delivery/uber.ts
// Adaptador Uber Eats (Order Fulfillment API v1/delivery + Store API). Sin dependencias de Deno:
// `fetch` se inyecta para poder probarlo con node --test. Doc: docs/integraciones/delivery/03-uber-eats-resumen.md
import type { ItemNormalizado, ModificadorNormalizado, PedidoNormalizado, TipoEntrega } from "./tipos.ts";

const DOMINIOS = {
  sandbox: { auth: "https://sandbox-login.uber.com", api: "https://test-api.uber.com" },
  produccion: { auth: "https://auth.uber.com", api: "https://api.uber.com" },
} as const;

/** amount_e5 (valor × 100 000) → decimal en texto con dos decimales, redondeo a centavos. */
export function e5ADecimal(amountE5: number): string {
  const centavos = Math.round(amountE5 / 1000);
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function segundosAReadyTime(ahora: Date, minutos: number): string {
  return new Date(ahora.getTime() + minutos * 60_000).toISOString();
}

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const grossE5 = (money: unknown): number | null => {
  const g = obj(obj(money).gross);
  return typeof g.amount_e5 === "number" ? g.amount_e5 : null;
};
const dec = (money: unknown): string | null => { const e5 = grossE5(money); return e5 === null ? null : e5ADecimal(e5); };

function tipoEntrega(f: unknown): TipoEntrega | null {
  switch (f) {
    case "DELIVERY_BY_UBER": return "APP_REPARTE";
    case "DELIVERY_BY_MERCHANT": return "RESTAURANTE_REPARTE";
    case "PICKUP": case "DINE_IN": return "RECOGE_CLIENTE";
    default: return null;
  }
}

/**
 * Convierte la respuesta de GET /v1/delivery/order/{id}?expand=carts,deliveries,payment al pedido
 * normalizado. `esUuidConocido` dice si un id de ítem/opción existe en el catálogo del tenant.
 * Precio unitario: `payment.payment_detail.item_charges.price_breakdown` (gross, con IVA), que es
 * lo que pagó el cliente; si no viene, 0.00 y el cajero lo ve.
 */
export function normalizarPedidoUber(orden: unknown, esUuidConocido: (id: string) => boolean): PedidoNormalizado {
  const o = obj(obj(orden).order);
  const detalle = obj(obj(o.payment).payment_detail);
  const breakdown = arr(obj(detalle.item_charges).price_breakdown).map(obj);
  const unitario = (cartItemId: string, tipo: "ITEM" | "OPTION"): string =>
    dec(breakdown.find((b) => b.cart_item_id === cartItemId && b.price_type === tipo)?.unit) ?? "0.00";

  const items: ItemNormalizado[] = [];
  const sinMapear: { nombre_app: string; id_app: string }[] = [];
  for (const cart of arr(o.carts).map(obj)) {
    for (const it of arr(cart.items).map(obj)) {
      const id = str(it.id) ?? "";
      const cartItemId = str(it.cart_item_id) ?? "";
      const nombre = str(it.title) ?? id;
      const conocido = id !== "" && esUuidConocido(id);
      if (!conocido) sinMapear.push({ nombre_app: nombre, id_app: id });
      const modificadores: ModificadorNormalizado[] = [];
      for (const g of arr(it.selected_modifier_groups).map(obj)) {
        for (const sel of arr(g.selected_items).map(obj)) {
          const oid = str(sel.id) ?? "";
          modificadores.push({
            opcion_modificador_id: oid !== "" && esUuidConocido(oid) ? oid : null,
            nombre_app: str(sel.title) ?? oid,
            cantidad: Math.max(1, num(obj(sel.quantity).amount) || 1),
            precio_extra_mxn: unitario(cartItemId, "OPTION"),
          });
        }
      }
      items.push({
        producto_id: conocido ? id : null,
        nombre_app: nombre,
        cantidad: Math.max(1, num(obj(it.quantity).amount) || 1),
        precio_unitario_mxn: unitario(cartItemId, "ITEM"),
        nota: str(obj(it.customer_request).special_instructions),
        modificadores,
      });
    }
  }

  const cliente = arr(o.customers).map(obj).find((c) => c.is_primary_customer === true) ?? obj(arr(o.customers)[0]);
  const telefono = obj(obj(cliente.contact).phone);
  const entrega = obj(arr(o.deliveries)[0]);
  const loc = obj(entrega.location);
  const direccion = [str(loc.street_address_line_one), str(loc.street_address_line_two), str(loc.city)].filter(Boolean).join(", ");
  const rango = obj(o.scheduled_order_target_delivery_time_range);

  return {
    app: "APP_UBEREATS",
    id_externo: str(o.id) ?? "",
    folio_corto: str(o.display_id),
    estado_app: str(o.state),
    tipo_entrega: tipoEntrega(o.fulfillment_type),
    programado_para: o.status === "SCHEDULED" ? str(rango.start_time) : null,
    cliente_nombre: str(obj(cliente.name).display_name),
    cliente_telefono: str(telefono.number),
    cliente_telefono_pin: str(telefono.pin_code),
    direccion_texto: direccion || null,
    nota_cliente: str(arr(o.carts).map(obj)[0]?.special_instructions) ?? str(o.store_instructions),
    items,
    items_sin_mapear: sinMapear,
    subtotal_mxn: dec(obj(detalle.item_charges).total),
    descuento_app_mxn: dec(obj(detalle.promotions).total),
    descuento_tienda_mxn: null,
    envio_mxn: dec(obj(detalle.fees).total),
    propina_mxn: dec(obj(detalle.tips).total),
    total_cliente_mxn: dec(detalle.order_total),
    total_restaurante_mxn: null,
    efectivo_a_cobrar_mxn: dec(detalle.cash_amount_due) ?? "0.00",
  };
}

export type MotivoRechazo = "AGOTADO" | "CERRADO" | "SATURADO" | "POS_OFFLINE" | "OTRO";
export function motivoRechazoUber(motivo: MotivoRechazo, detalle?: string): { deny_reason: { type: string; info?: string } } {
  const type = { AGOTADO: "ITEM_ISSUE", CERRADO: "STORE_CLOSED", SATURADO: "RESTAURANT_TOO_BUSY", POS_OFFLINE: "POS_OFFLINE", OTRO: "OTHER" }[motivo];
  return { deny_reason: detalle ? { type, info: detalle } : { type } };
}

export type ClienteUber = {
  obtenerToken(): Promise<string>;
  obtenerOrden(id: string): Promise<unknown>;
  aceptar(id: string, readyTime: string, folio: string): Promise<void>;
  rechazar(id: string, cuerpo: unknown): Promise<void>;
  marcarLista(id: string): Promise<void>;
};

export function crearClienteUber(cfg: {
  entorno: "sandbox" | "produccion";
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  tokenCache?: { leer(): Promise<string | null>; guardar(token: string, venceAt: Date): Promise<void> };
}): ClienteUber {
  const f = cfg.fetchFn ?? fetch;
  const dom = DOMINIOS[cfg.entorno];
  let enMemoria: string | null = null;

  const obtenerToken = async (): Promise<string> => {
    if (enMemoria) return enMemoria;
    const cacheado = await cfg.tokenCache?.leer();
    if (cacheado) { enMemoria = cacheado; return cacheado; }
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret,
      grant_type: "client_credentials", scope: "eats.store eats.order eats.store.status.write" });
    const r = await f(`${dom.auth}/oauth/v2/token`, { method: "POST", body });
    if (!r.ok) throw new Error(`UBER_TOKEN_${r.status}`);
    const j = obj(await r.json());
    const token = str(j.access_token);
    if (!token) throw new Error("UBER_TOKEN_SIN_ACCESS_TOKEN");
    // 30 días según Uber; se renueva un día antes para no operar con un token a punto de vencer.
    const vence = new Date(Date.now() + Math.max(60, num(j.expires_in) - 86_400) * 1000);
    await cfg.tokenCache?.guardar(token, vence);
    enMemoria = token;
    return token;
  };

  const llamar = async (metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<Response> => {
    const token = await obtenerToken();
    const r = await f(`${dom.api}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    if (r.status === 409) throw new Error(`YA_PROCESADA:${ruta}`);
    if (!r.ok) throw new Error(`UBER_HTTP_${r.status}:${ruta}:${(await r.text()).slice(0, 300)}`);
    return r;
  };

  return {
    obtenerToken,
    obtenerOrden: async (id) => (await llamar("GET", `/v1/delivery/order/${encodeURIComponent(id)}?expand=carts,deliveries,payment`)).json(),
    aceptar: async (id, readyTime, folio) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/accept`, { ready_for_pickup_time: readyTime, external_reference_id: folio }); },
    rechazar: async (id, cuerpo) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/deny`, cuerpo); },
    marcarLista: async (id) => { await llamar("POST", `/v1/delivery/order/${encodeURIComponent(id)}/ready`, {}); },
  };
}
```

- [ ] **Step 7: Correr los tests → PASS. Commit**

Run: `pnpm test:functions`
Expected: todos los tests de `pac` y `delivery` en verde.

```bash
git add supabase/functions/_shared/delivery/uber.ts supabase/functions/_shared/delivery/uber.test.ts
git commit -m "functions: adaptador Uber Eats (e5, normalizacion del pedido, motivos, cliente HTTP con fetch inyectable)"
```

---

## Task 5: Edge Function `delivery-webhook-uber`

**Files:**
- Create: `supabase/functions/delivery-webhook-uber/index.ts`
- Create: `supabase/functions/_shared/delivery/procesar-uber.ts` (lógica de procesamiento separada del handler, con cliente Supabase y cliente Uber inyectados)
- Create: `supabase/functions/_shared/delivery/procesar-uber.test.ts`
- Modify: `supabase/config.toml` (añadir `[functions.delivery-webhook-uber] verify_jwt = false`)
- Modify: `supabase/functions/README.md` (sección de prueba local)

**Interfaces:**
- Consumes: `hmacSha256Hex`, `igualesEnTiempoConstante`, `normalizarPedidoUber`, `crearClienteUber`, `segundosAReadyTime`; RPCs `crear_ticket_desde_app`, `delivery_pedido_transicion`; tablas de 0090.
- Produces: `procesarNotificacionUber(deps, evento) → Promise<ResultadoProceso>` donde `deps = { db: SupabaseClient(service_role), uber: ClienteUber, ahora: () => Date }` y `ResultadoProceso = { pedido_id: string; accion: "ACEPTADO_AUTO" | "PENDIENTE_CAJERO" | "DUPLICADO" | "SIN_CONEXION" | "ERROR"; detalle?: string }`.

Secrets que necesita (`supabase secrets set` o `supabase/functions/.env` local): `UBER_ENTORNO=sandbox|produccion`, `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`.

- [ ] **Step 1: Test del procesamiento con un cliente Supabase falso (falla: no existe el módulo)**

```ts
// supabase/functions/_shared/delivery/procesar-uber.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { procesarNotificacionUber, type DepsProceso } from "./procesar-uber.ts";

const PROD = "11111111-1111-4111-8111-111111111111";
const ORDEN = { order: { id: "ord-1", display_id: "2A003", state: "OFFERED", status: "ACTIVE", fulfillment_type: "DELIVERY_BY_UBER",
  store: { id: "store-1" }, customers: [], deliveries: [],
  carts: [{ id: "c", items: [{ id: PROD, cart_item_id: "ci1", title: "Hamburguesa", quantity: { amount: 1 }, selected_modifier_groups: [] }] }],
  payment: { payment_detail: { order_total: { gross: { amount_e5: 15000000 } }, item_charges: { total: { gross: { amount_e5: 15000000 } },
    price_breakdown: [{ cart_item_id: "ci1", price_type: "ITEM", quantity: { amount: 1 }, unit: { gross: { amount_e5: 15000000 } } }] } } } } };

/** BD de mentira: tablas en memoria y RPCs contadas. */
function dbFalsa(opts: { conexion: Record<string, unknown> | null; turnoAbierto: boolean; productos: string[] }) {
  const pedidos: Record<string, unknown>[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];
  const tabla = (nombre: string) => ({
    select: () => ({
      eq: (col: string, val: unknown) => ({
        eq: (col2: string, val2: unknown) => ({
          maybeSingle: async () => ({ data: nombre === "delivery_conexiones" && opts.conexion && opts.conexion.tienda_id_externo === val ? opts.conexion : null, error: null }),
          limit: async () => ({ data: nombre === "turnos" && opts.turnoAbierto ? [{ id: "t1" }] : [], error: null }),
        }),
        in: () => ({ data: nombre === "productos" ? opts.productos.filter((p) => true).map((id) => ({ id })) : [], error: null }),
        maybeSingle: async () => ({ data: pedidos.find((p) => p.id_externo === val) ?? null, error: null }),
      }),
    }),
    insert: (fila: Record<string, unknown>) => ({
      select: () => ({ single: async () => { const f = { id: `ped-${pedidos.length + 1}`, ...fila }; pedidos.push(f); return { data: f, error: null }; } }),
    }),
    update: (cambios: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => { const p = pedidos.find((x) => x.id === id); if (p) Object.assign(p, cambios); return { error: null }; } }),
  });
  return {
    db: { from: tabla, rpc: async (fn: string, args: unknown) => { rpcs.push({ fn, args }); return { data: "ticket-1", error: null }; } },
    pedidos, rpcs,
  };
}

const evento = { event_id: "ev-1", event_type: "orders.notification", event_time: 1, meta: { user_id: "store-1", resource_id: "ord-1", status: "pos" },
  resource_href: "https://test-api.uber.com/v1/delivery/order/ord-1" };

test("con conexión activa, auto_aceptar y turno abierto: crea el pedido, el ticket y acepta en Uber", async () => {
  const falsa = dbFalsa({ conexion: { id: "cx", tenant_id: "T", sucursal_id: "S", estado: "ACTIVA", tienda_id_externo: "store-1", auto_aceptar: true, tiempo_prep_min: 12, config: {} }, turnoAbierto: true, productos: [PROD] });
  const aceptadas: string[] = [];
  const deps = { db: falsa.db, ahora: () => new Date("2026-09-02T10:00:00Z"),
    uber: { obtenerToken: async () => "t", obtenerOrden: async () => ORDEN, aceptar: async (id: string) => { aceptadas.push(id); }, rechazar: async () => {}, marcarLista: async () => {} } } as unknown as DepsProceso;
  const r = await procesarNotificacionUber(deps, evento);
  assert.equal(r.accion, "ACEPTADO_AUTO");
  assert.deepEqual(aceptadas, ["ord-1"]);
  assert.equal(falsa.rpcs[0].fn, "crear_ticket_desde_app");
  assert.equal(falsa.pedidos[0].estado, "RECIBIDO");
  assert.equal(falsa.pedidos[0].vence_aceptacion, "2026-09-02T10:11:00.000Z");
});

test("sin turno abierto: el pedido queda RECIBIDO para el cajero y NO se acepta en Uber", async () => {
  const falsa = dbFalsa({ conexion: { id: "cx", tenant_id: "T", sucursal_id: "S", estado: "ACTIVA", tienda_id_externo: "store-1", auto_aceptar: true, tiempo_prep_min: 12, config: {} }, turnoAbierto: false, productos: [PROD] });
  let acepto = false;
  const deps = { db: falsa.db, ahora: () => new Date(), uber: { obtenerToken: async () => "t", obtenerOrden: async () => ORDEN, aceptar: async () => { acepto = true; }, rechazar: async () => {}, marcarLista: async () => {} } } as unknown as DepsProceso;
  const r = await procesarNotificacionUber(deps, evento);
  assert.equal(r.accion, "PENDIENTE_CAJERO");
  assert.equal(acepto, false);
  assert.equal(falsa.rpcs.length, 0);
});

test("tienda desconocida: SIN_CONEXION y no se llama a Uber", async () => {
  const falsa = dbFalsa({ conexion: null, turnoAbierto: true, productos: [] });
  let llamo = false;
  const deps = { db: falsa.db, ahora: () => new Date(), uber: { obtenerToken: async () => "t", obtenerOrden: async () => { llamo = true; return ORDEN; }, aceptar: async () => {}, rechazar: async () => {}, marcarLista: async () => {} } } as unknown as DepsProceso;
  const r = await procesarNotificacionUber(deps, evento);
  assert.equal(r.accion, "SIN_CONEXION");
  assert.equal(llamo, false);
});
```

- [ ] **Step 2: Correr → FAIL. Implementar `procesar-uber.ts`**

```ts
// supabase/functions/_shared/delivery/procesar-uber.ts
// Qué hacer con un webhook de Uber ya autenticado. Separado del handler HTTP para probarlo con una
// BD de mentira. Regla: primero persistir (idempotente por id_externo), luego decidir.
import type { ClienteUber } from "./uber.ts";
import { normalizarPedidoUber, segundosAReadyTime } from "./uber.ts";
import type { PedidoNormalizado } from "./tipos.ts";

type Dict = Record<string, unknown>;
// Subconjunto de supabase-js que usamos; permite el doble de pruebas sin arrastrar el cliente real.
export type DbMinima = {
  from(tabla: string): {
    select(cols?: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): { maybeSingle(): Promise<{ data: unknown; error: unknown }>; limit(n: number): Promise<{ data: unknown; error: unknown }> };
        in(col: string, vals: unknown[]): Promise<{ data: unknown; error: unknown }> | { data: unknown; error: unknown };
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
    insert(fila: Dict): { select(cols?: string): { single(): Promise<{ data: unknown; error: unknown }> } };
    update(cambios: Dict): { eq(col: string, val: unknown): Promise<{ error: unknown }> };
  };
  rpc(fn: string, args: Dict): Promise<{ data: unknown; error: unknown }>;
};
export type DepsProceso = { db: DbMinima; uber: ClienteUber; ahora: () => Date };
export type ResultadoProceso = { pedido_id: string | null; accion: "ACEPTADO_AUTO" | "PENDIENTE_CAJERO" | "DUPLICADO" | "SIN_CONEXION" | "ERROR"; detalle?: string };

const VENTANA_UBER_MIN = 11; // 11.5 según Uber; 30 s de margen

const obj = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const errMsg = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));

function filaPedido(p: PedidoNormalizado, cx: Dict, recibidoAt: Date, payloadRaw: unknown): Dict {
  return {
    tenant_id: cx.tenant_id, sucursal_id: cx.sucursal_id, conexion_id: cx.id, app: "APP_UBEREATS",
    id_externo: p.id_externo, folio_corto: p.folio_corto, estado: "RECIBIDO", estado_app: p.estado_app,
    tipo_entrega: p.tipo_entrega, programado_para: p.programado_para,
    vence_aceptacion: new Date(recibidoAt.getTime() + VENTANA_UBER_MIN * 60_000).toISOString(),
    cliente_nombre: p.cliente_nombre, cliente_telefono: p.cliente_telefono, cliente_telefono_pin: p.cliente_telefono_pin,
    direccion_texto: p.direccion_texto, nota_cliente: p.nota_cliente,
    items: p.items, items_sin_mapear: p.items_sin_mapear.length ? p.items_sin_mapear : null,
    subtotal_mxn: p.subtotal_mxn, descuento_app_mxn: p.descuento_app_mxn, descuento_tienda_mxn: p.descuento_tienda_mxn,
    envio_mxn: p.envio_mxn, propina_mxn: p.propina_mxn, total_cliente_mxn: p.total_cliente_mxn,
    total_restaurante_mxn: p.total_restaurante_mxn, efectivo_a_cobrar_mxn: p.efectivo_a_cobrar_mxn,
    payload_raw: payloadRaw, recibido_at: recibidoAt.toISOString(),
  };
}

export async function procesarNotificacionUber(deps: DepsProceso, evento: unknown): Promise<ResultadoProceso> {
  const ev = obj(evento);
  const meta = obj(ev.meta);
  const storeId = typeof meta.user_id === "string" ? meta.user_id : "";
  const orderId = typeof meta.resource_id === "string" ? meta.resource_id : "";
  if (!storeId || !orderId) return { pedido_id: null, accion: "ERROR", detalle: "evento sin meta.user_id/resource_id" };

  // 1) ¿A qué sucursal pertenece la tienda?
  const { data: cxData } = await deps.db.from("delivery_conexiones").select("*").eq("app", "APP_UBEREATS").eq("tienda_id_externo", storeId).maybeSingle();
  const cx = obj(cxData);
  if (!cx.id) return { pedido_id: null, accion: "SIN_CONEXION", detalle: `store ${storeId}` };

  // 2) ¿Ya lo teníamos? (reintentos de Uber, eventos fuera de orden)
  const { data: existente } = await deps.db.from("delivery_pedidos").select("id, estado").eq("id_externo", orderId).maybeSingle();
  if (obj(existente).id) return { pedido_id: String(obj(existente).id), accion: "DUPLICADO" };

  // 3) Traer la orden completa y normalizar contra el catálogo del tenant.
  let orden: unknown;
  try { orden = await deps.uber.obtenerOrden(orderId); }
  catch (e) { return { pedido_id: null, accion: "ERROR", detalle: `obtenerOrden: ${errMsg(e)}` }; }
  const idsCandidatos = new Set<string>();
  for (const cart of (obj(obj(orden).order).carts as unknown[] | undefined) ?? []) {
    for (const it of (obj(cart).items as unknown[] | undefined) ?? []) {
      if (typeof obj(it).id === "string") idsCandidatos.add(String(obj(it).id));
      for (const g of (obj(it).selected_modifier_groups as unknown[] | undefined) ?? [])
        for (const s of (obj(g).selected_items as unknown[] | undefined) ?? []) if (typeof obj(s).id === "string") idsCandidatos.add(String(obj(s).id));
    }
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuids = [...idsCandidatos].filter((id) => uuidRe.test(id));
  const conocidos = new Set<string>();
  if (uuids.length) {
    const r1 = await deps.db.from("productos").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of (obj(r1).data as unknown[] | undefined) ?? []) conocidos.add(String(obj(f).id));
    const r2 = await deps.db.from("opciones_modificador").select("id").eq("tenant_id", cx.tenant_id).in("id", uuids);
    for (const f of (obj(r2).data as unknown[] | undefined) ?? []) conocidos.add(String(obj(f).id));
  }
  const pedido = normalizarPedidoUber(orden, (id) => conocidos.has(id));

  // 4) Persistir el pedido (RECIBIDO) antes de cualquier decisión.
  const ahora = deps.ahora();
  const { data: insertado, error: errIns } = await deps.db.from("delivery_pedidos").insert(filaPedido(pedido, cx, ahora, orden)).select("id").single();
  if (errIns || !obj(insertado).id) return { pedido_id: null, accion: "ERROR", detalle: `insert pedido: ${errMsg(errIns)}` };
  const pedidoId = String(obj(insertado).id);

  // 5) ¿Auto-aceptar? Solo con turno abierto en la sucursal; si no, que decida el cajero.
  const { data: turnos } = await deps.db.from("turnos").select("id").eq("sucursal_id", cx.sucursal_id).eq("estado", "ABIERTO").limit(1);
  const hayTurno = Array.isArray(turnos) && turnos.length > 0;
  const generico = typeof obj(cx.config).producto_generico_id === "string";
  const puedeCrear = pedido.items_sin_mapear.length === 0 || generico;
  if (cx.auto_aceptar !== true || !hayTurno || !puedeCrear) return { pedido_id: pedidoId, accion: "PENDIENTE_CAJERO" };

  const { error: errRpc } = await deps.db.rpc("crear_ticket_desde_app", { p_pedido_id: pedidoId });
  if (errRpc) {
    await deps.db.rpc("delivery_pedido_transicion", { p_pedido_id: pedidoId, p_estado: "ERROR", p_detalle: errMsg(errRpc) });
    return { pedido_id: pedidoId, accion: "ERROR", detalle: `crear_ticket_desde_app: ${errMsg(errRpc)}` };
  }
  try {
    await deps.uber.aceptar(orderId, segundosAReadyTime(ahora, Number(cx.tiempo_prep_min) || 15), pedido.folio_corto ?? pedidoId);
  } catch (e) {
    if (!errMsg(e).startsWith("YA_PROCESADA")) {
      await deps.db.rpc("delivery_pedido_transicion", { p_pedido_id: pedidoId, p_estado: "ERROR", p_detalle: `aceptar en Uber: ${errMsg(e)}` });
      return { pedido_id: pedidoId, accion: "ERROR", detalle: errMsg(e) };
    }
  }
  return { pedido_id: pedidoId, accion: "ACEPTADO_AUTO" };
}
```

- [ ] **Step 3: Correr → PASS los 3 tests. Commit**

```bash
git add supabase/functions/_shared/delivery/procesar-uber.ts supabase/functions/_shared/delivery/procesar-uber.test.ts
git commit -m "functions: procesamiento de la notificacion de Uber (persistir, normalizar, auto-aceptar)"
```

- [ ] **Step 4: Escribir el handler HTTP**

```ts
// supabase/functions/delivery-webhook-uber/index.ts
// Webhook público de Uber Eats (ADR 0011). Sin JWT: la autenticidad la da X-Uber-Signature
// (HMAC-SHA256 del cuerpo con el client secret). Responde 200 rápido; el trabajo pesado va después
// con EdgeRuntime.waitUntil para no pasarnos del tiempo de Uber y evitar reintentos duplicados.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hmacSha256Hex, igualesEnTiempoConstante } from "../_shared/delivery/firma.ts";
import { crearClienteUber } from "../_shared/delivery/uber.ts";
import { procesarNotificacionUber, type DbMinima } from "../_shared/delivery/procesar-uber.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const CLIENT_ID = Deno.env.get("UBER_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("UBER_CLIENT_SECRET") ?? "";
const MAX_BODY = 256 * 1024;

const uber = crearClienteUber({
  entorno: ENTORNO, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET,
  tokenCache: {
    leer: async () => {
      const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at").eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
      const f = data as { access_token: string; vence_at: string } | null;
      return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
    },
    guardar: async (token, venceAt) => {
      await admin.from("delivery_credenciales_app").upsert({ app: "APP_UBEREATS", entorno: ENTORNO, access_token: token, vence_at: venceAt.toISOString(), updated_at: new Date().toISOString() });
    },
  },
});

type EventoUber = { event_id?: string; event_type?: string; meta?: { user_id?: string; resource_id?: string } };

async function registrarEvento(ev: EventoUber, cuerpo: unknown, firmaValida: boolean, extra: Record<string, unknown> = {}): Promise<number | null> {
  const { data } = await admin.from("delivery_eventos").insert({
    app: "APP_UBEREATS", direccion: "ENTRADA", tipo: ev.event_type ?? "desconocido",
    id_externo: ev.meta?.resource_id ?? null, evento_id_externo: ev.event_id ?? null,
    firma_valida: firmaValida, payload: cuerpo, ...extra,
  }).select("id").single();
  return (data as { id: number } | null)?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!CLIENT_SECRET) return new Response("webhook no configurado", { status: 503 });

  const cuerpoTexto = await req.text();
  if (cuerpoTexto.length > MAX_BODY) return new Response("payload too large", { status: 413 });

  const firmaRecibida = (req.headers.get("x-uber-signature") ?? "").trim().toLowerCase();
  const firmaEsperada = await hmacSha256Hex(CLIENT_SECRET, cuerpoTexto);
  const firmaValida = firmaRecibida !== "" && igualesEnTiempoConstante(firmaRecibida, firmaEsperada);

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(cuerpoTexto); } catch { return new Response("bad json", { status: 400 }); }
  const ev = (cuerpo ?? {}) as EventoUber;

  if (!firmaValida) {
    await registrarEvento(ev, cuerpo, false, { error: "firma inválida" });
    return new Response("invalid signature", { status: 401 });
  }

  // Idempotencia por event_id: el índice único devuelve error 23505 y contestamos 200 sin reprocesar.
  const { error: errEv } = await admin.from("delivery_eventos").insert({
    app: "APP_UBEREATS", direccion: "ENTRADA", tipo: ev.event_type ?? "desconocido",
    id_externo: ev.meta?.resource_id ?? null, evento_id_externo: ev.event_id ?? null, firma_valida: true, payload: cuerpo,
  });
  if (errEv && String((errEv as { code?: string }).code) === "23505") return new Response("", { status: 200 });

  const trabajo = (async () => {
    try {
      let detalle: Record<string, unknown> = {};
      switch (ev.event_type) {
        case "orders.notification":
        case "orders.scheduled.notification": {
          const r = await procesarNotificacionUber({ db: admin as unknown as DbMinima, uber, ahora: () => new Date() }, cuerpo);
          detalle = { procesado: true, respuesta: r, error: r.accion === "ERROR" ? r.detalle ?? null : null };
          // Enrutar el evento a su tenant para que el admin lo vea (RLS).
          if (r.pedido_id) {
            const { data: p } = await admin.from("delivery_pedidos").select("tenant_id, conexion_id").eq("id", r.pedido_id).maybeSingle();
            if (p) detalle = { ...detalle, tenant_id: (p as { tenant_id: string }).tenant_id, conexion_id: (p as { conexion_id: string }).conexion_id };
          }
          break;
        }
        case "orders.failure":
        case "orders.cancel": {
          const orderId = ev.meta?.resource_id ?? "";
          const { data: p } = await admin.from("delivery_pedidos").select("id, tenant_id, estado").eq("app", "APP_UBEREATS").eq("id_externo", orderId).maybeSingle();
          if (p) {
            await admin.rpc("delivery_pedido_transicion", { p_pedido_id: (p as { id: string }).id, p_estado: "CANCELADO", p_detalle: `Cancelado por Uber (${ev.event_type})` });
            detalle = { procesado: true, tenant_id: (p as { tenant_id: string }).tenant_id };
          } else detalle = { procesado: true, error: "pedido desconocido" };
          break;
        }
        default:
          detalle = { procesado: true, respuesta: { ignorado: true } };
      }
      if (ev.event_id) await admin.from("delivery_eventos").update(detalle).eq("app", "APP_UBEREATS").eq("evento_id_externo", ev.event_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (ev.event_id) await admin.from("delivery_eventos").update({ error: msg }).eq("app", "APP_UBEREATS").eq("evento_id_externo", ev.event_id);
    }
  })();
  // @ts-ignore EdgeRuntime existe en Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trabajo); else await trabajo;

  return new Response("", { status: 200 });
});
```

- [ ] **Step 5: `config.toml` y README**

Añadir en `supabase/config.toml` (junto a las otras funciones sin JWT):

```toml
[functions.delivery-webhook-uber]
verify_jwt = false
```

Añadir al final de `supabase/functions/README.md`:

````markdown
## `delivery-webhook-uber` (ADR 0011)

Recibe los webhooks de Uber Eats. Sin JWT; valida `X-Uber-Signature`. Secrets: `UBER_ENTORNO`,
`UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`.

Prueba local (stack arriba, `supabase db reset`, una `delivery_conexion` ACTIVA con
`tienda_id_externo = 'store-1'` para la sucursal de Knock-Out y un turno abierto):

```powershell
supabase functions serve delivery-webhook-uber --env-file supabase/functions/.env --no-verify-jwt
$body = '{"event_id":"ev-1","event_type":"orders.notification","event_time":1,"meta":{"user_id":"store-1","resource_id":"ord-1","status":"pos"},"resource_href":"x"}'
$sig = (node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$env:UBER_CLIENT_SECRET" $body)
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/functions/v1/delivery-webhook-uber" -Headers @{ "X-Uber-Signature" = $sig } -ContentType "application/json" -Body $body
```

Esperado: 200 vacío; una fila en `delivery_eventos` con `firma_valida = true`; con el sandbox real
de Uber, una fila en `delivery_pedidos` y (si hay turno) un ticket PAGADO. Firma incorrecta → 401 y
fila con `firma_valida = false`.
````

- [ ] **Step 6: Verificar tipos de Deno y commit**

Run: `deno check supabase/functions/delivery-webhook-uber/index.ts` (si `deno` está instalado; si no, `supabase functions serve` compila al arrancar y reporta errores).
Expected: sin errores.

```bash
git add supabase/functions/delivery-webhook-uber/index.ts supabase/config.toml supabase/functions/README.md
git commit -m "functions: webhook publico de Uber Eats con firma HMAC, bitacora e idempotencia"
```

---

## Task 6: Edge Function `delivery-accion` (acciones del cajero)

**Files:**
- Create: `supabase/functions/delivery-accion/index.ts`

**Interfaces:**
- Consumes: JWT del empleado (patrón `enviar-push`: `admin.auth.getUser(token)` → `usuarios_acceso.tenant_id`); RPCs `crear_ticket_desde_app`, `delivery_pedido_transicion`; `ClienteUber`; `motivoRechazoUber`.
- Produces: `POST /functions/v1/delivery-accion` con `{ pedido_id, accion: "aceptar" | "rechazar" | "listo", motivo?: "AGOTADO"|"CERRADO"|"SATURADO"|"OTRO", detalle?: string, tiempo_prep_min?: number }` → `{ ok: true, ticket_id?: string }` o `{ error: "SIN_TURNO_ABIERTO" | "PEDIDO_NO_EXISTE" | "ACCION_INVALIDA" | "YA_PROCESADA" | … }`.

- [ ] **Step 1: Escribir la función**

```ts
// supabase/functions/delivery-accion/index.ts
// Acciones del cajero sobre un pedido de app (ADR 0011). El POS nunca habla con Uber: manda la
// acción aquí con su JWT de empleado; se valida que el pedido sea de SU tenant y se llama a la app.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteUber, motivoRechazoUber, segundosAReadyTime, type MotivoRechazo } from "../_shared/delivery/uber.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ENTORNO = (Deno.env.get("UBER_ENTORNO") ?? "sandbox") === "produccion" ? "produccion" : "sandbox";
const uber = crearClienteUber({
  entorno: ENTORNO, clientId: Deno.env.get("UBER_CLIENT_ID") ?? "", clientSecret: Deno.env.get("UBER_CLIENT_SECRET") ?? "",
  tokenCache: {
    leer: async () => {
      const { data } = await admin.from("delivery_credenciales_app").select("access_token, vence_at").eq("app", "APP_UBEREATS").eq("entorno", ENTORNO).maybeSingle();
      const f = data as { access_token: string; vence_at: string } | null;
      return f && new Date(f.vence_at) > new Date() ? f.access_token : null;
    },
    guardar: async (token, venceAt) => { await admin.from("delivery_credenciales_app").upsert({ app: "APP_UBEREATS", entorno: ENTORNO, access_token: token, vence_at: venceAt.toISOString(), updated_at: new Date().toISOString() }); },
  },
});

type Cuerpo = { pedido_id?: string; accion?: string; motivo?: string; detalle?: string; tiempo_prep_min?: number };
const MOTIVOS: MotivoRechazo[] = ["AGOTADO", "CERRADO", "SATURADO", "POS_OFFLINE", "OTRO"];

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id").eq("usuario_id", userResp.user.id).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = (acceso as { tenant_id: string }).tenant_id;

  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.pedido_id || !body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);

  const { data: pData } = await admin.from("delivery_pedidos").select("id, tenant_id, app, id_externo, estado, folio_corto, conexion_id").eq("id", body.pedido_id).maybeSingle();
  const pedido = pData as { id: string; tenant_id: string; app: string; id_externo: string; estado: string; folio_corto: string | null; conexion_id: string } | null;
  if (!pedido || pedido.tenant_id !== tenantId) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
  if (pedido.app !== "APP_UBEREATS") return json({ error: "APP_NO_SOPORTADA" }, 400);

  const registrarSalida = async (tipo: string, ok: boolean, detalle: unknown) => {
    await admin.from("delivery_eventos").insert({ tenant_id: tenantId, conexion_id: pedido.conexion_id, app: pedido.app, direccion: "SALIDA", tipo, id_externo: pedido.id_externo, procesado: ok, respuesta: ok ? detalle : null, error: ok ? null : String(detalle), http_status: ok ? 200 : null });
  };

  try {
    switch (body.accion) {
      case "aceptar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const { data: cx } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", pedido.conexion_id).maybeSingle();
        const minutos = Number(body.tiempo_prep_min) || Number((cx as { tiempo_prep_min?: number } | null)?.tiempo_prep_min) || 15;
        const { data: ticketId, error: errRpc } = await admin.rpc("crear_ticket_desde_app", { p_pedido_id: pedido.id });
        if (errRpc) {
          const msg = errRpc.message ?? String(errRpc);
          const codigo = msg.includes("SIN_TURNO_ABIERTO") ? "SIN_TURNO_ABIERTO" : msg.includes("ITEM_SIN_MAPEAR") ? "ITEM_SIN_MAPEAR" : "RPC_ERROR";
          return json({ error: codigo, detalle: msg }, 409);
        }
        try { await uber.aceptar(pedido.id_externo, segundosAReadyTime(new Date(), minutos), pedido.folio_corto ?? pedido.id); await registrarSalida("accept", true, { minutos }); }
        catch (e) { const m = e instanceof Error ? e.message : String(e); await registrarSalida("accept", false, m); if (!m.startsWith("YA_PROCESADA")) return json({ error: "UBER_ERROR", detalle: m }, 502); }
        return json({ ok: true, ticket_id: ticketId });
      }
      case "rechazar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const motivo = MOTIVOS.includes(body.motivo as MotivoRechazo) ? (body.motivo as MotivoRechazo) : "OTRO";
        try { await uber.rechazar(pedido.id_externo, motivoRechazoUber(motivo, body.detalle)); await registrarSalida("deny", true, { motivo }); }
        catch (e) { const m = e instanceof Error ? e.message : String(e); await registrarSalida("deny", false, m); if (!m.startsWith("YA_PROCESADA")) return json({ error: "UBER_ERROR", detalle: m }, 502); }
        await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "RECHAZADO", p_detalle: `${motivo}${body.detalle ? ": " + body.detalle : ""}` });
        return json({ ok: true });
      }
      case "listo": {
        if (!["ACEPTADO", "EN_PREPARACION"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        try { await uber.marcarLista(pedido.id_externo); await registrarSalida("ready", true, {}); }
        catch (e) { const m = e instanceof Error ? e.message : String(e); await registrarSalida("ready", false, m); return json({ error: "UBER_ERROR", detalle: m }, 502); }
        await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "LISTO", p_detalle: null });
        return json({ ok: true });
      }
      default:
        return json({ error: "ACCION_INVALIDA" }, 400);
    }
  } catch (e) {
    return json({ error: "INTERNO", detalle: e instanceof Error ? e.message : String(e) }, 500);
  }
});
```

- [ ] **Step 2: Compilar y commit**

Run: `deno check supabase/functions/delivery-accion/index.ts` (o `supabase functions serve delivery-accion`).

```bash
git add supabase/functions/delivery-accion/index.ts
git commit -m "functions: delivery-accion (aceptar / rechazar / listo) con JWT del tenant"
```

---

## Task 7: POS — `lib/pedidos-apps.ts` con helpers puros + vitest

**Files:**
- Create: `apps/pos/app/lib/pedidos-apps.ts`
- Create: `apps/pos/app/lib/__tests__/pedidos-apps.test.ts`

**Interfaces (Produces):**

```ts
export type PedidoAppEstado = "RECIBIDO" | "ACEPTADO" | "RECHAZADO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO" | "EXPIRADO" | "ERROR";
export type PedidoApp = { id: string; app: "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI"; idExterno: string; folioCorto: string | null; estado: PedidoAppEstado;
  tipoEntrega: string | null; clienteNombre: string | null; notaCliente: string | null; items: { nombreApp: string; cantidad: number; precioUnitario: number; nota: string | null; mapeado: boolean; modificadores: { nombreApp: string; cantidad: number }[] }[];
  totalCliente: number | null; venceAceptacion: string | null; recibidoAt: string; ticketId: string | null; ticketFolio: string | null; ultimoError: string | null };
export async function leerPedidosApps(token: string, sucursalId: string): Promise<PedidoApp[]>;   // activos + cancelados de los últimos 30 min
export async function accionPedidoApp(token: string, args: { pedidoId: string; accion: "aceptar" | "rechazar" | "listo"; motivo?: string; detalle?: string; tiempoPrepMin?: number }): Promise<{ ok: true; ticketId?: string } | { ok: false; error: string; detalle?: string }>;
export function segundosRestantes(venceAceptacion: string | null, ahora: Date): number | null;
export function etiquetaApp(app: PedidoApp["app"]): string;             // "Uber Eats" | "DiDi Food" | "Rappi"
export function etiquetaEstado(estado: PedidoAppEstado): string;
export function ordenarPedidos(pedidos: PedidoApp[]): PedidoApp[];       // pendientes primero (menos tiempo restante arriba), luego aceptados/listos, luego cerrados
export function idsNuevos(antes: PedidoApp[], ahora: PedidoApp[]): string[]; // para el sonido
```

- [ ] **Step 1: Test de los helpers puros (falla)**

```ts
// apps/pos/app/lib/__tests__/pedidos-apps.test.ts
import { describe, it, expect } from "vitest";
import { segundosRestantes, etiquetaApp, etiquetaEstado, ordenarPedidos, idsNuevos, type PedidoApp } from "../pedidos-apps";

const base = (extra: Partial<PedidoApp>): PedidoApp => ({
  id: "x", app: "APP_UBEREATS", idExterno: "e", folioCorto: null, estado: "RECIBIDO", tipoEntrega: null, clienteNombre: null,
  notaCliente: null, items: [], totalCliente: null, venceAceptacion: null, recibidoAt: "2026-09-02T10:00:00Z", ticketId: null, ticketFolio: null, ultimoError: null, ...extra,
});

describe("pedidos de apps · helpers", () => {
  it("segundosRestantes cuenta hacia la ventana y nunca baja de 0", () => {
    const ahora = new Date("2026-09-02T10:00:00Z");
    expect(segundosRestantes("2026-09-02T10:11:00Z", ahora)).toBe(660);
    expect(segundosRestantes("2026-09-02T09:59:00Z", ahora)).toBe(0);
    expect(segundosRestantes(null, ahora)).toBeNull();
  });

  it("etiquetas en español", () => {
    expect(etiquetaApp("APP_UBEREATS")).toBe("Uber Eats");
    expect(etiquetaApp("APP_DIDI")).toBe("DiDi Food");
    expect(etiquetaApp("APP_RAPPI")).toBe("Rappi");
    expect(etiquetaEstado("RECIBIDO")).toBe("Por aceptar");
    expect(etiquetaEstado("ACEPTADO")).toBe("En preparación");
    expect(etiquetaEstado("LISTO")).toBe("Listo");
    expect(etiquetaEstado("EXPIRADO")).toBe("Expirado");
  });

  it("ordenarPedidos: pendientes con menos tiempo primero, luego aceptados, luego cerrados", () => {
    const p = [
      base({ id: "a", estado: "LISTO" }),
      base({ id: "b", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:11:00Z" }),
      base({ id: "c", estado: "RECIBIDO", venceAceptacion: "2026-09-02T10:05:00Z" }),
      base({ id: "d", estado: "ACEPTADO" }),
      base({ id: "e", estado: "CANCELADO" }),
    ];
    expect(ordenarPedidos(p).map((x) => x.id)).toEqual(["c", "b", "d", "a", "e"]);
  });

  it("idsNuevos detecta pedidos que no estaban", () => {
    expect(idsNuevos([base({ id: "a" })], [base({ id: "a" }), base({ id: "b" })])).toEqual(["b"]);
    expect(idsNuevos([], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
// apps/pos/app/lib/pedidos-apps.ts
"use client";
// Pedidos que llegan de las apps de delivery (ADR 0011). Lectura bajo RLS (delivery_pedidos) y
// acciones vía la edge function delivery-accion: el POS nunca habla con Uber/DiDi/Rappi.
import { employeeClient } from "./supabase";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type PedidoAppEstado = "RECIBIDO" | "ACEPTADO" | "RECHAZADO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "CANCELADO" | "EXPIRADO" | "ERROR";
export type AppPedido = "APP_UBEREATS" | "APP_DIDI" | "APP_RAPPI";

export type PedidoAppItem = {
  nombreApp: string; cantidad: number; precioUnitario: number; nota: string | null; mapeado: boolean;
  modificadores: { nombreApp: string; cantidad: number }[];
};
export type PedidoApp = {
  id: string; app: AppPedido; idExterno: string; folioCorto: string | null; estado: PedidoAppEstado;
  tipoEntrega: string | null; clienteNombre: string | null; notaCliente: string | null; items: PedidoAppItem[];
  totalCliente: number | null; venceAceptacion: string | null; recibidoAt: string; ticketId: string | null;
  ticketFolio: string | null; ultimoError: string | null;
};

const ACTIVOS: PedidoAppEstado[] = ["RECIBIDO", "ACEPTADO", "EN_PREPARACION", "LISTO", "ERROR"];

/** Activos de la sucursal + los cerrados de la última media hora (para que el cajero vea qué pasó). */
export async function leerPedidosApps(token: string, sucursalId: string): Promise<PedidoApp[]> {
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await employeeClient(token)
    .from("delivery_pedidos")
    .select("id, app, id_externo, folio_corto, estado, tipo_entrega, cliente_nombre, nota_cliente, items, total_cliente_mxn, vence_aceptacion, recibido_at, ticket_id, ultimo_error, ticket:tickets(folio_completo)")
    .eq("sucursal_id", sucursalId)
    .or(`estado.in.(${ACTIVOS.join(",")}),recibido_at.gte.${desde}`)
    .order("recibido_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    app: r.app as AppPedido,
    idExterno: String(r.id_externo),
    folioCorto: (r.folio_corto as string | null) ?? null,
    estado: r.estado as PedidoAppEstado,
    tipoEntrega: (r.tipo_entrega as string | null) ?? null,
    clienteNombre: (r.cliente_nombre as string | null) ?? null,
    notaCliente: (r.nota_cliente as string | null) ?? null,
    items: itemsDesdeJson(r.items),
    totalCliente: r.total_cliente_mxn == null ? null : Number(r.total_cliente_mxn),
    venceAceptacion: (r.vence_aceptacion as string | null) ?? null,
    recibidoAt: String(r.recibido_at),
    ticketId: (r.ticket_id as string | null) ?? null,
    ticketFolio: ((r.ticket as { folio_completo?: string } | null)?.folio_completo) ?? null,
    ultimoError: (r.ultimo_error as string | null) ?? null,
  }));
}

function itemsDesdeJson(v: unknown): PedidoAppItem[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const it = (x ?? {}) as Record<string, unknown>;
    const mods = Array.isArray(it.modificadores) ? (it.modificadores as Record<string, unknown>[]) : [];
    return {
      nombreApp: String(it.nombre_app ?? ""),
      cantidad: Number(it.cantidad ?? 1),
      precioUnitario: Number(it.precio_unitario_mxn ?? 0),
      nota: (it.nota as string | null) ?? null,
      mapeado: typeof it.producto_id === "string" && it.producto_id.length > 0,
      modificadores: mods.map((m) => ({ nombreApp: String(m.nombre_app ?? ""), cantidad: Number(m.cantidad ?? 1) })),
    };
  });
}

export async function accionPedidoApp(
  token: string,
  args: { pedidoId: string; accion: "aceptar" | "rechazar" | "listo"; motivo?: string; detalle?: string; tiempoPrepMin?: number },
): Promise<{ ok: true; ticketId?: string } | { ok: false; error: string; detalle?: string }> {
  try {
    const r = await fetch(`${URL}/functions/v1/delivery-accion`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pedido_id: args.pedidoId, accion: args.accion, motivo: args.motivo, detalle: args.detalle, tiempo_prep_min: args.tiempoPrepMin }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ticket_id?: string; error?: string; detalle?: string };
    if (r.ok && j.ok) return { ok: true, ticketId: j.ticket_id };
    return { ok: false, error: j.error ?? `HTTP_${r.status}`, detalle: j.detalle };
  } catch (e) {
    return { ok: false, error: "SIN_RED", detalle: e instanceof Error ? e.message : String(e) };
  }
}

export function segundosRestantes(venceAceptacion: string | null, ahora: Date): number | null {
  if (!venceAceptacion) return null;
  return Math.max(0, Math.round((new Date(venceAceptacion).getTime() - ahora.getTime()) / 1000));
}

export function etiquetaApp(app: AppPedido): string {
  return { APP_UBEREATS: "Uber Eats", APP_DIDI: "DiDi Food", APP_RAPPI: "Rappi" }[app];
}

const ETIQUETA_ESTADO: Record<PedidoAppEstado, string> = {
  RECIBIDO: "Por aceptar", ACEPTADO: "En preparación", EN_PREPARACION: "En preparación", LISTO: "Listo",
  ENTREGADO: "Entregado", RECHAZADO: "Rechazado", CANCELADO: "Cancelado por la app", EXPIRADO: "Expirado", ERROR: "Con error",
};
export function etiquetaEstado(estado: PedidoAppEstado): string { return ETIQUETA_ESTADO[estado] ?? estado; }

const PRIORIDAD: Record<PedidoAppEstado, number> = { RECIBIDO: 0, ERROR: 0, ACEPTADO: 1, EN_PREPARACION: 1, LISTO: 2, ENTREGADO: 3, RECHAZADO: 3, CANCELADO: 3, EXPIRADO: 3 };
export function ordenarPedidos(pedidos: PedidoApp[]): PedidoApp[] {
  return [...pedidos].sort((a, b) => {
    const pa = PRIORIDAD[a.estado], pb = PRIORIDAD[b.estado];
    if (pa !== pb) return pa - pb;
    if (pa === 0) return (a.venceAceptacion ?? "").localeCompare(b.venceAceptacion ?? "");
    return b.recibidoAt.localeCompare(a.recibidoAt);
  });
}

export function idsNuevos(antes: PedidoApp[], ahora: PedidoApp[]): string[] {
  const vistos = new Set(antes.map((p) => p.id));
  return ahora.filter((p) => !vistos.has(p.id)).map((p) => p.id);
}
```

- [ ] **Step 3: Correr → PASS. Typecheck. Commit**

Run: `pnpm --filter @vim/pos test -- pedidos-apps` y `pnpm --filter @vim/pos typecheck`

```bash
git add apps/pos/app/lib/pedidos-apps.ts apps/pos/app/lib/__tests__/pedidos-apps.test.ts
git commit -m "pos: lib de pedidos de apps (lectura RLS, acciones via delivery-accion, helpers puros)"
```

---

## Task 8: POS — pantalla "Pedidos de apps", acceso en inicio, sonido

**Files:**
- Create: `apps/pos/app/components/pantalla-pedidos-apps.tsx`
- Modify: `apps/pos/app/components/pantalla-inicio.tsx` (prop `nPedidosApps` + `onPedidosApps` + tile)
- Modify: `apps/pos/app/components/home-pos.tsx` (estado `viendoPedidosApps`, polling del badge cada 10 s junto a los demás badges de inicio, render de la pantalla, sonido al llegar uno nuevo)

**Interfaces:**
- Consumes: `leerPedidosApps`, `accionPedidoApp`, `segundosRestantes`, `etiquetaApp`, `etiquetaEstado`, `ordenarPedidos`, `idsNuevos`; props del mismo estilo que `PantallaDevoluciones` (`token`, `caja: DatosCaja`, `turno`, `empleado`, `onSalir`).
- Produces: `<PantallaPedidosApps token caja onSalir />`.

- [ ] **Step 1: Escribir la pantalla**

```tsx
// apps/pos/app/components/pantalla-pedidos-apps.tsx
"use client";
// Panel de pedidos que llegan de Uber Eats / DiDi / Rappi (ADR 0011). Polling cada 10 s como el
// resto del POS. Cada tarjeta muestra el canal, el folio corto, el cliente, los ítems y un
// contador hasta que la app cancele por falta de respuesta.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DatosCaja } from "../lib/turno";
import {
  accionPedidoApp, etiquetaApp, etiquetaEstado, idsNuevos, leerPedidosApps, ordenarPedidos, segundosRestantes,
  type PedidoApp,
} from "../lib/pedidos-apps";
import { BotonVolver } from "./boton-volver";

const REFRESCO_MS = 10_000;
const MOTIVOS: { codigo: "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO"; label: string }[] = [
  { codigo: "AGOTADO", label: "Producto agotado" },
  { codigo: "SATURADO", label: "Cocina saturada" },
  { codigo: "CERRADO", label: "Ya cerramos" },
  { codigo: "OTRO", label: "Otro motivo" },
];

function mmss(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

export function PantallaPedidosApps({ token, caja, onSalir, onNuevo }: {
  token: string; caja: DatosCaja; onSalir: () => void;
  /** Se llama con los ids nuevos en cada refresco (para el sonido del home). */
  onNuevo?: (ids: string[]) => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoApp[]>([]);
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<PedidoApp | null>(null);
  const previos = useRef<PedidoApp[]>([]);

  const recargar = useCallback(async () => {
    try {
      const lista = ordenarPedidos(await leerPedidosApps(token, caja.sucursal_id));
      const nuevos = idsNuevos(previos.current, lista);
      previos.current = lista;
      setPedidos(lista);
      if (nuevos.length && onNuevo) onNuevo(nuevos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los pedidos");
    }
  }, [token, caja.sucursal_id, onNuevo]);

  useEffect(() => { recargar(); const id = setInterval(recargar, REFRESCO_MS); return () => clearInterval(id); }, [recargar]);
  useEffect(() => { const id = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(id); }, []);

  const accion = async (p: PedidoApp, a: "aceptar" | "rechazar" | "listo", motivo?: "AGOTADO" | "CERRADO" | "SATURADO" | "OTRO") => {
    setOcupado(p.id); setError(null);
    const r = await accionPedidoApp(token, { pedidoId: p.id, accion: a, motivo });
    setOcupado(null);
    if (!r.ok) {
      setError(r.error === "SIN_TURNO_ABIERTO" ? "Abre el turno para poder aceptar pedidos de apps."
        : r.error === "ITEM_SIN_MAPEAR" ? "El pedido trae un producto que no existe en el catálogo. Configura un producto genérico de apps o rechaza."
        : r.error === "YA_PROCESADA" ? "La app ya cerró este pedido." : `${r.error}${r.detalle ? ": " + r.detalle : ""}`);
    }
    setRechazando(null);
    await recargar();
  };

  const pendientes = useMemo(() => pedidos.filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR"), [pedidos]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <BotonVolver onClick={onSalir} />
        <h1 className="text-lg font-semibold">Pedidos de apps</h1>
        {pendientes.length > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-sm font-semibold text-white">{pendientes.length} por aceptar</span>}
      </header>
      {error && <p role="alert" className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {pedidos.length === 0 ? (
        <p className="m-auto text-center text-muted">Sin pedidos de apps por ahora.<br />Aquí aparecen solos cuando llegan.</p>
      ) : (
        <ul className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
          {pedidos.map((p) => {
            const seg = p.estado === "RECIBIDO" ? segundosRestantes(p.venceAceptacion, ahora) : null;
            const urgente = seg !== null && seg < 120;
            return (
              <li key={p.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${p.estado === "RECIBIDO" ? (urgente ? "border-danger" : "border-brand") : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wide">{etiquetaApp(p.app)}</span>
                  <span className="text-2xl font-bold">{p.folioCorto ?? p.idExterno.slice(-6)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{etiquetaEstado(p.estado)}</span>
                  {seg !== null && <span className={`font-mono ${urgente ? "text-danger" : ""}`} aria-label="tiempo para aceptar">{mmss(seg)}</span>}
                  {p.ticketFolio && <span className="text-muted">Ticket {p.ticketFolio}</span>}
                </div>
                {p.clienteNombre && <p className="text-sm">{p.clienteNombre}{p.tipoEntrega === "RECOGE_CLIENTE" ? " · recoge en tienda" : ""}</p>}
                <ul className="text-sm">
                  {p.items.map((it, i) => (
                    <li key={i} className={it.mapeado ? "" : "text-danger"}>
                      {it.cantidad} × {it.nombreApp}{it.mapeado ? "" : " (no está en el catálogo)"}
                      {it.modificadores.length > 0 && <span className="text-muted"> · {it.modificadores.map((m) => `${m.cantidad > 1 ? m.cantidad + "× " : ""}${m.nombreApp}`).join(", ")}</span>}
                      {it.nota && <span className="text-muted"> · "{it.nota}"</span>}
                    </li>
                  ))}
                </ul>
                {p.notaCliente && <p className="text-sm italic">"{p.notaCliente}"</p>}
                {p.totalCliente !== null && <p className="text-sm text-muted">Total en la app: ${p.totalCliente.toFixed(2)}</p>}
                {p.ultimoError && p.estado === "ERROR" && <p className="text-xs text-danger">{p.ultimoError}</p>}
                <div className="mt-auto flex gap-2">
                  {(p.estado === "RECIBIDO" || p.estado === "ERROR") && (
                    <>
                      <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "aceptar")} className="flex-1 rounded-md bg-brand py-2 font-semibold text-white disabled:opacity-50">Aceptar</button>
                      <button type="button" disabled={ocupado === p.id} onClick={() => setRechazando(p)} className="rounded-md border border-line px-3 py-2 disabled:opacity-50">Rechazar</button>
                    </>
                  )}
                  {(p.estado === "ACEPTADO" || p.estado === "EN_PREPARACION") && (
                    <button type="button" disabled={ocupado === p.id} onClick={() => accion(p, "listo")} className="flex-1 rounded-md bg-brand py-2 font-semibold text-white disabled:opacity-50">Marcar listo</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rechazando && (
        <div role="dialog" aria-modal="true" aria-label="Motivo del rechazo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-lg bg-bg p-4">
            <h2 className="mb-3 font-semibold">¿Por qué se rechaza {rechazando.folioCorto ?? "el pedido"}?</h2>
            <div className="flex flex-col gap-2">
              {MOTIVOS.map((m) => (
                <button key={m.codigo} type="button" onClick={() => accion(rechazando, "rechazar", m.codigo)} className="rounded-md border border-line px-3 py-2 text-left">{m.label}</button>
              ))}
              <button type="button" onClick={() => setRechazando(null)} className="mt-2 text-sm text-muted">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

Ajustar las clases (`bg-bg`, `border-line`, `text-muted`, `bg-brand`, `bg-danger`, `bg-danger-soft`) a los tokens reales de `apps/pos/app/globals.css` / `docs/diseno/pos.md`; usar exactamente los que ya usan `pantalla-devoluciones.tsx` y `pantalla-cuentas-modo.tsx` (no inventar estilos: ADR 0001).

- [ ] **Step 2: Acceso en `pantalla-inicio.tsx`**

Añadir props `nPedidosApps: number` y `onPedidosApps: () => void` a `PantallaInicio` y, junto al tile "Domicilio", el tile:

```tsx
<Acceso label="Pedidos de apps" badge={nPedidosApps} onClick={onPedidosApps} requiereTurno={sinTurno}
  icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6h6M12 18h.01" /></svg>} />
```

- [ ] **Step 3: Cablear en `home-pos.tsx`**

Siguiendo el patrón de `PantallaDevoluciones` (línea ~1396) y del badge `nEnEspera` (líneas ~220–225 y ~693):

```tsx
import { PantallaPedidosApps } from "./pantalla-pedidos-apps";
import { leerPedidosApps } from "../lib/pedidos-apps";
// estado
const [viendoPedidosApps, setViendoPedidosApps] = useState(false);
const [nPedidosApps, setNPedidosApps] = useState(0);
const idsAppsVistos = useRef<Set<string>>(new Set());
// badge + sonido: dentro del efecto que refresca los badges del inicio (línea ~819), cada 10 s
const refrescarPedidosApps = useCallback(() => {
  leerPedidosApps(token, caja.sucursal_id).then((ps) => {
    const pendientes = ps.filter((p) => p.estado === "RECIBIDO" || p.estado === "ERROR");
    setNPedidosApps(pendientes.length);
    const nuevos = pendientes.filter((p) => !idsAppsVistos.current.has(p.id));
    pendientes.forEach((p) => idsAppsVistos.current.add(p.id));
    if (nuevos.length > 0) {
      try { new Audio("/sonidos/pedido-app.mp3").play().catch(() => {}); } catch { /* sin audio: el badge basta */ }
    }
  }).catch(() => {});
}, [token, caja.sucursal_id]);
// render, junto a las otras pantallas completas:
if (viendoPedidosApps) {
  return <PantallaPedidosApps token={token} caja={caja} onSalir={() => { setViendoPedidosApps(false); refrescarPedidosApps(); }} />;
}
// en <PantallaInicio …>: nPedidosApps={nPedidosApps} onPedidosApps={() => setViendoPedidosApps(true)}
```

Añadir `apps/pos/public/sonidos/pedido-app.mp3` (un tono corto; si no hay archivo a la mano, generar un WAV de 0.4 s con `node -e` usando un seno a 880 Hz y guardarlo como `pedido-app.wav`, cambiando la ruta en el código).

- [ ] **Step 4: Typecheck, tests y prueba en navegador**

Run: `pnpm --filter @vim/pos typecheck && pnpm --filter @vim/pos test`
Expected: sin errores; los tests existentes siguen en verde.

Prueba visual (con stack local o con el backend embebido según la receta de `reference_reproducir_pos_sin_docker`): insertar a mano un `delivery_pedidos` RECIBIDO para la sucursal de Knock-Out con `vence_aceptacion = now() + 10 min`, abrir el POS, ver el badge en "Pedidos de apps", entrar, ver el contador bajar, pulsar Rechazar → sin sandbox de Uber la función responderá `UBER_ERROR` (esperado hasta tener credenciales); con credenciales de sandbox, Aceptar crea el ticket y aparece en Consultar cuentas como PAGADO.

- [ ] **Step 5: Commit**

```bash
git add apps/pos/app/components/pantalla-pedidos-apps.tsx apps/pos/app/components/pantalla-inicio.tsx apps/pos/app/components/home-pos.tsx apps/pos/public/sonidos
git commit -m "pos: pantalla Pedidos de apps con contador, aceptar/rechazar/listo, badge y sonido en inicio"
```

---

## Task 9: Prueba de punta a punta contra el sandbox de Uber y docs de operación

Requiere que Fermín haya creado la app *Testing* en el Developer Dashboard de Uber y tenga una tienda de prueba activada contra ella (con el token del dueño: `GET /v1/delivery/stores` → `POST /v1/eats/stores/{store_id}/pos_data` con `integrator_store_id = <uuid de la sucursal>`, `is_order_manager: true`, `webhooks_config.webhooks_version: "1.0.0"`; se hace una vez con curl/Postman siguiendo `03-uber-eats-resumen.md §4`, la pantalla de admin es F1b).

**Files:**
- Modify: `docs/operacion/` → crear `delivery-uber-sandbox.md` (runbook)
- Modify: `docs/producto/roadmap-a-100.md` (línea de estado de la integración)

- [ ] **Step 1: Configurar secrets y desplegar**

```bash
supabase secrets set UBER_ENTORNO=sandbox UBER_CLIENT_ID=<client_id sandbox> UBER_CLIENT_SECRET=<client_secret sandbox>
supabase functions deploy delivery-webhook-uber --no-verify-jwt
supabase functions deploy delivery-accion
supabase db push
```

(Recordatorio de memoria: en esta máquina `supabase secrets set` puede fallar por el token; usar el dashboard de Supabase → Edge Functions → Secrets.)

- [ ] **Step 2: Registrar el webhook y la conexión**

- Developer Dashboard → app Testing → Webhooks → Primary Webhook URL = `https://<proyecto>.supabase.co/functions/v1/delivery-webhook-uber`.
- Insertar la conexión de la sucursal piloto (desde el SQL editor de Supabase, como admin):

```sql
INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, conectada_at)
VALUES ('<tenant Knock-Out>', '<sucursal>', 'APP_UBEREATS', 'ACTIVA', '<store_id de la tienda de prueba>', 'Tienda de prueba Uber', true, 12, now());
```

- [ ] **Step 3: Hacer un pedido de prueba**

Con el turno abierto en el POS: entrar a ubereats.com con la cuenta de prueba, dirección de la tienda de prueba, pedir un producto cuyo `id` en el menú de prueba sea el uuid de un producto de VIM (subir antes un menú mínimo con `PUT /v2/eats/stores/{store_id}/menus` usando ids de VIM; ejemplo en `referencia-api/v2-example-menu-payloads.md`). Verificar: fila en `delivery_eventos` (firma válida), fila en `delivery_pedidos` ACEPTADO con `ticket_id`, ticket PAGADO en Consultar cuentas, orden aceptada en Uber Eats Orders (restaurant-dashboard.uber.com). Marcar listo desde el POS → estado `READY_FOR_HANDOFF` en Uber.

- [ ] **Step 4: Escribir el runbook `docs/operacion/delivery-uber-sandbox.md`** con los pasos 1–3 tal cual se ejecutaron, los ids usados (sin secrets) y cómo leer `delivery_eventos` cuando algo falle.

- [ ] **Step 5: Commit y merge**

```bash
git add docs/operacion/delivery-uber-sandbox.md docs/producto/roadmap-a-100.md
git commit -m "docs: runbook del sandbox de Uber Eats y estado en el roadmap"
git checkout main && git merge --no-ff delivery-f1-uber -m "Delivery F1: pedidos de Uber Eats en el POS (ADR 0011)"
```

---

## Self-review

- **Cobertura del spec (doc 05):** §1 principio integrador → Tasks 1, 5, 6 (secrets, sin credenciales del cliente). §2 arquitectura → Tasks 4–6 (adaptador, webhook, acción). §3 tablas → Task 2 (menos `delivery_menu_publicaciones`, que es F4 y se dice en Global Constraints). §4 flujo del pedido pasos 1–4 → Tasks 3, 5; pasos 5–7 parcialmente (listo → Task 6; cancelación por la app → Task 5 marca el pedido, la cancelación del ticket queda al cajero con las herramientas existentes; efectivo → F2). §5 salud → F1b (fuera de alcance, declarado). §7 pantallas del POS → Tasks 7–8; admin → F1b. §8 offline → F1b. §10 seguridad → firma en tiempo constante, límite de cuerpo, idempotencia, eventos de salida (Tasks 4–6).
- **Placeholders:** ninguno de la lista prohibida; el único "ajustar" es el nombre real del trigger de `updated_at` y los tokens CSS, ambos con instrucción concreta de dónde copiarlos.
- **Consistencia de tipos:** `crear_ticket_desde_app(p_pedido_id uuid) → uuid` y `delivery_pedido_transicion(uuid, text, text)` se usan con esos nombres en Tasks 3, 5, 6; `procesarNotificacionUber(deps, evento)` y `DbMinima` coinciden entre `procesar-uber.ts`, su test y el handler; `accionPedidoApp` devuelve `{ok, ticketId}` y la pantalla lo consume así; `PedidoApp.estado` usa los mismos literales que el CHECK de la tabla.
