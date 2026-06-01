-- 0007 — Catálogo, CRM, promociones, marcas virtuales, inventario. Fuente: 1B.
--
-- Referencias externas a migraciones previas:
--   0001: extensiones (pgcrypto, unaccent, pg_trgm, citext), current_tenant_id(), set_updated_at()
--   0002: tenants, regimen_fiscal_sat, configuracion_tenant (modulo_inventario_activo)
--   0003: sucursales
--   0004: calcular_dia_contable()
--   0005: autorizaciones_pin
--   0006: auditoria_eventos
--   nativo de Supabase: auth.users
-- Parte 1C definirá: tickets, ticket_items, ticket_item_modificadores (FK lazy en movimientos_inventario
--   y referenciadas por descontar_inventario_por_venta).


-- =====================================================================
-- §3. Catálogo de productos
-- =====================================================================

-- §3.1 Enums asociados

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

-- §3.2 Tabla categorias
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

-- §3.3 Tabla productos
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

-- §3.4 Tabla grupos_modificadores
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

-- §3.5 Tabla opciones_modificador
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

-- §3.6 Tabla productos_grupos_modificadores
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

-- §3.7 RLS y políticas
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

-- §3.8 Triggers de mantenimiento
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

-- §3.9 Trigger: auditoría de cambios de precio
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


-- =====================================================================
-- §4. Áreas de cocina
-- =====================================================================

-- §4.1 Tabla areas_cocina
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

-- §4.2 Foreign key tardío en productos
ALTER TABLE productos
  ADD CONSTRAINT fk_productos_area_cocina
  FOREIGN KEY (area_cocina_id) REFERENCES areas_cocina(id) ON DELETE SET NULL;

CREATE INDEX idx_productos_area_cocina ON productos(area_cocina_id) WHERE area_cocina_id IS NOT NULL AND deleted_at IS NULL;

-- §4.3 Tabla productos_areas_cocina_extra
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

-- §4.4 RLS y triggers
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


-- =====================================================================
-- §5. CRM básico (clientes y direcciones)
-- =====================================================================

-- §5.1 Enums asociados

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

-- §5.2 Tabla clientes
CREATE TABLE clientes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Identidad (§5.1)
  nombre              varchar(200) NOT NULL,         -- puede ser solo nombre de pila
  apellido_paterno    varchar(100) NULL,
  apellido_materno    varchar(100) NULL,
  nombre_completo_busqueda text GENERATED ALWAYS AS (
    f_unaccent(lower(coalesce(nombre, '') || ' ' || coalesce(apellido_paterno, '') || ' ' || coalesce(apellido_materno, '')))
  ) STORED,                                          -- para búsqueda con pg_trgm (f_unaccent IMMUTABLE)

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

-- §5.3 Tabla direcciones_cliente
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

-- §5.4 RLS y triggers
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

-- §5.5 Trigger: auditoría de bloqueo de cliente
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

-- §5.6 Búsqueda de cliente (función helper)
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
      similarity(c.nombre_completo_busqueda, f_unaccent(lower(p_query))),
      CASE WHEN c.telefono ILIKE '%' || p_query || '%' THEN 0.9 ELSE 0 END,
      CASE WHEN c.rfc ILIKE p_query || '%' THEN 0.95 ELSE 0 END,
      CASE WHEN c.codigo_cliente = p_query THEN 1.0 ELSE 0 END
    )::real AS score
  FROM clientes c
  WHERE c.tenant_id = p_tenant_id
    AND c.deleted_at IS NULL
    AND c.estado <> 'BLOQUEADO'
    AND (
      c.nombre_completo_busqueda % f_unaccent(lower(p_query))
      OR c.telefono ILIKE '%' || p_query || '%'
      OR c.rfc ILIKE p_query || '%'
      OR c.codigo_cliente = p_query
    )
  ORDER BY score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION buscar_clientes IS 'Búsqueda fuzzy de clientes. §5.3 del /core. Usa pg_trgm + similarity.';


-- =====================================================================
-- §6. Promociones automáticas
-- =====================================================================

-- §6.1 Enums asociados

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

-- §6.2 Tabla promociones
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

-- §6.3 Tabla promociones_productos
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

-- §6.4 El schema de promociones.condiciones es jsonb documentado en el doc 1B; no requiere DDL.

-- §6.5 RLS y triggers
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

