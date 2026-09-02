# 07 — ARQUITECTURA TÉCNICA — Parte 1B: Catálogo, CRM, Promociones, Inventario

> **Versión:** v1.0
> **Fecha:** Mayo 2026
> **Propietario:** Fermín — VIM Marketing
> **Documento:** segunda entrega de la arquitectura técnica de VIM POS
> **Alcance de esta parte:** catálogo de productos, modificadores, áreas de cocina, CRM básico (clientes), promociones automáticas, marcas virtuales (Dark Kitchen), módulo Inventario y Recetas
> **Depende de:** Parte 1A (tenants, sucursales, usuarios, auditoría) — la 1B se monta encima del núcleo multi-tenant
> **Stack:** PostgreSQL 15 vía Supabase, Row Level Security activo

---

> ## ⚠️ Reconciliación post-validación (F1)
> Al aplicar las migraciones contra Postgres real se corrigieron detalles de este doc (bitácora: Playbook doc 18 §4). Canónico/validado en `supabase/migrations/0007`:
> - `EXCLUDE … IS NOT DISTINCT FROM` (unidades de medida) → **índices únicos parciales** (no es SQL válido).
> - Columna de búsqueda de cliente: `f_unaccent(...)` (wrapper IMMUTABLE), no `unaccent(...)` directo en `GENERATED … STORED`.
> - `marcas_virtuales`: columnas de color son **`color_primario_hex`** / `color_secundario_hex`.

## 📋 Tabla de contenidos