-- §6.6 Función auxiliar para expirar promociones vencidas (se invoca vía cron diario, NO trigger por fila)
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
-- Decisión operativa (doc 1B §6.6): no se crea trigger; se usa cron diario a las 03:00.


-- =====================================================================
-- §7. Marcas virtuales (Dark Kitchen)
-- =====================================================================

-- §7.1 Tabla marcas_virtuales
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

-- §7.2 Foreign key tardío en productos
ALTER TABLE productos
  ADD CONSTRAINT fk_productos_marca_virtual
  FOREIGN KEY (marca_virtual_id) REFERENCES marcas_virtuales(id) ON DELETE SET NULL;

-- §7.3 RLS y triggers
ALTER TABLE marcas_virtuales ENABLE ROW LEVEL SECURITY;
CREATE POLICY marcas_tenant ON marcas_virtuales FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE TRIGGER trg_marcas_updated_at
  BEFORE UPDATE ON marcas_virtuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =====================================================================
-- §8. Módulo Inventario y Recetas
-- =====================================================================

-- §8.1 Enums asociados

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

-- §8.2 Tabla unidades_medida
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
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Único por (codigo, tenant_id) tratando tenant_id NULL como un valor.
-- (reemplaza EXCLUDE ... IS NOT DISTINCT FROM, no válido)
CREATE UNIQUE INDEX idx_unidades_codigo_unica_tenant
  ON unidades_medida(codigo, tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX idx_unidades_codigo_unica_sistema
  ON unidades_medida(codigo)
  WHERE tenant_id IS NULL;

CREATE INDEX idx_unidades_dimension ON unidades_medida(dimension) WHERE activa = true;
CREATE INDEX idx_unidades_tenant ON unidades_medida(tenant_id) WHERE tenant_id IS NOT NULL;

-- Solo una unidad base por dimensión a nivel sistema
CREATE UNIQUE INDEX idx_unidades_base_unica_sistema
  ON unidades_medida(dimension)
  WHERE es_unidad_base = true AND es_sistema = true;

COMMENT ON TABLE unidades_medida IS 'Catálogo de unidades. Sistema predefine las comunes; tenant puede agregar custom.';

-- §8.3 Tabla conversiones_unidades
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

  CONSTRAINT conversion_no_misma_unidad CHECK (unidad_origen_id <> unidad_destino_id)
);

-- Único por (unidad_origen_id, unidad_destino_id, tenant_id) tratando tenant_id NULL como un valor.
-- (reemplaza EXCLUDE ... IS NOT DISTINCT FROM, no válido)
CREATE UNIQUE INDEX idx_conversion_unica_tenant
  ON conversiones_unidades(unidad_origen_id, unidad_destino_id, tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX idx_conversion_unica_sistema
  ON conversiones_unidades(unidad_origen_id, unidad_destino_id)
  WHERE tenant_id IS NULL;

CREATE INDEX idx_conversiones_origen ON conversiones_unidades(unidad_origen_id);
CREATE INDEX idx_conversiones_destino ON conversiones_unidades(unidad_destino_id);

COMMENT ON TABLE conversiones_unidades IS 'Factor de conversión entre unidades. Ej: kg→g factor=1000. D24.';

-- §8.4 Tabla insumos
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

-- §8.5 Tabla insumo_stock_sucursal
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

-- §8.6 Tabla recetas
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

-- §8.7 Tabla receta_componentes
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

-- §8.8 Tabla modificador_componentes
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

-- §8.9 Tabla movimientos_inventario
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

-- §8.10 Tabla alertas_inventario
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

-- §8.11 RLS y triggers
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


-- =====================================================================
-- §9. Funciones helper y triggers
-- =====================================================================

-- §9.1 Función convertir_unidad
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

-- §9.2 Función aplicar_movimiento_inventario
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

-- §9.3 Función evaluar_alertas_stock
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

-- §9.4 Función recalcular_costo_recetas
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

-- §9.5 Trigger: recalcular costo de receta al cambiar componentes
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

-- §9.6 Función descontar_inventario_por_venta
-- NOTA: referencia tablas tickets / ticket_items / ticket_item_modificadores que se definen
-- en Parte 1C. PostgreSQL compila el cuerpo plpgsql sin requerir que existan al crear la función.
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

-- §9.7 Trigger: auditoría de cambios de costo
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