- [0. Introducción y dependencias con Parte 1A](#0-introducción-y-dependencias-con-parte-1a)
- [1. Filosofía del catálogo](#1-filosofía-del-catálogo)
- [2. Convenciones (recap)](#2-convenciones-recap)
- [3. Esquema: Catálogo de productos](#3-esquema-catálogo-de-productos)
- [4. Esquema: Áreas de cocina](#4-esquema-áreas-de-cocina)
- [5. Esquema: CRM básico (clientes y direcciones)](#5-esquema-crm-básico-clientes-y-direcciones)
- [6. Esquema: Promociones automáticas](#6-esquema-promociones-automáticas)
- [7. Esquema: Marcas virtuales (Dark Kitchen)](#7-esquema-marcas-virtuales-dark-kitchen)
- [8. Esquema: Módulo Inventario y Recetas](#8-esquema-módulo-inventario-y-recetas)
- [9. Funciones helper y triggers](#9-funciones-helper-y-triggers)
- [10. Seeds iniciales](#10-seeds-iniciales)
- [11. Estrategia de migraciones (continuación)](#11-estrategia-de-migraciones-continuación)
- [12. Decisiones pendientes para Parte 1C/1D](#12-decisiones-pendientes-para-parte-1c1d)
- [13. Checklist de validación](#13-checklist-de-validación)

---

## 0. Introducción y dependencias con Parte 1A

### 0.1 Propósito de este documento

Esta Parte 1B define **el catálogo del negocio** y todas las entidades que el cajero usará para construir un ticket: productos, categorías, modificadores, clientes, promociones, áreas de cocina, marcas virtuales e insumos/recetas.

**Diferencia clave con Parte 1A:**

- Parte 1A modela **quién opera dónde** (tenants, usuarios, turnos, cajas).
- Parte 1B modela **qué se vende y a quién** (productos, modificadores, clientes, recetas).
- Parte 1C (siguiente) modelará **la operación misma** (tickets, items, pagos).

### 0.2 Alcance

**Esta Parte 1B cubre:**

- ✅ Categorías de productos (jerárquicas opcionales)
- ✅ Productos con datos fiscales SAT, modos de servicio aplicables, área de cocina, tipo de venta
- ✅ Grupos y opciones de modificadores, con relación N:M a productos
- ✅ Áreas de cocina por sucursal con asignación de productos
- ✅ Clientes y direcciones de entrega (CRM básico)
- ✅ Promociones automáticas (configuración de reglas; la aplicación va en 1C)
- ✅ Marcas virtuales para Dark Kitchen
- ✅ Módulo Inventario y Recetas completo: insumos, unidades de medida con conversiones, recetas, modificadores con receta extra, movimientos de inventario universales, alertas de stock

**Lo que NO cubre (intencional):**

- ❌ Tickets, items de ticket, pagos (Parte 1C)
- ❌ Aplicación de descuentos a tickets concretos (Parte 1C)
- ❌ CFDI 4.0 (estructura preparada, activación en Parte 1C + Fase Final)
- ❌ Mesas, cuentas abiertas, multi-marca operativa (Parte 1D)

### 0.3 Dependencias con Parte 1A

Todas las tablas de esta Parte 1B referencian al menos:

```sql
tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT
```

Y siguen las convenciones definidas en Parte 1A:

- Decisiones D1-D13 aplican intactas (multi-tenant, RLS, uuid, snake_case, soft delete, timestamptz, dia_contable, auditoría, pgcrypto, enums, folio, roles, JWT)
- Todas las RLS policies usan `current_tenant_id()` definida en Parte 1A §8.1
- Trigger `set_updated_at()` definido en Parte 1A §8.5 se reutiliza
- Eventos importantes (cambio de precio, alta/baja de producto, cambio de stock) escriben a `auditoria_eventos` (Parte 1A §7.2)
- Cambios autorizados por PIN (ej. precio override de un mesero) registran en `autorizaciones_pin` (Parte 1A §7.3)

### 0.4 Nuevas decisiones de diseño (D14-D32)

Estas decisiones aplican específicamente al catálogo, CRM, promociones e inventario. Las decisiones D1-D13 de Parte 1A siguen vigentes en todas las tablas.

| # | Decisión | Justificación |
|---|---|---|
| **D14** | `tenant_id NOT NULL` en todas las tablas de catálogo, sin herencia implícita | Coherencia con D1, evita bugs por joins olvidados |
| **D15** | Categorías jerárquicas vía `parent_id` nullable autoreferencial | Soporta "Bebidas > Frías > Refrescos" sin refactor. En MVP solo se usa nivel 1 |
| **D16** | Un solo `precio_base` en `productos` (MVP). Precios por canal se modelan en Parte 1D | YAGNI — no inflamos schema antes de necesitarlo |
| **D17** | Tipo de selección del modificador vive en el GRUPO, no en producto-grupo | 95% de casos el grupo se comporta igual en todos sus productos |
| **D18** | Modos de servicio aplicables al producto como `text[]` (NULL/vacío = todos) | Lectura simple, indexable con GIN, ≤12 modos en catálogo |
| **D19** | Áreas de cocina como tabla, productos referencian vía FK `area_cocina_id` | Configuración por sucursal, separación de impresoras |
| **D20** | Cliente: tabla simple sin programa de lealtad ni puntos en MVP. Histórico calculado on-demand desde tickets | CRM Pro es add-on pagado, no parte del `/core` MVP |
| **D21** | Inventario a nivel SUCURSAL (`insumo_stock_sucursal`) | Cajas comparten stock, sucursales no |
| **D22** | Recetas: FK solo a `insumos` (no a sub-productos en MVP) | Caso raro de producto compuesto de productos. KISS |
| **D23** | `movimientos_inventario` tabla universal con tipo enum | Mismo patrón que `movimientos_caja` de Parte 1A |
| **D24** | Unidades de medida con tabla de conversiones | Soporta "compro por kg, uso por g" sin lógica hardcodeada |
| **D25** | Marcas virtuales DK: FK opcional `marca_virtual_id` en productos, NULL = sin marca | Activado solo si feature flag `multi_marca` está on |
| **D26** | Proveedor: campo `varchar` libre en movimientos, sin catálogo formal | §31.4 del `/core` lo confirma — no catálogo de proveedores MVP |
| **D27** | Soft delete (`deleted_at`) en catálogo: borrar producto NO destruye tickets que lo contienen | Trazabilidad histórica (§27 del `/core`) |
| **D28** | Datos fiscales SAT (`clave_sat`, `unidad_sat`, `tasa_iva`) como columnas en `productos` | Lectura rápida sin JOIN, override por producto fácil |
| **D29** | Condiciones de promoción como `jsonb` documentado, no normalizado | Variabilidad extrema de condiciones (hora, día, monto, cupón, CRM, pago) |
| **D30** | Stock y costo unitario actual en `insumos` directamente. Histórico se reconstruye desde `movimientos_inventario` | Cada entrada guarda su costo, promedio ponderado se recalcula al vuelo |
| **D31** | Compras como movimientos `ENTRADA_COMPRA`, sin tabla `compras` separada | §31.4 del `/core` lo decide |
| **D32** | Stock negativo permitido en BD. App marca insumo con flag visual | §34.3 del `/core`: permitir venta, marcar para ajuste posterior |

---

## 1. Filosofía del catálogo

### 1.1 Reglas universales

El catálogo de VIM POS sigue tres principios:

**1. Un producto es lo que se imprime distinto en cocina.**

Refleja la regla de pulgar de §4.5 del `/core`: "Hamburguesa Clásica" y "Hamburguesa BBQ" son productos distintos. "Hamburguesa Clásica sin cebolla" es modificador. Esta regla simplifica el reporteo ("cuántas BBQ vendí esta semana") y la operación de cocina.

**2. Modificadores son reutilizables.**

Un grupo de modificadores se define una vez a nivel tenant (`tenant_id`) y se asocia a N productos. Cambiar el precio del "extra queso" se hace en un solo lugar, no en cada hamburguesa.

**3. El inventario vive en los insumos, no en los productos.**

Refleja §32.3 del `/core`: cuando vendes una hamburguesa, no descuentas "1 hamburguesa del stock" — descuentas 1 pan, 120g de carne, 25g de queso, etc. El producto es lo que vendes; el insumo es lo que compras. Esta separación permite control real de costos y mermas.

### 1.2 Multi-marca virtual (Dark Kitchen)

Para tenants del vertical Dark Kitchen, un mismo `tenant_id` aloja **múltiples marcas comerciales** que comparten cocina física. Cada producto pertenece a una marca virtual (`marca_virtual_id`). El cajero/armador ve la marca al despachar; en reportes se filtra por marca.

```
Tenant: "MetroKitchen LEÓN"
├── Marca virtual: "BurgerPunk" (id: A)
│   ├── Producto: Hamburguesa Smash
│   └── Producto: Hot Wings
├── Marca virtual: "Tacos del Bajío" (id: B)
│   ├── Producto: Taco al pastor
│   └── Producto: Quesadilla
└── Marca virtual: "Pizza Slot" (id: C)
    └── Producto: Pizza Margherita
```

Para tenants que NO son Dark Kitchen, `marca_virtual_id` es siempre NULL.

### 1.3 Activación del módulo Inventario

El módulo Inventario es **opcional** (§31.2 del `/core`). El schema completo existe desde día 1, pero su uso depende de un feature flag por tenant (`modulo_inventario_activo` en `configuracion_tenant`, ya definido en Parte 1A §4.3).

- Si está **off**: tablas existen, pero la app no las usa. Productos se venden sin descontar insumos. Reportes de margen no disponibles.
- Si está **on**: cada venta dispara descuento de insumos, alertas funcionan, reportes de costos se calculan.

Esto evita migrar tablas cuando un tenant activa el módulo después.

---

## 2. Convenciones (recap)

Las convenciones definidas en Parte 1A §2 aplican aquí intactas. Recap breve para que este documento se lea standalone:

- Naming: `snake_case` español, plural en tablas, `<entidad>_id` en FKs
- Tipos: `uuid` para PKs, `timestamptz` para fechas/horas, `numeric(12,2)` para dinero, `numeric(12,3)` para cantidades de inventario, `jsonb` para estructuras flexibles
- Columnas comunes en tablas operativas: `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`
- Triggers `set_updated_at()` aplicados a todas las tablas con `updated_at`
- RLS habilitada por defecto, política por `tenant_id` vía `current_tenant_id()` (JWT claim, D13)
- Soft delete (`deleted_at IS NULL`) en tablas auditables

Cuando este documento se aleja de las convenciones, lo nota explícitamente.

---

## 3. Esquema: Catálogo de productos

Las entidades core del catálogo: categorías, productos, grupos de modificadores y opciones de modificadores, con sus relaciones.

### 3.1 Enums asociados

```sql
-- Estado del producto (§4.1, §4.6 del /core)
CREATE TYPE producto_estado AS ENUM (
  'ACTIVO',         -- visible en pantalla de venta
  'PAUSADO',        -- oculto pero conservado (no se elimina)
  'AGOTADO'         -- visible en gris, no se puede agregar al ticket
);

-- Tipo de venta del producto (§4.1 del /core)
CREATE TYPE producto_tipo_venta AS ENUM (
  'UNIDAD',         -- default: hamburguesa, refresco, taco
  'PESO',           -- vendido por peso (futuro, retail/super)
  'VOLUMEN'         -- vendido por volumen (Café & Bar, cocteles)
);

-- Tipo de selección de un grupo de modificadores (§4.3)
CREATE TYPE modificador_tipo_seleccion AS ENUM (
  'UNICA_OBLIGATORIA',          -- debe elegir exactamente UNA (ej. término de cocción)
  'UNICA_OPCIONAL',             -- puede elegir UNA o NINGUNA (ej. tipo de pan)
  'MULTIPLE_OPCIONAL',          -- puede elegir VARIAS o NINGUNA (ej. sin ingredientes)
  'MULTIPLE_OBLIGATORIA_RANGO'  -- debe elegir entre N y M (ej. "elige 2 salsas")
);

-- Naturaleza del modificador respecto al inventario (§33.3)
CREATE TYPE modificador_naturaleza AS ENUM (
  'EXTRA',          -- agrega algo, puede tener receta de insumos adicionales
  'SUSTITUCION',    -- cambia un ingrediente por otro (futuro, no MVP)
  'OMISION',        -- "sin X" — NO afecta inventario, solo va a la comanda
  'PREPARACION',    -- término de cocción, etc. — NO afecta inventario
  'NEUTRO'          -- categórico, sin impacto en stock ni precio
);
```

### 3.2 Tabla `categorias`

Agrupación visual del catálogo (§4.2 del `/core`). Una categoría puede tener una categoría padre, soportando árboles de profundidad arbitraria. En MVP solo se usa nivel 1.

```sql
CREATE TABLE categorias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  nombre              varchar(150) NOT NULL,
  descripcion         text NULL,
  codigo              varchar(50) NULL,              -- opcional, para integraciones externas

  -- Jerarquía (D15)
  parent_id           uuid NULL REFERENCES categorias(id) ON DELETE RESTRICT,

  -- Presentación
  color_hex           varchar(7) NULL,               -- '#FF5733' para botón en pantalla
  icono               varchar(50) NULL,              -- nombre de ícono Lucide (ej. 'beef', 'coffee')
  imagen_url          text NULL,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- Visibilidad por modo de servicio (§4.2 del /core)
  -- NULL/empty = visible en TODOS los modos. Si tiene valores, solo en esos.
  modos_servicio_visibles text[] NULL,

  -- Visibilidad por subtipo de personal (§4.2)
  -- NULL/empty = visible para todos. Permite ocultar categorías a roles específicos.
  subtipos_personal_visibles uuid[] NULL,

  -- Estado
  activa              boolean NOT NULL DEFAULT true,

  -- Auditoría estándar
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL,

  -- Constraints
  CONSTRAINT categoria_no_es_su_propio_padre CHECK (id IS DISTINCT FROM parent_id)
);

CREATE INDEX idx_categorias_tenant ON categorias(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_categorias_padre ON categorias(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_categorias_orden ON categorias(tenant_id, parent_id, orden_visualizacion) WHERE deleted_at IS NULL AND activa = true;

COMMENT ON TABLE categorias IS 'Agrupación visual de productos. Soporta jerarquía vía parent_id. §4.2 del /core.';
COMMENT ON COLUMN categorias.parent_id IS 'NULL = categoría raíz. En MVP solo se usa nivel 1, pero soporta árboles.';
COMMENT ON COLUMN categorias.modos_servicio_visibles IS 'Subset de modos_servicio_activos del tenant. NULL = todos.';
```

### 3.3 Tabla `productos`

Entidad central del catálogo. Representa lo que se vende al cliente (§4.1 del `/core`).

```sql
CREATE TABLE productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Datos básicos
  nombre              varchar(200) NOT NULL,
  descripcion         text NULL,
  codigo_interno      varchar(50) NULL,              -- código del negocio, p.ej. "HAM-001"
  codigo_barras       varchar(50) NULL,              -- EAN/UPC opcional

  -- Categorización
  categoria_id        uuid NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  marca_virtual_id    uuid NULL,                     -- FK a marcas_virtuales, agregada en §7 (D25)

  -- Precio (D16 — un solo precio base en MVP)
  precio_base_mxn     numeric(12,2) NOT NULL CHECK (precio_base_mxn >= 0),

  -- Configuración fiscal SAT (D28)
  clave_sat           varchar(20) NULL,              -- catálogo c_ClaveProdServ del SAT
  unidad_sat          varchar(20) NULL,              -- catálogo c_ClaveUnidad del SAT
  tasa_iva            numeric(5,2) NOT NULL DEFAULT 16.00 CHECK (tasa_iva >= 0 AND tasa_iva <= 100),
  iva_incluido_en_precio boolean NOT NULL DEFAULT true,  -- México: típicamente sí

  -- Estado y disponibilidad
  estado              producto_estado NOT NULL DEFAULT 'ACTIVO',
  agotado_manual      boolean NOT NULL DEFAULT false,  -- toggle manual del admin (§4.6)
  agotado_automatico  boolean NOT NULL DEFAULT false,  -- por insumo bajo (§36.2)
  motivo_agotado      text NULL,

  -- Tipo de venta (D ya implícito; default UNIDAD)
  tipo_venta          producto_tipo_venta NOT NULL DEFAULT 'UNIDAD',

  -- Disponibilidad por modo de servicio (D18 — array, NULL = todos)
  modos_servicio_disponibles text[] NULL,

  -- Tiempo estimado de preparación (minutos, opcional)
  tiempo_preparacion_min integer NULL CHECK (tiempo_preparacion_min IS NULL OR tiempo_preparacion_min > 0),

  -- Área de cocina (FK opcional, definida en §4)
  area_cocina_id      uuid NULL,                     -- FK a areas_cocina, agregada en §4

  -- Política de impresión a múltiples áreas (§19.6 del /core)
  imprime_en_multiples_areas boolean NOT NULL DEFAULT false,

  -- Presentación
  imagen_url          text NULL,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- Visibilidad
  visible_en_pos      boolean NOT NULL DEFAULT true,  -- false para "producto interno" (ej. componente que se factura pero no se ve)

  -- Notas internas (admin)
  notas_internas      text NULL,

  -- Auditoría estándar
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL,

  -- Constraint: agotado solo si está activo
  CONSTRAINT estado_consistente CHECK (
    NOT (estado = 'AGOTADO' AND NOT (agotado_manual OR agotado_automatico))
  )
);

CREATE INDEX idx_productos_tenant ON productos(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_productos_categoria ON productos(categoria_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_productos_marca ON productos(marca_virtual_id) WHERE deleted_at IS NULL AND marca_virtual_id IS NOT NULL;
CREATE INDEX idx_productos_estado ON productos(tenant_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_productos_codigo_interno ON productos(tenant_id, codigo_interno) WHERE codigo_interno IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_productos_codigo_barras ON productos(tenant_id, codigo_barras) WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_productos_nombre_trgm ON productos USING GIN (nombre gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_productos_modos_servicio ON productos USING GIN (modos_servicio_disponibles) WHERE deleted_at IS NULL;
CREATE INDEX idx_productos_orden ON productos(tenant_id, categoria_id, orden_visualizacion) WHERE deleted_at IS NULL AND estado = 'ACTIVO';

COMMENT ON TABLE productos IS 'Catálogo principal de productos. §4.1 del /core.';
COMMENT ON COLUMN productos.modos_servicio_disponibles IS 'Array de strings (códigos de modo_servicio). NULL/vacío = disponible en TODOS los modos activos del tenant.';
COMMENT ON COLUMN productos.agotado_manual IS 'Toggle del admin. Convive con agotado_automatico (por insumo bajo).';
COMMENT ON COLUMN productos.iva_incluido_en_precio IS 'México: típicamente true. precio_base_mxn = precio FINAL al cliente.';
```

### 3.4 Tabla `grupos_modificadores`

Conjuntos reutilizables de modificadores (§4.3 del `/core`). Un grupo se asocia a N productos.

```sql
CREATE TABLE grupos_modificadores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  nombre              varchar(150) NOT NULL,         -- "Término de cocción", "Sin ingredientes", "Extra queso"
  descripcion         text NULL,
  codigo_interno      varchar(50) NULL,

  -- Tipo de selección (D17 — vive en el grupo)
  tipo_seleccion      modificador_tipo_seleccion NOT NULL,

  -- Rango para tipo MULTIPLE_OBLIGATORIA_RANGO
  minimo_selecciones  integer NULL CHECK (minimo_selecciones IS NULL OR minimo_selecciones >= 0),
  maximo_selecciones  integer NULL CHECK (maximo_selecciones IS NULL OR maximo_selecciones >= 1),

  -- Naturaleza (impacto en inventario y precio)
  naturaleza          modificador_naturaleza NOT NULL DEFAULT 'NEUTRO',

  -- Visibilidad
  activo              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL,

  CONSTRAINT rango_valido CHECK (
    tipo_seleccion <> 'MULTIPLE_OBLIGATORIA_RANGO' OR
    (minimo_selecciones IS NOT NULL AND maximo_selecciones IS NOT NULL AND maximo_selecciones >= minimo_selecciones)
  )
);

CREATE INDEX idx_grupos_mod_tenant ON grupos_modificadores(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_grupos_mod_activos ON grupos_modificadores(tenant_id, activo) WHERE deleted_at IS NULL;

COMMENT ON TABLE grupos_modificadores IS 'Grupos reutilizables de modificadores. §4.3 del /core. D17.';
COMMENT ON COLUMN grupos_modificadores.naturaleza IS 'EXTRA = agrega insumos, OMISION = "sin X" no afecta inventario, PREPARACION = término de cocción, etc.';
```

### 3.5 Tabla `opciones_modificador`

Opciones concretas dentro de un grupo (§4.3). Cada opción puede tener precio extra y, en el módulo Inventario activo, una mini-receta.

```sql
CREATE TABLE opciones_modificador (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  grupo_id            uuid NOT NULL REFERENCES grupos_modificadores(id) ON DELETE CASCADE,

  -- Identidad
  nombre              varchar(150) NOT NULL,         -- "Tres cuartos", "Sin cebolla", "Extra queso amarillo"
  descripcion         text NULL,
  codigo_interno      varchar(50) NULL,

  -- Precio extra (puede ser 0; soporta valores negativos por si quieres "ahorro por modificación")
  precio_extra_mxn    numeric(12,2) NOT NULL DEFAULT 0,

  -- Disponibilidad
  activa              boolean NOT NULL DEFAULT true,
  agotada             boolean NOT NULL DEFAULT false,  -- ej. "Tocino agotado, no se puede pedir extra"

  -- Orden y presentación
  orden_visualizacion integer NOT NULL DEFAULT 0,
  es_default          boolean NOT NULL DEFAULT false, -- se pre-selecciona en UNICA_OBLIGATORIA

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL
);

CREATE INDEX idx_opciones_mod_grupo ON opciones_modificador(grupo_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opciones_mod_tenant ON opciones_modificador(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opciones_mod_orden ON opciones_modificador(grupo_id, orden_visualizacion) WHERE deleted_at IS NULL AND activa = true;

-- Solo una opción default por grupo
CREATE UNIQUE INDEX idx_opciones_mod_default_unico
  ON opciones_modificador(grupo_id)
  WHERE es_default = true AND deleted_at IS NULL;

COMMENT ON TABLE opciones_modificador IS 'Opciones concretas dentro de un grupo (ej. "Tres cuartos", "Sin cebolla", "Extra queso").';
COMMENT ON COLUMN opciones_modificador.es_default IS 'Pre-selección automática para UNICA_OBLIGATORIA. Una sola por grupo.';
```

### 3.6 Tabla `productos_grupos_modificadores`

Relación N:M entre productos y grupos de modificadores.

```sql
CREATE TABLE productos_grupos_modificadores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  grupo_id            uuid NOT NULL REFERENCES grupos_modificadores(id) ON DELETE CASCADE,

  -- Orden en el que aparece el grupo cuando se selecciona el producto
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- Auditoría mínima (es tabla de unión)
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),

  CONSTRAINT producto_grupo_unico UNIQUE (producto_id, grupo_id)
);

CREATE INDEX idx_prod_grupos_producto ON productos_grupos_modificadores(producto_id);
CREATE INDEX idx_prod_grupos_grupo ON productos_grupos_modificadores(grupo_id);
CREATE INDEX idx_prod_grupos_tenant ON productos_grupos_modificadores(tenant_id);

COMMENT ON TABLE productos_grupos_modificadores IS 'Relación N:M. Cada grupo aparece en N productos. Tipo_seleccion vive en el grupo (D17).';
```

### 3.7 RLS y políticas

```sql
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_tenant ON categorias FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY productos_tenant ON productos FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE grupos_modificadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY grupos_mod_tenant ON grupos_modificadores FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE opciones_modificador ENABLE ROW LEVEL SECURITY;
CREATE POLICY opciones_mod_tenant ON opciones_modificador FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE productos_grupos_modificadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY prod_grupos_tenant ON productos_grupos_modificadores FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
```

### 3.8 Triggers de mantenimiento

```sql
CREATE TRIGGER trg_categorias_updated_at
  BEFORE UPDATE ON categorias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_grupos_mod_updated_at
  BEFORE UPDATE ON grupos_modificadores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_opciones_mod_updated_at
  BEFORE UPDATE ON opciones_modificador
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 3.9 Trigger: auditoría de cambios de precio

Refleja la D8 (todo cambio relevante a `auditoria_eventos`). Cambiar el precio de un producto es evento crítico para reporteo y reclamos.

```sql
CREATE OR REPLACE FUNCTION trg_audit_precio_producto() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.precio_base_mxn IS DISTINCT FROM NEW.precio_base_mxn THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id,
      NEW.updated_by,
      'CATALOGO',
      'producto.precio_modificado',
      'producto',
      NEW.id,
      jsonb_build_object(
        'precio_anterior_mxn', OLD.precio_base_mxn,
        'precio_nuevo_mxn', NEW.precio_base_mxn,
        'nombre_producto', NEW.nombre
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_productos_audit_precio
  AFTER UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION trg_audit_precio_producto();
```

---

## 4. Esquema: Áreas de cocina

Cada sucursal puede tener múltiples áreas de cocina con su propia impresora (§19.3 del `/core`). Los productos se asignan a un área.

### 4.1 Tabla `areas_cocina`

```sql
CREATE TABLE areas_cocina (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- Identidad
  nombre              varchar(100) NOT NULL,          -- "Cocina caliente", "Barra", "Pizzas"
  descripcion         text NULL,
  codigo_interno      varchar(50) NULL,

  -- Categorización (para reporteo)
  tipo                varchar(30) NULL CHECK (tipo IN (
    'COCINA_CALIENTE', 'COCINA_FRIA', 'BARRA', 'PIZZAS',
    'POSTRES', 'CAFE', 'OTRO'
  )),

  -- Impresora asignada (formato flexible — mismo patrón que cajas.impresora_config)
  impresora_config    jsonb NULL,
  -- Ejemplos:
  -- { "tipo": "ethernet", "ip": "192.168.1.51", "puerto": 9100, "modelo": "Epson TM-T20III" }
  -- { "tipo": "bluetooth_ble", "device_id": "AA:BB:CC:DD:EE:FF" }
  -- { "tipo": "compartida_con_caja", "caja_id": "uuid..." }   -- imprime en la impresora de la caja

  -- Formato de comanda (§28.4 del /core)
  formato_comanda     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Ejemplo:
  -- {
  --   "campos_visibles": ["nombre_producto", "modificadores", "notas", "modo_servicio"],
  --   "letra_grande": true,
  --   "agrupar_por_categoria": false,
  --   "mostrar_numero_pedido": "GRANDE"
  -- }

  -- Estado
  activa              boolean NOT NULL DEFAULT true,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT nombre_area_unico_por_sucursal UNIQUE (sucursal_id, nombre)
);

CREATE INDEX idx_areas_cocina_sucursal ON areas_cocina(sucursal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_areas_cocina_tenant ON areas_cocina(tenant_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE areas_cocina IS 'Zonas físicas de preparación con su impresora. §19.3 del /core.';
COMMENT ON COLUMN areas_cocina.impresora_config IS 'JSON flexible. La capa /services interpreta. Soporta ethernet (Knock-Out) y BLE.';
```

### 4.2 Foreign key tardío en `productos`

Ahora que `areas_cocina` existe, agregamos la FK desde `productos`.

```sql
ALTER TABLE productos
  ADD CONSTRAINT fk_productos_area_cocina
  FOREIGN KEY (area_cocina_id) REFERENCES areas_cocina(id) ON DELETE SET NULL;

CREATE INDEX idx_productos_area_cocina ON productos(area_cocina_id) WHERE area_cocina_id IS NOT NULL AND deleted_at IS NULL;
```

> **Nota:** `area_cocina_id` puede ser NULL para productos que no requieren preparación (ej. refresco en lata, paquete de chips). En el flujo de comanda (§19), si todos los productos del ticket tienen `area_cocina_id IS NULL`, no se imprime comanda.

### 4.3 Tabla `productos_areas_cocina_extra`

Cuando un producto necesita imprimir comanda en **múltiples áreas** (§19.6, opción A del `/core`: "el producto se duplica en ambas impresoras con etiqueta [1 de 2] y [2 de 2]"), esta tabla registra las áreas adicionales.

```sql
CREATE TABLE productos_areas_cocina_extra (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  area_cocina_id      uuid NOT NULL REFERENCES areas_cocina(id) ON DELETE CASCADE,

  -- Indica orden de impresión (etiqueta "[1 de N]", "[2 de N]")
  orden               integer NOT NULL DEFAULT 1 CHECK (orden >= 1),

  -- Sub-descripción para esa área (opcional, ej. "solo carne" en parrilla, "solo ensalada" en cocina fría)
  instruccion_area    text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT producto_area_unica UNIQUE (producto_id, area_cocina_id)
);

CREATE INDEX idx_prod_areas_extra_producto ON productos_areas_cocina_extra(producto_id);

COMMENT ON TABLE productos_areas_cocina_extra IS 'Áreas adicionales para productos que se preparan en varias zonas (§19.6 opción A).';
```

> **Decisión de uso:** el área "principal" sigue siendo `productos.area_cocina_id`. Esta tabla agrega áreas extras. Si `imprime_en_multiples_areas = false` en `productos`, esta tabla se ignora aunque tenga filas.

### 4.4 RLS y triggers

```sql
ALTER TABLE areas_cocina ENABLE ROW LEVEL SECURITY;
CREATE POLICY areas_cocina_tenant ON areas_cocina FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE productos_areas_cocina_extra ENABLE ROW LEVEL SECURITY;
CREATE POLICY prod_areas_extra_tenant ON productos_areas_cocina_extra FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_areas_cocina_updated_at
  BEFORE UPDATE ON areas_cocina
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 5. Esquema: CRM básico (clientes y direcciones)

Cliente es entidad opcional (§5.5 del `/core`) salvo para delivery propio o cuando solicitan factura. CRM en MVP es minimalista por decisión D20 — sin lealtad ni puntos.

### 5.1 Enums asociados

```sql
-- Tipo fiscal del cliente
CREATE TYPE cliente_tipo_fiscal AS ENUM (
  'PERSONA_FISICA',
  'PERSONA_MORAL',
  'EVENTUAL'                    -- sin RFC, sin datos fiscales (mayoría de QSR)
);

-- Estado del cliente
CREATE TYPE cliente_estado AS ENUM (
  'ACTIVO',
  'BLOQUEADO'                   -- §5.6 del /core
);

-- Uso CFDI (catálogo del SAT — subset común)
-- La lista completa se carga vía seed
CREATE TYPE uso_cfdi AS ENUM (
  'G01',  -- Adquisición de mercancías
  'G02',  -- Devoluciones, descuentos o bonificaciones
  'G03',  -- Gastos en general
  'P01',  -- Por definir
  'D01',  -- Honorarios médicos (deducción personal)
  'S01'   -- Sin efectos fiscales
);
```

### 5.2 Tabla `clientes`

```sql
CREATE TABLE clientes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad (§5.1)
  nombre              varchar(200) NOT NULL,         -- puede ser solo nombre de pila
  apellido_paterno    varchar(100) NULL,
  apellido_materno    varchar(100) NULL,
  nombre_completo_busqueda text GENERATED ALWAYS AS (
    unaccent(lower(coalesce(nombre, '') || ' ' || coalesce(apellido_paterno, '') || ' ' || coalesce(apellido_materno, '')))
  ) STORED,                                          -- para búsqueda con pg_trgm

  -- Contacto
  telefono            varchar(20) NULL,
  email               citext NULL,

  -- Datos fiscales (necesarios solo si factura)
  rfc                 varchar(13) NULL,
  razon_social        varchar(255) NULL,
  regimen_fiscal      regimen_fiscal_sat NULL,
  codigo_postal_fiscal varchar(5) NULL,
  uso_cfdi_default    uso_cfdi NULL,
  tipo_fiscal         cliente_tipo_fiscal NOT NULL DEFAULT 'EVENTUAL',

  -- Notas (alergias, preferencias)
  notas_internas      text NULL,

  -- Código opcional para identificación rápida
  codigo_cliente      varchar(50) NULL,              -- ej. "CLI-001", o número de tarjeta de cliente del negocio

  -- Estado
  estado              cliente_estado NOT NULL DEFAULT 'ACTIVO',
  motivo_bloqueo      text NULL,
  fecha_bloqueo       timestamptz NULL,
  bloqueado_por       uuid NULL REFERENCES auth.users(id),

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL,

  -- Constraints
  CONSTRAINT rfc_formato_valido CHECK (
    rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  ),
  CONSTRAINT bloqueo_consistente CHECK (
    (estado = 'BLOQUEADO' AND motivo_bloqueo IS NOT NULL) OR estado <> 'BLOQUEADO'
  )
);

CREATE INDEX idx_clientes_tenant ON clientes(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_clientes_telefono ON clientes(tenant_id, telefono) WHERE telefono IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_clientes_rfc ON clientes(tenant_id, rfc) WHERE rfc IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_clientes_email ON clientes(tenant_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_clientes_codigo ON clientes(tenant_id, codigo_cliente) WHERE codigo_cliente IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_clientes_busqueda_trgm ON clientes USING GIN (nombre_completo_busqueda gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_clientes_estado ON clientes(tenant_id, estado) WHERE deleted_at IS NULL;

-- Telefono y RFC deberían ser únicos por tenant (no globales — dos tenants pueden tener al mismo cliente con mismo teléfono)
CREATE UNIQUE INDEX idx_clientes_telefono_unico
  ON clientes(tenant_id, telefono)
  WHERE telefono IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_clientes_rfc_unico
  ON clientes(tenant_id, rfc)
  WHERE rfc IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE clientes IS 'CRM básico. §5 del /core. D20 = sin lealtad/puntos en MVP.';
COMMENT ON COLUMN clientes.nombre_completo_busqueda IS 'Generated column para búsqueda fuzzy con pg_trgm. Lowercase + sin acentos.';
COMMENT ON COLUMN clientes.tipo_fiscal IS 'EVENTUAL = sin RFC (mayoría de QSR). Se requiere datos fiscales solo si factura.';
```

### 5.3 Tabla `direcciones_cliente`

Un cliente puede tener varias direcciones de entrega (§5.7).

```sql
CREATE TABLE direcciones_cliente (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Etiqueta humano-legible
  etiqueta            varchar(50) NOT NULL DEFAULT 'Principal',  -- "Casa", "Oficina", "Mamá"

  -- Datos de la dirección (§5.7)
  calle               varchar(255) NOT NULL,
  numero_exterior     varchar(20) NOT NULL,
  numero_interior     varchar(20) NULL,
  colonia             varchar(150) NOT NULL,
  codigo_postal       varchar(5) NOT NULL,
  ciudad              varchar(100) NOT NULL,
  estado_geo          varchar(50) NOT NULL,
  pais                varchar(50) NOT NULL DEFAULT 'México',

  -- Referencias y notas
  referencias         text NULL,                     -- "timbres, color casa, perro"
  notas_repartidor    text NULL,

  -- Geolocalización (futuro, capturado en mapa)
  geo_lat             numeric(9,6) NULL,
  geo_lng             numeric(9,6) NULL,

  -- Vigencia
  es_principal        boolean NOT NULL DEFAULT false,
  activa              boolean NOT NULL DEFAULT true,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL
);

CREATE INDEX idx_direcciones_cliente ON direcciones_cliente(cliente_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_direcciones_tenant ON direcciones_cliente(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_direcciones_cp ON direcciones_cliente(tenant_id, codigo_postal) WHERE deleted_at IS NULL;

-- Solo una dirección principal por cliente
CREATE UNIQUE INDEX idx_direcciones_principal_unica
  ON direcciones_cliente(cliente_id)
  WHERE es_principal = true AND deleted_at IS NULL;

COMMENT ON TABLE direcciones_cliente IS 'Direcciones de entrega del cliente. §5.7 del /core.';
```

### 5.4 RLS y triggers

```sql
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY clientes_tenant ON clientes FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE direcciones_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY direcciones_tenant ON direcciones_cliente FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_direcciones_updated_at
  BEFORE UPDATE ON direcciones_cliente
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 5.5 Trigger: auditoría de bloqueo de cliente

```sql
CREATE OR REPLACE FUNCTION trg_audit_cliente_bloqueo() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id,
      NEW.updated_by,
      'CATALOGO',
      CASE
        WHEN NEW.estado = 'BLOQUEADO' THEN 'cliente.bloqueado'
        ELSE 'cliente.desbloqueado'
      END,
      'cliente',
      NEW.id,
      jsonb_build_object(
        'estado_anterior', OLD.estado,
        'estado_nuevo', NEW.estado,
        'motivo', NEW.motivo_bloqueo,
        'nombre_cliente', NEW.nombre
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clientes_audit_bloqueo
  AFTER UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trg_audit_cliente_bloqueo();
```

### 5.6 Búsqueda de cliente (función helper)

Refleja el flujo de §5.3 del `/core`: buscar por nombre parcial, teléfono o RFC.

```sql
CREATE OR REPLACE FUNCTION buscar_clientes(
  p_tenant_id uuid,
  p_query text,
  p_limit integer DEFAULT 10
) RETURNS TABLE (
  id uuid,
  nombre varchar,
  telefono varchar,
  rfc varchar,
  score real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    (c.nombre || ' ' || coalesce(c.apellido_paterno, '') || ' ' || coalesce(c.apellido_materno, ''))::varchar AS nombre,
    c.telefono,
    c.rfc,
    GREATEST(
      similarity(c.nombre_completo_busqueda, unaccent(lower(p_query))),
      CASE WHEN c.telefono ILIKE '%' || p_query || '%' THEN 0.9 ELSE 0 END,
      CASE WHEN c.rfc ILIKE p_query || '%' THEN 0.95 ELSE 0 END,
      CASE WHEN c.codigo_cliente = p_query THEN 1.0 ELSE 0 END
    )::real AS score
  FROM clientes c
  WHERE c.tenant_id = p_tenant_id
    AND c.deleted_at IS NULL
    AND c.estado <> 'BLOQUEADO'
    AND (
      c.nombre_completo_busqueda % unaccent(lower(p_query))
      OR c.telefono ILIKE '%' || p_query || '%'
      OR c.rfc ILIKE p_query || '%'
      OR c.codigo_cliente = p_query
    )
  ORDER BY score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION buscar_clientes IS 'Búsqueda fuzzy de clientes. §5.3 del /core. Usa pg_trgm + similarity.';
```

> **Sobre el histórico del cliente (§5.2):** las métricas (total de tickets, monto comprado, último pedido, productos favoritos, etc.) NO se almacenan en `clientes`. Se calculan **on-demand** desde la tabla `tickets` (Parte 1C) vía vistas materializadas o queries directas. Esto evita inconsistencias entre stock denormalizado y realidad, a costa de queries más costosas. Si en Fase 3+ se vuelve cuello de botella, se introduce `clientes_metricas_cache` actualizada por trigger.

---

## 6. Esquema: Promociones automáticas

Configuración de reglas de descuento automático (§14.4, §14.6 del `/core`). La **aplicación** de la promoción a un ticket concreto se modelará en Parte 1C; aquí solo está la definición.

### 6.1 Enums asociados

```sql
-- Tipo de promoción
CREATE TYPE promocion_tipo AS ENUM (
  'PORCENTAJE',         -- descuento N% sobre subtotal o ítem
  'MONTO_FIJO',         -- descuento $X sobre subtotal o ítem
  'PRECIO_ESPECIAL',    -- override de precio del producto a $X
  'COMPRA_X_LLEVA_Y',   -- 2x1, 3x2, etc.
  'COMBO_PAQUETE',      -- N productos a precio fijo combinado
  'CORTESIA_TOTAL'      -- 100% off — útil para "primer pedido del día gratis"
);

-- Estado de la promoción
CREATE TYPE promocion_estado AS ENUM (
  'ACTIVA',
  'PAUSADA',
  'EXPIRADA',
  'AGOTADA'             -- alcanzó el límite máximo de usos totales
);

-- Alcance: ¿a qué se aplica?
CREATE TYPE promocion_alcance AS ENUM (
  'TICKET_COMPLETO',
  'PRODUCTO',
  'CATEGORIA'
);
```

### 6.2 Tabla `promociones`

```sql
CREATE TABLE promociones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  nombre              varchar(150) NOT NULL,          -- "Martes 2x1 hamburguesas", "Happy Hour 6-8 PM"
  descripcion         text NULL,                      -- visible al cajero y en el ticket
  codigo              varchar(50) NULL,               -- si es cupón, código a teclear

  -- Tipo y alcance
  tipo                promocion_tipo NOT NULL,
  alcance             promocion_alcance NOT NULL,

  -- Valor (depende del tipo)
  valor_porcentaje    numeric(5,2) NULL CHECK (valor_porcentaje IS NULL OR (valor_porcentaje > 0 AND valor_porcentaje <= 100)),
  valor_monto_mxn     numeric(12,2) NULL CHECK (valor_monto_mxn IS NULL OR valor_monto_mxn >= 0),
  precio_especial_mxn numeric(12,2) NULL CHECK (precio_especial_mxn IS NULL OR precio_especial_mxn >= 0),

  -- Para tipo COMPRA_X_LLEVA_Y
  cantidad_compra     integer NULL CHECK (cantidad_compra IS NULL OR cantidad_compra >= 1),
  cantidad_lleva      integer NULL CHECK (cantidad_lleva IS NULL OR cantidad_lleva >= 1),

  -- Para tipo COMBO_PAQUETE
  precio_combo_mxn    numeric(12,2) NULL,

  -- Condiciones de aplicación como JSONB (D29)
  -- Schema documentado abajo en §6.4
  condiciones         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Límites de uso
  max_usos_total      integer NULL CHECK (max_usos_total IS NULL OR max_usos_total > 0),
  max_usos_cliente    integer NULL CHECK (max_usos_cliente IS NULL OR max_usos_cliente > 0),
  usos_actuales       integer NOT NULL DEFAULT 0 CHECK (usos_actuales >= 0),

  -- No acumulación
  no_acumulable_con   uuid[] NOT NULL DEFAULT '{}',   -- IDs de otras promociones con las que no combina

  -- Vigencia general
  fecha_inicio        timestamptz NOT NULL DEFAULT now(),
  fecha_fin           timestamptz NULL,               -- NULL = vigencia indefinida

  -- Prioridad: cuando varias aplican, ¿cuál gana?
  prioridad           integer NOT NULL DEFAULT 0,     -- mayor número = mayor prioridad

  -- Estado
  estado              promocion_estado NOT NULL DEFAULT 'ACTIVA',

  -- Configuración adicional
  visible_en_ticket   boolean NOT NULL DEFAULT true,  -- imprimir línea "Promoción aplicada: ..."
  requiere_cliente_identificado boolean NOT NULL DEFAULT false,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  -- Constraints de coherencia tipo↔valor
  CONSTRAINT valor_consistente CHECK (
    (tipo = 'PORCENTAJE' AND valor_porcentaje IS NOT NULL AND valor_monto_mxn IS NULL AND precio_especial_mxn IS NULL AND precio_combo_mxn IS NULL)
    OR (tipo = 'MONTO_FIJO' AND valor_monto_mxn IS NOT NULL AND valor_porcentaje IS NULL AND precio_especial_mxn IS NULL AND precio_combo_mxn IS NULL)
    OR (tipo = 'PRECIO_ESPECIAL' AND precio_especial_mxn IS NOT NULL)
    OR (tipo = 'COMPRA_X_LLEVA_Y' AND cantidad_compra IS NOT NULL AND cantidad_lleva IS NOT NULL AND cantidad_compra >= cantidad_lleva)
    OR (tipo = 'COMBO_PAQUETE' AND precio_combo_mxn IS NOT NULL)
    OR (tipo = 'CORTESIA_TOTAL')
  ),
  CONSTRAINT vigencia_valida CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX idx_promociones_tenant ON promociones(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_promociones_activas ON promociones(tenant_id, estado) WHERE estado = 'ACTIVA' AND deleted_at IS NULL;
CREATE INDEX idx_promociones_codigo ON promociones(tenant_id, codigo) WHERE codigo IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_promociones_vigencia ON promociones(tenant_id, fecha_inicio, fecha_fin) WHERE estado = 'ACTIVA' AND deleted_at IS NULL;
CREATE INDEX idx_promociones_condiciones ON promociones USING GIN (condiciones);

COMMENT ON TABLE promociones IS 'Reglas de descuento automático. §14.6 del /core. Aplicación a tickets concretos se modela en Parte 1C.';
```

### 6.3 Tabla `promociones_productos`

Qué productos o categorías están afectados por la promoción.

```sql
CREATE TABLE promociones_productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  promocion_id        uuid NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,

  -- Uno de los dos: producto o categoría (no ambos)
  producto_id         uuid NULL REFERENCES productos(id) ON DELETE CASCADE,
  categoria_id        uuid NULL REFERENCES categorias(id) ON DELETE CASCADE,

  -- ¿Es un producto que se DEBE incluir, o un producto donde se APLICA el descuento?
  -- Útil para COMBO_PAQUETE: producto_obligatorio=true (qué debe haber en el ticket)
  -- Para PORCENTAJE/MONTO_FIJO sobre productos específicos: producto_obligatorio=false (a qué se aplica)
  obligatorio_para_activar boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT producto_xor_categoria CHECK (
    (producto_id IS NOT NULL AND categoria_id IS NULL)
    OR (producto_id IS NULL AND categoria_id IS NOT NULL)
  )
);

CREATE INDEX idx_promo_prod_promocion ON promociones_productos(promocion_id);
CREATE INDEX idx_promo_prod_producto ON promociones_productos(producto_id) WHERE producto_id IS NOT NULL;
CREATE INDEX idx_promo_prod_categoria ON promociones_productos(categoria_id) WHERE categoria_id IS NOT NULL;
CREATE INDEX idx_promo_prod_tenant ON promociones_productos(tenant_id);

COMMENT ON TABLE promociones_productos IS 'Productos/categorías afectados por la promoción.';
```

### 6.4 Schema documentado para `promociones.condiciones`

Por D29, las condiciones se almacenan como `jsonb`. Aquí el schema acordado:

```jsonc
{
  // Restricción por rango horario (Happy Hour)
  "horario": {
    "dias_semana": [1, 2, 3, 4, 5],     // 0=Domingo, 6=Sábado. Ausente = todos.
    "hora_inicio": "18:00",              // formato HH:MM. Hora local del tenant.
    "hora_fin": "20:00"
  },

  // Restricción por monto del ticket
  "monto_ticket": {
    "minimo_mxn": 500.00,                // se aplica solo si subtotal >= esto
    "maximo_mxn": null                   // null = sin límite superior
  },

  // Restricción por modo de servicio
  "modos_servicio_permitidos": ["COMER_AQUI", "PARA_LLEVAR"],  // ausente = todos

  // Restricción por método de pago
  "metodos_pago_permitidos": ["TRANSFERENCIA"],

  // Restricción por sucursal
  "sucursales_aplicables": ["uuid-1", "uuid-2"],  // ausente/vacío = todas

  // Restricción CRM
  "cliente": {
    "tipo": "REGISTRADO",                // REGISTRADO, EVENTUAL, ESPECIFICO
    "tags": ["VIP"],                     // futuro, con CRM Pro
    "ids_especificos": ["uuid-..."]      // promoción solo para cliente X
  },

  // Restricción por cupón
  "cupon": {
    "requiere_codigo": true,
    "codigo_unico_por_uso": false        // true = código de un solo uso (cancela tras canjear)
  },

  // Combinabilidad
  "combina_con_otras_promociones": false,

  // Por modo de canal
  "canales_permitidos": ["POS", "APP_PROPIA"]   // futuro, no MVP
}
```

> **Aplicación de condiciones:** la evaluación se hace en la capa de aplicación (servicios) leyendo este JSON. Una función `aplicar_promociones_a_ticket(ticket_id)` en Parte 1C iterará las promociones activas, evaluará condiciones, y devolverá las aplicables. Validaciones a nivel BD se limitan al schema básico (tipo, valor coherentes).

### 6.5 RLS y triggers

```sql
ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;
CREATE POLICY promociones_tenant ON promociones FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE promociones_productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY promo_prod_tenant ON promociones_productos FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_promociones_updated_at
  BEFORE UPDATE ON promociones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 6.6 Trigger: auto-expirar promociones

```sql
CREATE OR REPLACE FUNCTION trg_expirar_promociones_vencidas() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si se está leyendo una promoción ya vencida pero aún ACTIVA, marcarla EXPIRADA
  UPDATE promociones
  SET estado = 'EXPIRADA', updated_at = now()
  WHERE id = NEW.id
    AND fecha_fin IS NOT NULL
    AND fecha_fin < now()
    AND estado = 'ACTIVA';
  RETURN NEW;
END;
$$;

-- Se ejecuta vía batch nocturno desde una Edge Function, NO trigger por fila
-- Alternativa: cron job de Supabase que ejecuta:
-- UPDATE promociones SET estado='EXPIRADA' WHERE fecha_fin < now() AND estado='ACTIVA';
```

> **Decisión operativa:** no usamos trigger sino un cron diario (a las 03:00 igual que cierre de día). Esto evita overhead de un trigger en cada SELECT.

---

## 7. Esquema: Marcas virtuales (Dark Kitchen)

Sub-marcas que comparten cocina física dentro de un mismo tenant del vertical `DARK_KITCHEN`. Activado solo cuando el feature flag `multi_marca` está on.

### 7.1 Tabla `marcas_virtuales`

```sql
CREATE TABLE marcas_virtuales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad comercial
  codigo              varchar(50) NOT NULL,          -- 'BURGERPUNK', 'TACOSDELBAJIO'
  nombre              varchar(150) NOT NULL,          -- 'BurgerPunk', 'Tacos del Bajío'
  descripcion         text NULL,

  -- Datos fiscales (puede ser distinto del tenant principal)
  -- Útil cuando el operador factura por separado por cada marca
  rfc                 varchar(13) NULL,
  razon_social        varchar(255) NULL,
  regimen_fiscal      regimen_fiscal_sat NULL,

  -- Branding
  logo_url            text NULL,
  color_primario_hex  varchar(7) NULL,
  color_secundario_hex varchar(7) NULL,

  -- Apps externas asociadas (informativo; integraciones reales en Parte 1D)
  -- Estructura ejemplo: { "rappi": "store_id_123", "ubereats": "..." }
  apps_externas_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,

  CONSTRAINT codigo_marca_unico UNIQUE (tenant_id, codigo),
  CONSTRAINT rfc_formato_valido CHECK (
    rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
  )
);

CREATE INDEX idx_marcas_tenant ON marcas_virtuales(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_marcas_activas ON marcas_virtuales(tenant_id, activa) WHERE deleted_at IS NULL;

COMMENT ON TABLE marcas_virtuales IS 'Sub-marcas dentro de un tenant DK. FK opcional desde productos.marca_virtual_id. D25.';
COMMENT ON COLUMN marcas_virtuales.rfc IS 'Útil si el operador factura por marca separada. Puede ser distinto al RFC del tenant.';
```

### 7.2 Foreign key tardío en `productos`

```sql
ALTER TABLE productos
  ADD CONSTRAINT fk_productos_marca_virtual
  FOREIGN KEY (marca_virtual_id) REFERENCES marcas_virtuales(id) ON DELETE SET NULL;
```

> **Reglas operativas (validadas en aplicación, no en BD):**
> - Si `tenant.vertical_principal = 'DARK_KITCHEN'` y feature flag `multi_marca` está on → `productos.marca_virtual_id` es obligatorio para nuevos productos
> - Si NO es Dark Kitchen → `marca_virtual_id` siempre NULL (ignorado)
> - Productos sin marca virtual aparecen en reportes como "Sin marca asignada"

### 7.3 RLS y triggers

```sql
ALTER TABLE marcas_virtuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY marcas_tenant ON marcas_virtuales FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_marcas_updated_at
  BEFORE UPDATE ON marcas_virtuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 8. Esquema: Módulo Inventario y Recetas

Implementación completa del módulo opcional definido en Parte IX del `/core` (§31-§37). Las tablas existen siempre; su uso depende del feature flag `modulo_inventario_activo` por tenant.

### 8.1 Enums asociados

```sql
-- Categoría conceptual del insumo (para reportes y filtros)
CREATE TYPE insumo_categoria AS ENUM (
  'CARNICOS',
  'LACTEOS',
  'VEGETALES',
  'FRUTAS',
  'PANIFICACION',
  'ABARROTES',
  'BEBIDAS',
  'CONDIMENTOS',
  'CONGELADOS',
  'EMPAQUE',
  'LIMPIEZA',
  'OTROS'
);

-- Método de valuación del insumo (§35.1)
CREATE TYPE valuacion_metodo AS ENUM (
  'PROMEDIO_PONDERADO',         -- default
  'ULTIMO_COSTO'
);

-- Estado del insumo
CREATE TYPE insumo_estado AS ENUM (
  'ACTIVO',
  'PAUSADO'                     -- no aparece en recetas nuevas pero conserva histórico
);

-- Tipo de movimiento de inventario (§34.1 del /core)
CREATE TYPE movimiento_inventario_tipo AS ENUM (
  'ENTRADA_COMPRA',             -- recepción de mercancía del proveedor (D31)
  'SALIDA_VENTA',               -- descuento automático por venta
  'SALIDA_MODIFICADOR_EXTRA',   -- descuento por modificador "extra"
  'REVERSA_CANCELACION',        -- ticket pagado cancelado, insumos vuelven
  'MERMA',                      -- producto echado a perder, derrame, robo
  'AJUSTE_POSITIVO',            -- ajuste por conteo físico (sube stock)
  'AJUSTE_NEGATIVO',            -- ajuste por conteo físico (baja stock)
  'TRANSFERENCIA_SALIDA',       -- transferencia a otra sucursal
  'TRANSFERENCIA_ENTRADA',      -- recepción de transferencia
  'DEVOLUCION_PROVEEDOR'        -- devolución a proveedor
);

-- Severidad de alerta de stock
CREATE TYPE alerta_severidad AS ENUM (
  'AMARILLA',                   -- advertencia: stock bajo
  'ROJA',                       -- crítica: compra urgente
  'AGOTADO'                     -- nivel cero, productos vinculados auto-agotados
);
```

### 8.2 Tabla `unidades_medida`

Catálogo de unidades. Filas predefinidas + tenant puede agregar custom.

```sql
CREATE TABLE unidades_medida (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = sistema

  codigo              varchar(20) NOT NULL,           -- 'g', 'kg', 'ml', 'l', 'pza', 'oz', 'lb'
  nombre              varchar(50) NOT NULL,           -- 'Gramo', 'Kilogramo', 'Mililitro', 'Litro', 'Pieza'
  simbolo             varchar(10) NOT NULL,           -- 'g', 'kg', 'ml', 'L', 'pza'

  -- Tipo dimensional (para validar conversiones)
  dimension           varchar(20) NOT NULL CHECK (dimension IN (
    'MASA', 'VOLUMEN', 'LONGITUD', 'CANTIDAD', 'TIEMPO', 'OTRO'
  )),

  -- Si es la unidad "base" de su dimensión (las conversiones se hacen vía la unidad base)
  es_unidad_base      boolean NOT NULL DEFAULT false,

  es_sistema          boolean NOT NULL DEFAULT false,  -- inalterable
  activa              boolean NOT NULL DEFAULT true,
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unidad_codigo_unica EXCLUDE (
    codigo WITH =,
    tenant_id WITH IS NOT DISTINCT FROM
  )
);

CREATE INDEX idx_unidades_dimension ON unidades_medida(dimension) WHERE activa = true;
CREATE INDEX idx_unidades_tenant ON unidades_medida(tenant_id) WHERE tenant_id IS NOT NULL;

-- Solo una unidad base por dimensión a nivel sistema
CREATE UNIQUE INDEX idx_unidades_base_unica_sistema
  ON unidades_medida(dimension)
  WHERE es_unidad_base = true AND es_sistema = true;

COMMENT ON TABLE unidades_medida IS 'Catálogo de unidades. Sistema predefine las comunes; tenant puede agregar custom.';
```

### 8.3 Tabla `conversiones_unidades`

Factor de conversión entre unidades de la misma dimensión.

```sql
CREATE TABLE conversiones_unidades (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NULL REFERENCES tenants(id) ON DELETE CASCADE,

  unidad_origen_id    uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,
  unidad_destino_id   uuid NOT NULL REFERENCES unidades_medida(id) ON DELETE RESTRICT,

  -- Cantidad en origen × factor = cantidad en destino
  -- Ejemplo: 1 kg × 1000 = 1000 g
  factor              numeric(20,10) NOT NULL CHECK (factor > 0),

  es_sistema          boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversion_no_misma_unidad CHECK (unidad_origen_id <> unidad_destino_id),
  CONSTRAINT conversion_unica EXCLUDE (
    unidad_origen_id WITH =,
    unidad_destino_id WITH =,
    tenant_id WITH IS NOT DISTINCT FROM
  )
);

CREATE INDEX idx_conversiones_origen ON conversiones_unidades(unidad_origen_id);
CREATE INDEX idx_conversiones_destino ON conversiones_unidades(unidad_destino_id);

COMMENT ON TABLE conversiones_unidades IS 'Factor de conversión entre unidades. Ej: kg→g factor=1000. D24.';
```

### 8.4 Tabla `insumos`

Materia prima que el negocio compra (§32 del `/core`).

```sql
CREATE TABLE insumos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad
  nombre              varchar(200) NOT NULL,         -- "Pan de hamburguesa", "Carne molida 80/20"
  descripcion         text NULL,
  codigo_interno      varchar(50) NULL,
  codigo_barras       varchar(50) NULL,

  -- Categorización
  categoria           insumo_categoria NOT NULL DEFAULT 'OTROS',

  -- Unidad de medida del insumo (define cómo se almacena Y cómo se consume en recetas)
  unidad_medida_id    uuid NOT NULL REFERENCES unidades_medida(id),

  -- Costeo (D30 — costo unitario actual en `insumos`)
  costo_unitario_mxn  numeric(14,6) NOT NULL DEFAULT 0 CHECK (costo_unitario_mxn >= 0),
  -- 6 decimales porque "carne $180/kg = $0.18/g" pero "sal $5/kg = $0.005/g"
  metodo_valuacion    valuacion_metodo NOT NULL DEFAULT 'PROMEDIO_PONDERADO',

  -- Configuración de stock
  stock_minimo_global numeric(14,3) NULL,            -- alerta amarilla
  stock_critico_global numeric(14,3) NULL,           -- alerta roja
  stock_maximo_global numeric(14,3) NULL,            -- info para compras

  -- Estado
  estado              insumo_estado NOT NULL DEFAULT 'ACTIVO',

  -- Notas y metadatos
  proveedor_preferido_texto varchar(255) NULL,       -- D26 — texto libre, sin catálogo
  notas_internas      text NULL,                     -- "Comprar en mercado los lunes"
  fecha_caducidad_promedio_dias integer NULL,        -- referencia informativa

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id),
  deleted_at          timestamptz NULL,
  deleted_by          uuid REFERENCES auth.users(id) NULL,

  CONSTRAINT codigo_insumo_unico UNIQUE (tenant_id, codigo_interno) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT stocks_coherentes CHECK (
    (stock_critico_global IS NULL OR stock_minimo_global IS NULL OR stock_critico_global <= stock_minimo_global)
  )
);

CREATE INDEX idx_insumos_tenant ON insumos(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_insumos_categoria ON insumos(tenant_id, categoria) WHERE deleted_at IS NULL;
CREATE INDEX idx_insumos_estado ON insumos(tenant_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX idx_insumos_nombre_trgm ON insumos USING GIN (nombre gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_insumos_codigo_barras ON insumos(tenant_id, codigo_barras) WHERE codigo_barras IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE insumos IS 'Materia prima. §32 del /core. Stock por sucursal vive en insumo_stock_sucursal (D21).';
COMMENT ON COLUMN insumos.costo_unitario_mxn IS 'Costo actual por 1 unidad de medida. 6 decimales para insumos baratos (sal, aceite).';
COMMENT ON COLUMN insumos.stock_minimo_global IS 'Umbral default. Cada sucursal puede override en insumo_stock_sucursal.';
```

### 8.5 Tabla `insumo_stock_sucursal`

Stock real por sucursal (D21). Una fila por insumo × sucursal.

```sql
CREATE TABLE insumo_stock_sucursal (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,

  -- Stock actual (D32 — permite negativos)
  stock_actual        numeric(14,3) NOT NULL DEFAULT 0,
  stock_negativo_flag boolean NOT NULL DEFAULT false,  -- TRUE si alguna vez fue negativo (para alerta)

  -- Overrides de umbrales por sucursal (NULL = hereda de insumos.*_global)
  stock_minimo        numeric(14,3) NULL,
  stock_critico       numeric(14,3) NULL,
  stock_maximo        numeric(14,3) NULL,

  -- Última actualización significativa
  fecha_ultimo_movimiento timestamptz NULL,
  fecha_ultimo_conteo_fisico timestamptz NULL,

  -- Estado de alerta actual (denormalizado para queries rápidas en dashboard)
  alerta_actual       alerta_severidad NULL,

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT insumo_sucursal_unico UNIQUE (insumo_id, sucursal_id)
);

CREATE INDEX idx_insumo_stock_sucursal ON insumo_stock_sucursal(sucursal_id);
CREATE INDEX idx_insumo_stock_insumo ON insumo_stock_sucursal(insumo_id);
CREATE INDEX idx_insumo_stock_alertas ON insumo_stock_sucursal(tenant_id, sucursal_id, alerta_actual) WHERE alerta_actual IS NOT NULL;
CREATE INDEX idx_insumo_stock_negativo ON insumo_stock_sucursal(tenant_id) WHERE stock_negativo_flag = true;

COMMENT ON TABLE insumo_stock_sucursal IS 'Stock por insumo × sucursal (D21). Una sucursal con stock independiente de otras.';
COMMENT ON COLUMN insumo_stock_sucursal.stock_negativo_flag IS 'Flag persistente: TRUE si ha estado negativo. Limpia al hacer ajuste por conteo físico.';
```

### 8.6 Tabla `recetas`

Cabecera de receta de un producto (§33 del `/core`).

```sql
CREATE TABLE recetas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,

  -- Versión (al cambiar receta, se incrementa; permite reportar costos históricos)
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),

  -- Costo total calculado (snapshot — se recalcula vía trigger cuando cambian componentes o costos)
  costo_total_mxn     numeric(12,4) NOT NULL DEFAULT 0,

  -- Notas de preparación (texto para uso del chef, no se imprime en comanda)
  notas_preparacion   text NULL,

  -- Estado
  activa              boolean NOT NULL DEFAULT true,   -- false = producto sin receta (§33.4 opción B)

  -- Auditoría
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_recetas_tenant ON recetas(tenant_id);
CREATE INDEX idx_recetas_producto ON recetas(producto_id);

COMMENT ON TABLE recetas IS 'Cabecera de receta. 1:1 con producto. Sin fila = producto sin receta (§33.4).';
COMMENT ON COLUMN recetas.costo_total_mxn IS 'Snapshot. Recalculado por trigger cuando cambia receta_componentes o insumos.costo_unitario.';
```

### 8.7 Tabla `receta_componentes`

Detalle de receta: insumos y cantidades (BOM clásico, D22).

```sql
CREATE TABLE receta_componentes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  receta_id           uuid NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,

  -- Cantidad en la unidad de medida del insumo
  cantidad            numeric(14,3) NOT NULL CHECK (cantidad > 0),

  -- Indica si este componente es "critico" para producir el producto
  -- Si el insumo está bajo, el producto se auto-agota (§36.2)
  es_critico          boolean NOT NULL DEFAULT true,

  -- Notas
  notas               text NULL,

  -- Orden de presentación en UI
  orden_visualizacion integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT receta_insumo_unico UNIQUE (receta_id, insumo_id)
);

CREATE INDEX idx_componentes_receta ON receta_componentes(receta_id);
CREATE INDEX idx_componentes_insumo ON receta_componentes(insumo_id);
CREATE INDEX idx_componentes_criticos ON receta_componentes(insumo_id) WHERE es_critico = true;

COMMENT ON TABLE receta_componentes IS 'Insumos y cantidades de cada receta. D22 = FK solo a insumos, no a sub-productos.';
```

### 8.8 Tabla `modificador_componentes`

Mini-receta de insumos adicionales que consume una **opción de modificador** tipo EXTRA (§33.3).

```sql
CREATE TABLE modificador_componentes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  opcion_modificador_id uuid NOT NULL REFERENCES opciones_modificador(id) ON DELETE CASCADE,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,

  cantidad            numeric(14,3) NOT NULL CHECK (cantidad > 0),
  notas               text NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT modificador_insumo_unico UNIQUE (opcion_modificador_id, insumo_id)
);

CREATE INDEX idx_mod_componentes_opcion ON modificador_componentes(opcion_modificador_id);
CREATE INDEX idx_mod_componentes_insumo ON modificador_componentes(insumo_id);

COMMENT ON TABLE modificador_componentes IS 'Insumos adicionales consumidos por opciones de modificador EXTRA. §33.3 del /core.';
```

### 8.9 Tabla `movimientos_inventario`

Tabla universal de movimientos (D23). Mismo patrón que `movimientos_caja` de Parte 1A.

```sql
CREATE TABLE movimientos_inventario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,

  -- Tipo y dirección
  tipo                movimiento_inventario_tipo NOT NULL,
  cantidad            numeric(14,3) NOT NULL,        -- positivo siempre; el signo lo determina el tipo

  -- Costos (para entradas: costo unitario de la entrada; para salidas: costo unitario al momento)
  costo_unitario_mxn  numeric(14,6) NOT NULL DEFAULT 0,
  costo_total_mxn     numeric(14,4) GENERATED ALWAYS AS (cantidad * costo_unitario_mxn) STORED,

  -- Stock antes y después (snapshot — facilita debugging)
  stock_antes         numeric(14,3) NOT NULL,
  stock_despues       numeric(14,3) NOT NULL,

  -- Trazabilidad
  fecha               timestamptz NOT NULL DEFAULT now(),
  dia_contable        date NOT NULL,                 -- D7 — heredada del turno si aplica
  usuario_id          uuid NULL REFERENCES auth.users(id),
  usuario_autorizo_id uuid NULL REFERENCES auth.users(id),
  autorizacion_pin_id uuid NULL REFERENCES autorizaciones_pin(id),

  -- Para ENTRADA_COMPRA (D31)
  proveedor_texto     varchar(255) NULL,
  factura_referencia  varchar(100) NULL,

  -- Para SALIDA_VENTA / SALIDA_MODIFICADOR_EXTRA / REVERSA_CANCELACION
  -- (FK al ticket o item del ticket — se agregará en Parte 1C cuando existan)
  ticket_id           uuid NULL,                     -- FK lazy
  ticket_item_id      uuid NULL,                     -- FK lazy

  -- Para MERMA / AJUSTE
  motivo              varchar(100) NULL,             -- 'Caducidad', 'Derrame', 'Conteo físico'
  descripcion         text NULL,

  -- Para TRANSFERENCIA
  sucursal_destino_id uuid NULL REFERENCES sucursales(id),
  transferencia_id    uuid NULL,                     -- agrupa salida+entrada de transferencia

  -- Folio humano-legible (para entrada/salida/transferencia/merma)
  folio               varchar(50) NULL,              -- 'ENT-2026-0034', 'MER-2026-0012'

  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT cantidad_positiva CHECK (cantidad > 0)
);

CREATE INDEX idx_mov_inv_tenant_fecha ON movimientos_inventario(tenant_id, fecha DESC);
CREATE INDEX idx_mov_inv_sucursal_dia ON movimientos_inventario(sucursal_id, dia_contable);
CREATE INDEX idx_mov_inv_insumo ON movimientos_inventario(insumo_id, fecha DESC);
CREATE INDEX idx_mov_inv_tipo ON movimientos_inventario(tenant_id, tipo, fecha DESC);
CREATE INDEX idx_mov_inv_ticket ON movimientos_inventario(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_mov_inv_transferencia ON movimientos_inventario(transferencia_id) WHERE transferencia_id IS NOT NULL;

-- Folio único por sucursal cuando aplica
CREATE UNIQUE INDEX idx_mov_inv_folio_unico
  ON movimientos_inventario(sucursal_id, folio)
  WHERE folio IS NOT NULL;

COMMENT ON TABLE movimientos_inventario IS 'Bitácora universal de cambios en stock. §34 del /core. D23.';
COMMENT ON COLUMN movimientos_inventario.cantidad IS 'SIEMPRE positivo. El tipo determina si suma o resta del stock.';
COMMENT ON COLUMN movimientos_inventario.transferencia_id IS 'Mismo UUID en SALIDA + ENTRADA de una transferencia entre sucursales (§34.7).';
```

### 8.10 Tabla `alertas_inventario`

Registro persistente de alertas activas para el dashboard del admin (§36.4).

```sql
CREATE TABLE alertas_inventario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sucursal_id         uuid NOT NULL REFERENCES sucursales(id) ON DELETE RESTRICT,
  insumo_id           uuid NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,

  -- Severidad
  severidad           alerta_severidad NOT NULL,

  -- Snapshot
  stock_al_alertar    numeric(14,3) NOT NULL,
  umbral_disparador   numeric(14,3) NOT NULL,

  -- Productos afectados (para alerta tipo AGOTADO)
  productos_afectados_ids uuid[] NOT NULL DEFAULT '{}',

  -- Estado
  activa              boolean NOT NULL DEFAULT true,
  fecha_disparo       timestamptz NOT NULL DEFAULT now(),
  fecha_atendida      timestamptz NULL,
  atendida_por        uuid NULL REFERENCES auth.users(id),
  notas_atencion      text NULL,

  -- Notificación
  notificado_push     boolean NOT NULL DEFAULT false,
  notificado_email    boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alertas_activas ON alertas_inventario(tenant_id, sucursal_id, activa) WHERE activa = true;
CREATE INDEX idx_alertas_insumo ON alertas_inventario(insumo_id);
CREATE INDEX idx_alertas_severidad ON alertas_inventario(tenant_id, severidad) WHERE activa = true;

COMMENT ON TABLE alertas_inventario IS 'Alertas activas para dashboard. §36 del /core.';
```

### 8.11 RLS y triggers

```sql
ALTER TABLE unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY unidades_lectura ON unidades_medida FOR SELECT
  USING (es_sistema = true OR tenant_id = current_tenant_id());

ALTER TABLE conversiones_unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversiones_lectura ON conversiones_unidades FOR SELECT
  USING (es_sistema = true OR tenant_id = current_tenant_id());

ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY insumos_tenant ON insumos FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE insumo_stock_sucursal ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_tenant ON insumo_stock_sucursal FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE recetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY recetas_tenant ON recetas FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE receta_componentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY componentes_tenant ON receta_componentes FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE modificador_componentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mod_componentes_tenant ON modificador_componentes FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY mov_inv_tenant ON movimientos_inventario FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
-- NO UPDATE (append-only en práctica; ajustes son nuevas filas)

ALTER TABLE alertas_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY alertas_tenant ON alertas_inventario FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Triggers updated_at
CREATE TRIGGER trg_insumos_updated_at BEFORE UPDATE ON insumos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_insumo_stock_updated_at BEFORE UPDATE ON insumo_stock_sucursal FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recetas_updated_at BEFORE UPDATE ON recetas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_componentes_updated_at BEFORE UPDATE ON receta_componentes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mod_componentes_updated_at BEFORE UPDATE ON modificador_componentes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 9. Funciones helper y triggers

Funciones específicas de Parte 1B. Reutilizan los helpers definidos en Parte 1A (`current_tenant_id`, `calcular_dia_contable`, `generar_folio`, `set_updated_at`).

### 9.1 Función `convertir_unidad`

Convierte cantidad entre unidades de la misma dimensión usando `conversiones_unidades`.

```sql
CREATE OR REPLACE FUNCTION convertir_unidad(
  p_cantidad numeric,
  p_unidad_origen_id uuid,
  p_unidad_destino_id uuid
) RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_factor numeric;
  v_dim_origen varchar;
  v_dim_destino varchar;
BEGIN
  -- Caso trivial
  IF p_unidad_origen_id = p_unidad_destino_id THEN
    RETURN p_cantidad;
  END IF;

  -- Verificar misma dimensión
  SELECT dimension INTO v_dim_origen FROM unidades_medida WHERE id = p_unidad_origen_id;
  SELECT dimension INTO v_dim_destino FROM unidades_medida WHERE id = p_unidad_destino_id;

  IF v_dim_origen IS DISTINCT FROM v_dim_destino THEN
    RAISE EXCEPTION 'Unidades de dimensiones incompatibles: % vs %', v_dim_origen, v_dim_destino;
  END IF;

  -- Buscar conversión directa
  SELECT factor INTO v_factor
  FROM conversiones_unidades
  WHERE unidad_origen_id = p_unidad_origen_id
    AND unidad_destino_id = p_unidad_destino_id;

  IF v_factor IS NULL THEN
    -- Buscar conversión inversa
    SELECT 1 / factor INTO v_factor
    FROM conversiones_unidades
    WHERE unidad_origen_id = p_unidad_destino_id
      AND unidad_destino_id = p_unidad_origen_id;
  END IF;

  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'Conversión no definida: % -> %', p_unidad_origen_id, p_unidad_destino_id;
  END IF;

  RETURN p_cantidad * v_factor;
END;
$$;

COMMENT ON FUNCTION convertir_unidad IS 'Convierte cantidad entre unidades de la misma dimensión.';
```

### 9.2 Función `aplicar_movimiento_inventario`

Crea un movimiento, actualiza stock, registra alertas y dispara auto-agotado de productos vinculados. Es la función central del módulo.

```sql
CREATE OR REPLACE FUNCTION aplicar_movimiento_inventario(
  p_tenant_id uuid,
  p_sucursal_id uuid,
  p_insumo_id uuid,
  p_tipo movimiento_inventario_tipo,
  p_cantidad numeric,
  p_costo_unitario_mxn numeric DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_motivo varchar DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_ticket_id uuid DEFAULT NULL,
  p_proveedor_texto varchar DEFAULT NULL,
  p_factura_referencia varchar DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_signo integer;
  v_stock_antes numeric;
  v_stock_despues numeric;
  v_movimiento_id uuid;
  v_dia_contable date;
  v_costo_actual numeric;
  v_metodo valuacion_metodo;
BEGIN
  -- Validar tipo y signo
  v_signo := CASE p_tipo
    WHEN 'ENTRADA_COMPRA' THEN 1
    WHEN 'REVERSA_CANCELACION' THEN 1
    WHEN 'AJUSTE_POSITIVO' THEN 1
    WHEN 'TRANSFERENCIA_ENTRADA' THEN 1
    WHEN 'SALIDA_VENTA' THEN -1
    WHEN 'SALIDA_MODIFICADOR_EXTRA' THEN -1
    WHEN 'MERMA' THEN -1
    WHEN 'AJUSTE_NEGATIVO' THEN -1
    WHEN 'TRANSFERENCIA_SALIDA' THEN -1
    WHEN 'DEVOLUCION_PROVEEDOR' THEN -1
  END;

  -- Obtener stock actual y costo del insumo
  SELECT stock_actual INTO v_stock_antes
  FROM insumo_stock_sucursal
  WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id
  FOR UPDATE;

  IF v_stock_antes IS NULL THEN
    -- Primer movimiento: crear fila de stock
    INSERT INTO insumo_stock_sucursal (tenant_id, insumo_id, sucursal_id, stock_actual)
    VALUES (p_tenant_id, p_insumo_id, p_sucursal_id, 0)
    RETURNING stock_actual INTO v_stock_antes;
  END IF;

  v_stock_despues := v_stock_antes + (v_signo * p_cantidad);

  -- Día contable
  v_dia_contable := calcular_dia_contable(p_tenant_id, now());

  -- Costo unitario: si no se pasó, usar el actual del insumo
  IF p_costo_unitario_mxn IS NULL THEN
    SELECT costo_unitario_mxn INTO v_costo_actual FROM insumos WHERE id = p_insumo_id;
    p_costo_unitario_mxn := v_costo_actual;
  END IF;

  -- Crear movimiento
  INSERT INTO movimientos_inventario (
    tenant_id, sucursal_id, insumo_id, tipo, cantidad,
    costo_unitario_mxn, stock_antes, stock_despues,
    fecha, dia_contable, usuario_id, motivo, descripcion,
    ticket_id, proveedor_texto, factura_referencia
  ) VALUES (
    p_tenant_id, p_sucursal_id, p_insumo_id, p_tipo, p_cantidad,
    p_costo_unitario_mxn, v_stock_antes, v_stock_despues,
    now(), v_dia_contable, p_usuario_id, p_motivo, p_descripcion,
    p_ticket_id, p_proveedor_texto, p_factura_referencia
  ) RETURNING id INTO v_movimiento_id;

  -- Actualizar stock
  UPDATE insumo_stock_sucursal
  SET stock_actual = v_stock_despues,
      stock_negativo_flag = (v_stock_despues < 0) OR stock_negativo_flag,
      fecha_ultimo_movimiento = now(),
      updated_at = now()
  WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id;

  -- Si es ENTRADA_COMPRA, recalcular costo unitario del insumo (D30 — promedio ponderado)
  IF p_tipo = 'ENTRADA_COMPRA' THEN
    SELECT metodo_valuacion INTO v_metodo FROM insumos WHERE id = p_insumo_id;

    IF v_metodo = 'PROMEDIO_PONDERADO' THEN
      -- nuevo_costo = (stock_antes * costo_actual + cantidad * costo_entrada) / stock_despues
      UPDATE insumos
      SET costo_unitario_mxn = CASE
        WHEN v_stock_despues > 0 THEN
          ((v_stock_antes * costo_unitario_mxn) + (p_cantidad * p_costo_unitario_mxn)) / v_stock_despues
        ELSE p_costo_unitario_mxn
      END,
      updated_at = now()
      WHERE id = p_insumo_id;
    ELSIF v_metodo = 'ULTIMO_COSTO' THEN
      UPDATE insumos
      SET costo_unitario_mxn = p_costo_unitario_mxn, updated_at = now()
      WHERE id = p_insumo_id;
    END IF;
  END IF;

  -- Evaluar alertas (función separada)
  PERFORM evaluar_alertas_stock(p_insumo_id, p_sucursal_id);

  -- Recalcular costo de recetas afectadas (función separada)
  IF p_tipo = 'ENTRADA_COMPRA' THEN
    PERFORM recalcular_costo_recetas(p_insumo_id);
  END IF;

  RETURN v_movimiento_id;
END;
$$;

COMMENT ON FUNCTION aplicar_movimiento_inventario IS 'Función central: crea movimiento, actualiza stock, evalúa alertas, recalcula costos. §34 del /core.';
```

### 9.3 Función `evaluar_alertas_stock`

Evalúa el stock actual de un insumo en una sucursal y crea/cierra alertas.

```sql
CREATE OR REPLACE FUNCTION evaluar_alertas_stock(
  p_insumo_id uuid,
  p_sucursal_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock numeric;
  v_minimo numeric;
  v_critico numeric;
  v_severidad alerta_severidad;
  v_tenant_id uuid;
  v_productos_afectados uuid[];
BEGIN
  -- Obtener stock y umbrales (override de sucursal o global del insumo)
  SELECT
    ss.tenant_id,
    ss.stock_actual,
    COALESCE(ss.stock_minimo, i.stock_minimo_global),
    COALESCE(ss.stock_critico, i.stock_critico_global)
  INTO v_tenant_id, v_stock, v_minimo, v_critico
  FROM insumo_stock_sucursal ss
  JOIN insumos i ON i.id = ss.insumo_id
  WHERE ss.insumo_id = p_insumo_id AND ss.sucursal_id = p_sucursal_id;

  -- Determinar severidad
  IF v_stock <= 0 THEN
    v_severidad := 'AGOTADO';
  ELSIF v_critico IS NOT NULL AND v_stock <= v_critico THEN
    v_severidad := 'ROJA';
  ELSIF v_minimo IS NOT NULL AND v_stock <= v_minimo THEN
    v_severidad := 'AMARILLA';
  ELSE
    v_severidad := NULL;
  END IF;

  -- Actualizar denormalizado en insumo_stock_sucursal
  UPDATE insumo_stock_sucursal
  SET alerta_actual = v_severidad
  WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id;

  -- Cerrar alertas activas si ya no aplica
  IF v_severidad IS NULL THEN
    UPDATE alertas_inventario
    SET activa = false, fecha_atendida = now()
    WHERE insumo_id = p_insumo_id AND sucursal_id = p_sucursal_id AND activa = true;
  ELSE
    -- Buscar productos afectados (recetas críticas que usan este insumo)
    SELECT array_agg(DISTINCT r.producto_id)
    INTO v_productos_afectados
    FROM receta_componentes rc
    JOIN recetas r ON r.id = rc.receta_id
    WHERE rc.insumo_id = p_insumo_id AND rc.es_critico = true;

    -- Crear alerta si no existe activa para este nivel
    INSERT INTO alertas_inventario (
      tenant_id, sucursal_id, insumo_id, severidad,
      stock_al_alertar, umbral_disparador, productos_afectados_ids
    )
    SELECT v_tenant_id, p_sucursal_id, p_insumo_id, v_severidad,
           v_stock, COALESCE(v_critico, v_minimo, 0), COALESCE(v_productos_afectados, '{}')
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_inventario
      WHERE insumo_id = p_insumo_id
        AND sucursal_id = p_sucursal_id
        AND severidad = v_severidad
        AND activa = true
    );

    -- Auto-agotar productos si severidad = AGOTADO (§36.2)
    IF v_severidad = 'AGOTADO' AND v_productos_afectados IS NOT NULL THEN
      UPDATE productos
      SET agotado_automatico = true,
          estado = 'AGOTADO',
          motivo_agotado = 'Insumo agotado: ' || (SELECT nombre FROM insumos WHERE id = p_insumo_id),
          updated_at = now()
      WHERE id = ANY(v_productos_afectados)
        AND agotado_manual = false;  -- no toca los que el admin marcó manual
    END IF;

    -- Si insumo vuelve a tener stock, des-agotar productos auto-agotados
    -- (esto se evalúa cuando severidad != AGOTADO)
  END IF;

  -- Restaurar productos si el insumo dejó de estar agotado
  IF v_severidad IS DISTINCT FROM 'AGOTADO' THEN
    UPDATE productos
    SET agotado_automatico = false,
        estado = 'ACTIVO',
        motivo_agotado = NULL,
        updated_at = now()
    WHERE agotado_automatico = true
      AND agotado_manual = false
      AND tenant_id = v_tenant_id
      AND id IN (
        SELECT DISTINCT r.producto_id
        FROM receta_componentes rc
        JOIN recetas r ON r.id = rc.receta_id
        WHERE rc.insumo_id = p_insumo_id AND rc.es_critico = true
      )
      -- Solo si TODOS sus insumos críticos tienen stock
      AND NOT EXISTS (
        SELECT 1
        FROM receta_componentes rc2
        JOIN recetas r2 ON r2.id = rc2.receta_id
        JOIN insumo_stock_sucursal ss2 ON ss2.insumo_id = rc2.insumo_id
        WHERE r2.producto_id = productos.id
          AND rc2.es_critico = true
          AND ss2.sucursal_id = p_sucursal_id
          AND ss2.stock_actual <= 0
      );
  END IF;
END;
$$;

COMMENT ON FUNCTION evaluar_alertas_stock IS 'Evalúa stock vs umbrales y dispara/cierra alertas + auto-agotado de productos. §36 del /core.';
```

### 9.4 Función `recalcular_costo_recetas`

Recalcula el costo total de cada receta que contenga el insumo dado.

```sql
CREATE OR REPLACE FUNCTION recalcular_costo_recetas(
  p_insumo_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE recetas r
  SET costo_total_mxn = subq.nuevo_costo,
      updated_at = now()
  FROM (
    SELECT
      rc.receta_id,
      SUM(rc.cantidad * i.costo_unitario_mxn) AS nuevo_costo
    FROM receta_componentes rc
    JOIN insumos i ON i.id = rc.insumo_id
    WHERE rc.receta_id IN (
      SELECT receta_id FROM receta_componentes WHERE insumo_id = p_insumo_id
    )
    GROUP BY rc.receta_id
  ) subq
  WHERE r.id = subq.receta_id;
END;
$$;

COMMENT ON FUNCTION recalcular_costo_recetas IS 'Recalcula costo_total_mxn de todas las recetas que contengan el insumo dado.';
```

### 9.5 Trigger: recalcular costo de receta al cambiar componentes

```sql
CREATE OR REPLACE FUNCTION trg_recalcular_costo_receta() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_receta_id uuid;
  v_nuevo_costo numeric;
BEGIN
  v_receta_id := COALESCE(NEW.receta_id, OLD.receta_id);

  SELECT COALESCE(SUM(rc.cantidad * i.costo_unitario_mxn), 0)
  INTO v_nuevo_costo
  FROM receta_componentes rc
  JOIN insumos i ON i.id = rc.insumo_id
  WHERE rc.receta_id = v_receta_id;

  UPDATE recetas
  SET costo_total_mxn = v_nuevo_costo, updated_at = now()
  WHERE id = v_receta_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_componentes_recalcular_costo
  AFTER INSERT OR UPDATE OR DELETE ON receta_componentes
  FOR EACH ROW EXECUTE FUNCTION trg_recalcular_costo_receta();
```

### 9.6 Función `descontar_inventario_por_venta`

Llamada desde Parte 1C cuando un ticket pasa a PAGADO. Itera los items y dispara movimientos `SALIDA_VENTA`.

```sql
CREATE OR REPLACE FUNCTION descontar_inventario_por_venta(
  p_ticket_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id uuid;
  v_sucursal_id uuid;
  v_item record;
  v_componente record;
  v_modulo_activo boolean;
BEGIN
  -- Verificar que el módulo está activo
  SELECT t.id, ct.modulo_inventario_activo
  INTO v_tenant_id, v_modulo_activo
  FROM tickets tk
  JOIN tenants t ON t.id = tk.tenant_id
  JOIN configuracion_tenant ct ON ct.tenant_id = t.id
  WHERE tk.id = p_ticket_id;

  IF NOT v_modulo_activo THEN
    RETURN;
  END IF;

  -- Obtener sucursal del ticket
  SELECT sucursal_id INTO v_sucursal_id
  FROM tickets WHERE id = p_ticket_id;

  -- Iterar items del ticket y aplicar receta
  -- (Las tablas tickets y ticket_items se definen en Parte 1C)
  FOR v_item IN
    SELECT ti.id, ti.producto_id, ti.cantidad
    FROM ticket_items ti
    WHERE ti.ticket_id = p_ticket_id
      AND ti.cancelado = false
  LOOP
    -- Insumos de la receta base
    FOR v_componente IN
      SELECT rc.insumo_id, rc.cantidad AS cantidad_unitaria
      FROM receta_componentes rc
      JOIN recetas r ON r.id = rc.receta_id
      WHERE r.producto_id = v_item.producto_id
        AND r.activa = true
    LOOP
      PERFORM aplicar_movimiento_inventario(
        v_tenant_id,
        v_sucursal_id,
        v_componente.insumo_id,
        'SALIDA_VENTA',
        v_componente.cantidad_unitaria * v_item.cantidad,
        NULL,
        NULL,
        NULL,
        'Venta ticket',
        p_ticket_id,
        NULL,
        NULL
      );
    END LOOP;

    -- Insumos de modificadores EXTRA aplicados al item
    -- (La tabla ticket_item_modificadores se definirá en Parte 1C)
    FOR v_componente IN
      SELECT mc.insumo_id, mc.cantidad AS cantidad_unitaria
      FROM ticket_item_modificadores tim
      JOIN opciones_modificador om ON om.id = tim.opcion_modificador_id
      JOIN grupos_modificadores gm ON gm.id = om.grupo_id
      JOIN modificador_componentes mc ON mc.opcion_modificador_id = om.id
      WHERE tim.ticket_item_id = v_item.id
        AND gm.naturaleza = 'EXTRA'
    LOOP
      PERFORM aplicar_movimiento_inventario(
        v_tenant_id,
        v_sucursal_id,
        v_componente.insumo_id,
        'SALIDA_MODIFICADOR_EXTRA',
        v_componente.cantidad_unitaria * v_item.cantidad,
        NULL,
        NULL,
        NULL,
        'Modificador extra',
        p_ticket_id,
        NULL,
        NULL
      );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION descontar_inventario_por_venta IS 'Descuenta insumos al pagar ticket. §34.3 del /core. Se llama desde trigger de tickets en Parte 1C.';
```

> **Importante:** esta función referencia tablas (`tickets`, `ticket_items`, `ticket_item_modificadores`) que se definen en Parte 1C. Cuando Parte 1C ejecute sus migraciones, esta función ya estará compilada y funcionará. PostgreSQL permite funciones con referencias a tablas que aún no existen, siempre que para el momento de ejecución existan.

### 9.7 Trigger: auditoría de cambios de costo

```sql
CREATE OR REPLACE FUNCTION trg_audit_costo_insumo() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.costo_unitario_mxn IS DISTINCT FROM NEW.costo_unitario_mxn THEN
    INSERT INTO auditoria_eventos (
      tenant_id, usuario_id, categoria, evento_codigo,
      entidad_tipo, entidad_id, payload
    ) VALUES (
      NEW.tenant_id,
      NEW.updated_by,
      'CATALOGO',
      'insumo.costo_modificado',
      'insumo',
      NEW.id,
      jsonb_build_object(
        'costo_anterior_mxn', OLD.costo_unitario_mxn,
        'costo_nuevo_mxn', NEW.costo_unitario_mxn,
        'nombre_insumo', NEW.nombre,
        'metodo_valuacion', NEW.metodo_valuacion
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_insumos_audit_costo
  AFTER UPDATE ON insumos
  FOR EACH ROW EXECUTE FUNCTION trg_audit_costo_insumo();
```

---

## 10. Seeds iniciales

### 10.1 Seed de `unidades_medida` sistema

```sql
INSERT INTO unidades_medida (tenant_id, codigo, nombre, simbolo, dimension, es_unidad_base, es_sistema, orden_visualizacion) VALUES
  -- MASA
  (NULL, 'g',   'Gramo',       'g',  'MASA',    true,  true, 1),
  (NULL, 'kg',  'Kilogramo',   'kg', 'MASA',    false, true, 2),
  (NULL, 'mg',  'Miligramo',   'mg', 'MASA',    false, true, 3),
  (NULL, 'oz',  'Onza',        'oz', 'MASA',    false, true, 4),
  (NULL, 'lb',  'Libra',       'lb', 'MASA',    false, true, 5),
  -- VOLUMEN
  (NULL, 'ml',  'Mililitro',   'ml', 'VOLUMEN', true,  true, 10),
  (NULL, 'l',   'Litro',       'L',  'VOLUMEN', false, true, 11),
  (NULL, 'fl_oz', 'Onza fluida', 'fl oz', 'VOLUMEN', false, true, 12),
  (NULL, 'cup', 'Taza',        'tza','VOLUMEN', false, true, 13),
  (NULL, 'tbsp','Cucharada',   'cda','VOLUMEN', false, true, 14),
  (NULL, 'tsp', 'Cucharadita', 'cdta','VOLUMEN',false, true, 15),
  -- CANTIDAD
  (NULL, 'pza', 'Pieza',       'pza','CANTIDAD', true, true, 20),
  (NULL, 'doc', 'Docena',      'doc','CANTIDAD',false, true, 21),
  -- LONGITUD (futuro retail)
  (NULL, 'cm',  'Centímetro',  'cm', 'LONGITUD',true, true, 30),
  (NULL, 'm',   'Metro',       'm',  'LONGITUD',false, true, 31);
```

### 10.2 Seed de `conversiones_unidades` sistema

```sql
-- Helper: insertar conversiones por código (más legible que IDs)
DO $$
DECLARE
  v_g uuid; v_kg uuid; v_mg uuid; v_oz uuid; v_lb uuid;
  v_ml uuid; v_l uuid; v_fl_oz uuid; v_cup uuid; v_tbsp uuid; v_tsp uuid;
  v_pza uuid; v_doc uuid;
  v_cm uuid; v_m uuid;
BEGIN
  SELECT id INTO v_g  FROM unidades_medida WHERE codigo='g'  AND es_sistema=true;
  SELECT id INTO v_kg FROM unidades_medida WHERE codigo='kg' AND es_sistema=true;
  SELECT id INTO v_mg FROM unidades_medida WHERE codigo='mg' AND es_sistema=true;
  SELECT id INTO v_oz FROM unidades_medida WHERE codigo='oz' AND es_sistema=true;
  SELECT id INTO v_lb FROM unidades_medida WHERE codigo='lb' AND es_sistema=true;
  SELECT id INTO v_ml FROM unidades_medida WHERE codigo='ml' AND es_sistema=true;
  SELECT id INTO v_l  FROM unidades_medida WHERE codigo='l'  AND es_sistema=true;
  SELECT id INTO v_fl_oz FROM unidades_medida WHERE codigo='fl_oz' AND es_sistema=true;
  SELECT id INTO v_cup FROM unidades_medida WHERE codigo='cup' AND es_sistema=true;
  SELECT id INTO v_tbsp FROM unidades_medida WHERE codigo='tbsp' AND es_sistema=true;
  SELECT id INTO v_tsp FROM unidades_medida WHERE codigo='tsp' AND es_sistema=true;
  SELECT id INTO v_pza FROM unidades_medida WHERE codigo='pza' AND es_sistema=true;
  SELECT id INTO v_doc FROM unidades_medida WHERE codigo='doc' AND es_sistema=true;
  SELECT id INTO v_cm FROM unidades_medida WHERE codigo='cm' AND es_sistema=true;
  SELECT id INTO v_m  FROM unidades_medida WHERE codigo='m'  AND es_sistema=true;

  -- MASA (base: g)
  INSERT INTO conversiones_unidades (unidad_origen_id, unidad_destino_id, factor, es_sistema) VALUES
    (v_kg, v_g,  1000, true),
    (v_mg, v_g,  0.001, true),
    (v_oz, v_g,  28.3495, true),
    (v_lb, v_g,  453.592, true);

  -- VOLUMEN (base: ml)
  INSERT INTO conversiones_unidades (unidad_origen_id, unidad_destino_id, factor, es_sistema) VALUES
    (v_l, v_ml, 1000, true),
    (v_fl_oz, v_ml, 29.5735, true),
    (v_cup, v_ml, 240, true),
    (v_tbsp, v_ml, 15, true),
    (v_tsp, v_ml, 5, true);

  -- CANTIDAD (base: pza)
  INSERT INTO conversiones_unidades (unidad_origen_id, unidad_destino_id, factor, es_sistema) VALUES
    (v_doc, v_pza, 12, true);

  -- LONGITUD (base: cm)
  INSERT INTO conversiones_unidades (unidad_origen_id, unidad_destino_id, factor, es_sistema) VALUES
    (v_m, v_cm, 100, true);
END $$;
```

### 10.3 Seed de catálogo Knock-Out (placeholder mínimo)

Cuando Fermín entregue la foto del menú, se transcribirá a este formato. Por ahora, una hamburguesa de ejemplo para validar el schema.

```sql
-- Categoría
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
INSERT INTO categorias (tenant_id, nombre, color_hex, orden_visualizacion)
SELECT t.id, 'Hamburguesas', '#FF5733', 1 FROM t;

-- Producto ejemplo: Hamburguesa Clásica
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout'),
     c AS (SELECT id FROM categorias WHERE nombre = 'Hamburguesas' AND tenant_id = (SELECT id FROM t))
INSERT INTO productos (
  tenant_id, nombre, categoria_id, precio_base_mxn,
  clave_sat, unidad_sat, tasa_iva, iva_incluido_en_precio,
  estado, tipo_venta, modos_servicio_disponibles
)
SELECT
  t.id,
  'Hamburguesa Clásica',
  c.id,
  130.00,
  '50202301',  -- Clave SAT: Comidas preparadas - hamburguesas
  'H87',        -- Unidad SAT: Pieza
  16.00,
  true,
  'ACTIVO',
  'UNIDAD',
  ARRAY['PARA_LLEVAR', 'COMER_AQUI', 'DELIVERY_PROPIO']
FROM t, c;

-- Grupo de modificadores: Término de cocción
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout')
INSERT INTO grupos_modificadores (tenant_id, nombre, tipo_seleccion, naturaleza, orden_visualizacion)
SELECT t.id, 'Término de cocción', 'UNICA_OBLIGATORIA', 'PREPARACION', 1 FROM t;

-- Opciones del grupo
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout'),
     g AS (SELECT id FROM grupos_modificadores WHERE nombre = 'Término de cocción' AND tenant_id = (SELECT id FROM t))
INSERT INTO opciones_modificador (tenant_id, grupo_id, nombre, precio_extra_mxn, orden_visualizacion, es_default)
SELECT t.id, g.id, nombre, 0, orden, es_default
FROM t, g, (VALUES
  ('Rojo', 1, false),
  ('Medio', 2, true),
  ('Tres cuartos', 3, false),
  ('Bien cocido', 4, false)
) AS opt(nombre, orden, es_default);

-- Asociar grupo a producto
WITH t AS (SELECT id FROM tenants WHERE codigo = 'knockout'),
     p AS (SELECT id FROM productos WHERE nombre = 'Hamburguesa Clásica' AND tenant_id = (SELECT id FROM t)),
     g AS (SELECT id FROM grupos_modificadores WHERE nombre = 'Término de cocción' AND tenant_id = (SELECT id FROM t))
INSERT INTO productos_grupos_modificadores (tenant_id, producto_id, grupo_id, orden_visualizacion)
SELECT t.id, p.id, g.id, 1 FROM t, p, g;
```

### 10.4 Seed de área de cocina Knock-Out

```sql
WITH s AS (SELECT id, tenant_id FROM sucursales WHERE codigo = 'K')
INSERT INTO areas_cocina (tenant_id, sucursal_id, nombre, tipo, impresora_config, formato_comanda)
SELECT
  s.tenant_id,
  s.id,
  'Cocina principal',
  'COCINA_CALIENTE',
  '{"tipo": "ethernet", "ip": "192.168.1.50", "puerto": 9100, "modelo": "pendiente confirmar"}'::jsonb,
  '{"campos_visibles": ["nombre_producto", "modificadores", "notas", "modo_servicio"], "letra_grande": true, "mostrar_numero_pedido": "GRANDE"}'::jsonb
FROM s;
```

### 10.5 Configuración Knock-Out: inventario OFF en MVP

```sql
-- Knock-Out arranca SIN módulo de inventario activo en MVP
-- (decisión Sesión 6: el control de stock se evalúa después de Fase 1.5)
UPDATE configuracion_tenant
SET modulo_inventario_activo = false
WHERE tenant_id = (SELECT id FROM tenants WHERE codigo = 'knockout');
```

> **Cuando Fermín decida activar inventario:** los seeds de insumos y recetas se generarán a partir de la foto del menú + observación etnográfica. El schema ya está listo.

---

## 11. Estrategia de migraciones (continuación)

Continúa la numeración de Parte 1A. Las migraciones de 1B se aplican **después** de las de 1A (dependen de tenants, sucursales, usuarios, auditoria_eventos).

### 11.1 Estructura de carpetas (continuación)

```
/supabase/migrations/
├── 20260520_000 ... 20260520_900   ← Parte 1A
├── 20260527_300_enums_catalogo.sql
├── 20260527_310_categorias.sql
├── 20260527_320_productos.sql
├── 20260527_330_modificadores.sql
├── 20260527_340_productos_grupos_modificadores.sql
├── 20260527_350_areas_cocina.sql
├── 20260527_360_productos_areas_extra.sql
├── 20260527_370_clientes.sql
├── 20260527_380_direcciones_cliente.sql
├── 20260527_390_promociones.sql
├── 20260527_400_promociones_productos.sql
├── 20260527_410_marcas_virtuales.sql
├── 20260527_420_unidades_medida.sql
├── 20260527_430_conversiones_unidades.sql
├── 20260527_440_insumos.sql
├── 20260527_450_insumo_stock_sucursal.sql
├── 20260527_460_recetas.sql
├── 20260527_470_receta_componentes.sql
├── 20260527_480_modificador_componentes.sql
├── 20260527_490_movimientos_inventario.sql
├── 20260527_500_alertas_inventario.sql
├── 20260527_510_funciones_catalogo.sql       # buscar_clientes, etc.
├── 20260527_520_funciones_inventario.sql     # convertir_unidad, aplicar_movimiento_inventario, etc.
├── 20260527_530_triggers_catalogo.sql        # set_updated_at, audit_precio, audit_costo, etc.
├── 20260527_540_rls_policies_1b.sql
├── 20260527_550_seeds_unidades.sql
├── 20260527_560_seeds_conversiones.sql
└── 20260527_900_seed_knockout_catalogo.sql   # placeholder con hamburguesa ejemplo
```

### 11.2 Orden de aplicación crítico

```
Parte 1A completa
  → enums_catalogo
    → categorias
      → productos (FK a categorias)
        → modificadores (grupos y opciones)
          → productos_grupos_modificadores
        → areas_cocina (FK lazy a productos.area_cocina_id)
          → productos_areas_cocina_extra
        → clientes
          → direcciones_cliente
        → promociones
          → promociones_productos (FK a productos)
        → marcas_virtuales (FK lazy a productos.marca_virtual_id)
        → unidades_medida
          → conversiones_unidades
            → insumos (FK a unidades_medida)
              → insumo_stock_sucursal
              → recetas (FK a productos)
                → receta_componentes
              → modificador_componentes (FK a opciones_modificador)
              → movimientos_inventario
              → alertas_inventario
            → funciones (aplicar_movimiento_inventario, etc.)
              → triggers
                → rls_policies_1b
                  → seeds_unidades
                    → seeds_conversiones
                      → seed_knockout_catalogo
```

### 11.3 Verificación post-aplicación

```sql
-- Validar que todas las tablas tienen RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'categorias', 'productos', 'grupos_modificadores', 'opciones_modificador',
    'productos_grupos_modificadores', 'areas_cocina', 'productos_areas_cocina_extra',
    'clientes', 'direcciones_cliente', 'promociones', 'promociones_productos',
    'marcas_virtuales', 'unidades_medida', 'conversiones_unidades',
    'insumos', 'insumo_stock_sucursal', 'recetas', 'receta_componentes',
    'modificador_componentes', 'movimientos_inventario', 'alertas_inventario'
  );
-- Todas deben tener rowsecurity = true

-- Contar seeds del sistema
SELECT 'unidades' AS tabla, count(*) FROM unidades_medida WHERE es_sistema = true
UNION ALL
SELECT 'conversiones', count(*) FROM conversiones_unidades WHERE es_sistema = true;
-- Esperado: 15 unidades, 11 conversiones
```

---

## 12. Decisiones pendientes para Parte 1C/1D

### 12.1 Parte 1C — Operación

**Decisiones que se decidirán en Parte 1C:**

- ¿`tickets` y `ticket_items` como tablas separadas (decisión recomendada)?
- ¿Pagos como una sola tabla con `metodo_pago enum` o tabla por método?
- ¿Cómo se almacena un snapshot del precio del producto al momento de la venta (resistente a cambios futuros de catálogo)?
- ¿Las promociones aplicadas a un ticket se denormalizan o se recalculan?
- ¿Cómo se modela la devolución (revertir ticket vs documento independiente vinculado)?
- ¿Estructura CFDI: XML completo en Storage + metadata en BD, o XML en columna `text`?
- Sync offline con Dexie.js: ULIDs vs UUIDs para evitar colisiones, conflict resolution

**Lo que ya está fijo desde Parte 1B:**

- Productos referencian `producto_id` para tickets, pero el snapshot de nombre y precio se duplica en `ticket_items` (resistente a soft delete y cambios de precio)
- Movimientos de inventario por venta van vía `descontar_inventario_por_venta(ticket_id)` (función ya escrita en §9.6)
- Promociones aplicadas referencian `promocion_id` en `ticket_promociones_aplicadas`

### 12.2 Parte 1D — Especializaciones por vertical

**Decisiones que se decidirán en Parte 1D:**

- Mesas (Full Service): entidad `mesas` con FK desde `tickets.mesa_id` cuando aplique
- Cuentas abiertas (Café & Bar): tabla `cuentas_abiertas` con N:1 a tickets
- Multi-marca operativa: ¿reportes de venta filtran por `marca_virtual_id` automáticamente?
- Apps externas: configuración por app (Rappi, Uber, Didi) en tabla `apps_externas_configuracion`
- Reservaciones (Full Service)

**Lo que ya está fijo desde Parte 1B:**

- `productos.marca_virtual_id` ya existe como FK opcional
- `clientes.direcciones_cliente` listo para delivery propio
- `areas_cocina` listo para distribución por estación

### 12.3 Lo que NO se decide aquí ni en próximas partes

- Combos / paquetes con regla compleja de precio combinado → se modelan vía promociones tipo `COMBO_PAQUETE` pero la UI/UX se diseña post-MVP
- CRM Pro (puntos, niveles, lealtad) → add-on pagado, schema se extiende cuando se contrate
- Inventario Avanzado (lotes, caducidad por lote, FIFO/LIFO) → add-on pagado
- Catálogo formal de proveedores → diferido, hoy es texto libre

---

## 13. Checklist de validación

Mapeo de los flujos relevantes del `/core` cubiertos por Parte 1B a las tablas, funciones y reglas que los soportan. Sirve como auto-test mental: cada fila debe tener al menos una entrada concreta.

### 13.1 Flujos de catálogo (§4 del `/core`)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| C-01 | Producto con datos básicos (§4.1) | `productos` |
| C-02 | Producto con datos fiscales SAT (§4.1, §22) | `productos.clave_sat`, `unidad_sat`, `tasa_iva`, `iva_incluido_en_precio` |
| C-03 | Producto disponible solo en ciertos modos (§4.1, §6.4) | `productos.modos_servicio_disponibles text[]` (D18) |
| C-04 | Producto asignado a área de cocina (§4.1, §19.3) | `productos.area_cocina_id` FK → `areas_cocina` |
| C-05 | Producto con múltiples áreas (§19.6 opción A) | `productos.imprime_en_multiples_areas`, `productos_areas_cocina_extra` |
| C-06 | Producto agotado manual (§4.6) | `productos.agotado_manual`, `productos.motivo_agotado` |
| C-07 | Producto auto-agotado por insumo bajo (§36.2) | `productos.agotado_automatico` + función `evaluar_alertas_stock` |
| C-08 | Categorías visualmente (§4.2) | `categorias` con `color_hex`, `icono`, `orden_visualizacion` |
| C-09 | Categorías jerárquicas (futuro) | `categorias.parent_id` (D15) |
| C-10 | Categoría visible solo en ciertos modos (§4.2) | `categorias.modos_servicio_visibles text[]` |
| C-11 | Categoría visible solo a ciertos subtipos personal (§4.2) | `categorias.subtipos_personal_visibles uuid[]` |
| C-12 | Grupo de modificadores reutilizable (§4.3) | `grupos_modificadores` + `productos_grupos_modificadores` |
| C-13 | Tipo de selección de modificador (§4.3) | `grupos_modificadores.tipo_seleccion` (enum, D17) |
| C-14 | Modificador con rango "elige entre 2 y 4" (§4.3) | `grupos_modificadores.minimo_selecciones`, `maximo_selecciones` |
| C-15 | Opción de modificador con precio extra (§4.3) | `opciones_modificador.precio_extra_mxn` |
| C-16 | Opción de modificador pre-seleccionada por default (§4.3) | `opciones_modificador.es_default` + unique parcial |
| C-17 | Modificador "extra" que consume insumos (§33.3) | `grupos_modificadores.naturaleza = 'EXTRA'` + `modificador_componentes` |
| C-18 | Modificador "sin X" que NO descuenta (§33.3) | `grupos_modificadores.naturaleza = 'OMISION'` (sin componentes) |
| C-19 | Productos similares como entidades distintas (§4.5) | Cada producto es su propia fila |
| C-20 | Soft delete preservando histórico (§27) | `productos.deleted_at` + RLS sin filtro (D27) |
| C-21 | Auditoría de cambio de precio | trigger `trg_audit_precio_producto` → `auditoria_eventos` |

### 13.2 Flujos de áreas de cocina (§19)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| K-01 | Múltiples impresoras por sucursal (§19.3) | `areas_cocina` con `impresora_config jsonb` |
| K-02 | Formato de comanda configurable (§19.2, §28) | `areas_cocina.formato_comanda jsonb` |
| K-03 | Comanda dividida por área (§19.3) | Join `productos` ← `productos_areas_cocina_extra` |
| K-04 | Impresora ethernet o BLE | `impresora_config jsonb` con `tipo: ethernet | bluetooth_ble | compartida_con_caja` |

### 13.3 Flujos de CRM (§5)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| R-01 | Datos básicos de cliente (§5.1) | `clientes` |
| R-02 | Cliente con datos fiscales (§5.1) | `clientes.rfc`, `razon_social`, `regimen_fiscal`, `codigo_postal_fiscal`, `uso_cfdi_default` |
| R-03 | Cliente eventual (sin registro) (§5.4) | `clientes.tipo_fiscal = 'EVENTUAL'` o ticket sin `cliente_id` |
| R-04 | Búsqueda de cliente por nombre/teléfono/RFC (§5.3) | función `buscar_clientes(tenant_id, query, limit)` con pg_trgm + similarity |
| R-05 | Histórico de cliente (§5.2) | Calculado on-demand desde `tickets` en Parte 1C (D20) |
| R-06 | Cliente bloqueado (§5.6) | `clientes.estado = 'BLOQUEADO'`, `motivo_bloqueo`, `bloqueado_por` |
| R-07 | Auditoría de bloqueo | trigger `trg_audit_cliente_bloqueo` → `auditoria_eventos` |
| R-08 | Direcciones múltiples por cliente (§5.7) | `direcciones_cliente` con `es_principal` unique parcial |
| R-09 | Coordenadas GPS de dirección (futuro) | `direcciones_cliente.geo_lat`, `geo_lng` |
| R-10 | Notas internas para alergias/preferencias (§5.1) | `clientes.notas_internas` |

### 13.4 Flujos de promociones (§14)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| P-01 | Promoción tipo porcentaje (§14.2, §14.6) | `promociones.tipo = 'PORCENTAJE'`, `valor_porcentaje` |
| P-02 | Promoción tipo monto fijo (§14.2) | `promociones.tipo = 'MONTO_FIJO'`, `valor_monto_mxn` |
| P-03 | Promoción 2x1 / 3x2 (§14.2) | `promociones.tipo = 'COMPRA_X_LLEVA_Y'`, `cantidad_compra`, `cantidad_lleva` |
| P-04 | Combo/paquete (§14.2) | `promociones.tipo = 'COMBO_PAQUETE'`, `precio_combo_mxn` + `promociones_productos.obligatorio_para_activar = true` |
| P-05 | Happy hour (rango horario) (§14.2, §14.6) | `promociones.condiciones->>'horario'` (D29) |
| P-06 | Promoción por día (§14.2) | `promociones.condiciones->'horario'->'dias_semana'` |
| P-07 | Promoción por monto mínimo (§14.2) | `promociones.condiciones->'monto_ticket'->>'minimo_mxn'` |
| P-08 | Promoción con cupón (§14.2) | `promociones.codigo` + `condiciones->'cupon'->>'requiere_codigo'` |
| P-09 | Promoción por método de pago (§14.2) | `condiciones->'metodos_pago_permitidos'` |
| P-10 | Promoción para cliente identificado (§14.2) | `promociones.requiere_cliente_identificado` |
| P-11 | Límite total de usos | `promociones.max_usos_total`, `usos_actuales` |
| P-12 | Límite de usos por cliente | `promociones.max_usos_cliente` (aplicación en Parte 1C) |
| P-13 | No acumulación entre promociones (§14.7) | `promociones.no_acumulable_con uuid[]` |
| P-14 | Prioridad cuando varias aplican (§14.6) | `promociones.prioridad` |
| P-15 | Estado pausado/expirado/agotado | `promociones.estado` enum + cron diario `EXPIRADA` |
| P-16 | Productos/categorías afectadas (§14.6) | `promociones_productos` con xor `producto_id` / `categoria_id` |
| P-17 | Cancelación manual de promoción aplicada (§14.7) | Modelo en Parte 1C (tabla `ticket_promociones_aplicadas`) |

### 13.5 Flujos de marcas virtuales (Dark Kitchen)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| M-01 | Marcas virtuales con datos fiscales propios | `marcas_virtuales.rfc`, `razon_social`, `regimen_fiscal` |
| M-02 | Branding por marca (logo, colores) | `marcas_virtuales.logo_url`, `color_primario_hex`, `color_secundario_hex` |
| M-03 | Producto asociado a marca virtual | `productos.marca_virtual_id` FK opcional (D25) |
| M-04 | Activación condicionada al feature flag | Lógica en aplicación: si `tenant.vertical_principal = 'DARK_KITCHEN'` y `feature_flag multi_marca` |
| M-05 | Apps externas asociadas a marca | `marcas_virtuales.apps_externas_config jsonb` |

### 13.6 Flujos de Inventario y Recetas (Parte IX del `/core`)

| # | Flujo del `/core` | Tabla / función / regla |
|---|---|---|
| I-01 | Activación opcional del módulo (§31.2) | `configuracion_tenant.modulo_inventario_activo` (Parte 1A §4.3) |
| I-02 | Insumo con unidad de medida (§32.2) | `insumos.unidad_medida_id` FK → `unidades_medida` |
| I-03 | Insumo con stock y costo (§32.2) | `insumos.costo_unitario_mxn`, `insumo_stock_sucursal.stock_actual` (D21, D30) |
| I-04 | Método de valuación promedio ponderado (§35.1) | `insumos.metodo_valuacion = 'PROMEDIO_PONDERADO'` + recálculo en `aplicar_movimiento_inventario` |
| I-05 | Método de valuación último costo (§35.1) | `insumos.metodo_valuacion = 'ULTIMO_COSTO'` |
| I-06 | Receta de producto con insumos y cantidades (§33.1) | `recetas` + `receta_componentes` (D22) |
| I-07 | Producto sin receta = venta sin descuento (§33.4) | `recetas.activa = false` o ausencia de fila |
| I-08 | Modificador EXTRA consume insumos adicionales (§33.3) | `modificador_componentes` |
| I-09 | Modificador OMISION NO afecta inventario (§33.3) | `grupos_modificadores.naturaleza = 'OMISION'` (no se procesa en `descontar_inventario_por_venta`) |
| I-10 | Entrada por compra (§34.2) | `movimientos_inventario.tipo = 'ENTRADA_COMPRA'` + `proveedor_texto`, `factura_referencia` (D31) |
| I-11 | Salida automática por venta (§34.3) | función `descontar_inventario_por_venta(ticket_id)` (D23) |
| I-12 | Salida por modificador extra (§33.3) | tipo `SALIDA_MODIFICADOR_EXTRA` en función central |
| I-13 | Reversa por cancelación de venta (§34.4) | tipo `REVERSA_CANCELACION` |
| I-14 | Merma con motivo (§34.5) | tipo `MERMA` + `motivo`, `descripcion` |
| I-15 | Ajuste por conteo físico (§34.6) | tipos `AJUSTE_POSITIVO` / `AJUSTE_NEGATIVO` + `fecha_ultimo_conteo_fisico` |
| I-16 | Transferencia entre sucursales (§34.7) | tipos `TRANSFERENCIA_SALIDA` + `TRANSFERENCIA_ENTRADA` ligados por `transferencia_id` |
| I-17 | Devolución a proveedor | tipo `DEVOLUCION_PROVEEDOR` |
| I-18 | Stock negativo permitido (§34.3) | sin CHECK >= 0; `stock_negativo_flag` para alerta (D32) |
| I-19 | Cálculo automático de costo de receta (§33.2, §35.2) | trigger `trg_componentes_recalcular_costo` |
| I-20 | Recálculo cuando cambia costo del insumo (§35.2) | función `recalcular_costo_recetas(insumo_id)` invocada desde `aplicar_movimiento_inventario` |
| I-21 | Alerta amarilla por stock bajo (§36.1, §36.3) | función `evaluar_alertas_stock` + `alertas_inventario.severidad = 'AMARILLA'` |
| I-22 | Alerta roja por stock crítico (§36.3) | `severidad = 'ROJA'` |
| I-23 | Auto-agotado de producto por insumo crítico cero (§36.2) | `evaluar_alertas_stock` actualiza `productos.agotado_automatico` |
| I-24 | Auto-reactivación cuando vuelve stock (§36.2) | misma función `evaluar_alertas_stock` revierte si stock > 0 y todos los insumos críticos disponibles |
| I-25 | Conversión entre unidades de medida (§32.4) | función `convertir_unidad(cantidad, origen, destino)` con búsqueda directa/inversa |
| I-26 | Umbrales por sucursal (override del global) | `insumo_stock_sucursal.stock_minimo`, `stock_critico`, `stock_maximo` |
| I-27 | Bitácora de cambios de costo | trigger `trg_audit_costo_insumo` → `auditoria_eventos` |
| I-28 | Reportes de margen, COGS, rotación (§37) | Queries sobre `movimientos_inventario` + `insumos.costo_unitario_mxn` + `recetas.costo_total_mxn` (queries detalladas en doc 09 Reportes) |

### 13.7 Cobertura cruzada con Parte 1A

| Tema de 1A | Uso en 1B |
|---|---|
| `current_tenant_id()` | Todas las RLS policies de 1B |
| `set_updated_at()` | Triggers en todas las tablas con `updated_at` |
| `calcular_dia_contable()` | `movimientos_inventario.dia_contable` |
| `generar_folio()` | Futuros folios de entrada/merma/transferencia (cuando se requiera) |
| `auditoria_eventos` | Eventos `producto.precio_modificado`, `cliente.bloqueado`, `insumo.costo_modificado` |
| `autorizaciones_pin` | FK opcional en `movimientos_inventario.autorizacion_pin_id` (mermas, ajustes) |
| `regimen_fiscal_sat` enum | Reutilizado en `clientes.regimen_fiscal` y `marcas_virtuales.regimen_fiscal` |
| `sucursales` | FK en `areas_cocina`, `insumo_stock_sucursal`, `movimientos_inventario`, `alertas_inventario` |
| `configuracion_tenant.modulo_inventario_activo` | Gate del módulo Inventario (todas las funciones lo respetan) |

---

## Changelog

### v1.0 — Mayo 2026 (Sesión 8)

- ✅ Documento inicial completo
- ✅ 19 decisiones de diseño D14-D32 documentadas
- ✅ 21 tablas: categorias, productos, grupos_modificadores, opciones_modificador, productos_grupos_modificadores, areas_cocina, productos_areas_cocina_extra, clientes, direcciones_cliente, promociones, promociones_productos, marcas_virtuales, unidades_medida, conversiones_unidades, insumos, insumo_stock_sucursal, recetas, receta_componentes, modificador_componentes, movimientos_inventario, alertas_inventario
- ✅ 10 enums: producto_estado, producto_tipo_venta, modificador_tipo_seleccion, modificador_naturaleza, cliente_tipo_fiscal, cliente_estado, uso_cfdi, promocion_tipo, promocion_estado, promocion_alcance, insumo_categoria, valuacion_metodo, insumo_estado, movimiento_inventario_tipo, alerta_severidad
- ✅ 6 funciones helper: `buscar_clientes`, `convertir_unidad`, `aplicar_movimiento_inventario`, `evaluar_alertas_stock`, `recalcular_costo_recetas`, `descontar_inventario_por_venta`
- ✅ 5 triggers: `trg_audit_precio_producto`, `trg_audit_cliente_bloqueo`, `trg_componentes_recalcular_costo`, `trg_audit_costo_insumo`, + triggers `set_updated_at` en todas las tablas con updated_at
- ✅ RLS habilitada en todas las tablas multi-tenant
- ✅ Seeds: 15 unidades de medida sistema + 11 conversiones sistema + placeholder Knock-Out (categoría Hamburguesas + producto ejemplo + grupo de modificadores Término de cocción + área de cocina)
- ✅ Configuración Knock-Out: `modulo_inventario_activo = false` para MVP
- ✅ Migraciones numeradas 20260527_300 a _900
- ✅ Checklist de validación con 76 entradas mapeando flujos del `/core` a entidades de BD
- ✅ Decisiones diferidas a Parte 1C/1D documentadas

**Próxima sesión:** Parte 1C — Operación (tickets, ticket_items, ticket_modificadores, pagos, descuentos aplicados, devoluciones, snapshots de catálogo, preparación CFDI).

