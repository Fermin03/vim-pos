-- ============================================================================
-- 0079 — La comanda se parte por estación de preparación.
--
-- Hoy sale una sola comanda por pedido a una sola impresora: las bebidas se imprimen junto a la
-- comida y en la barra hay que leer el papel entero para encontrar lo suyo. Lo que el negocio hace
-- (y lo que hacía su sistema anterior) es mandar las bebidas a la impresora de la caja y la comida
-- a la de cocina.
--
-- LA BASE YA LO MODELABA Y NADIE LO USABA
--
-- `areas_cocina` existe desde la 0007 con su impresora y su formato de comanda, `productos` tiene
-- `area_cocina_id`, y hay hasta un reporte de ventas por área. Ni el POS ni el panel lo tocaron
-- nunca: el reporte lleva desde entonces diciendo "General". Así que esto no inventa un concepto
-- nuevo, conecta el que ya estaba.
--
-- LO ÚNICO QUE FALTABA: HEREDAR DE LA CATEGORÍA
--
-- Asignar 77 productos uno por uno es una tarde perdida y se presta a olvidos. La categoría lleva
-- el valor por defecto —Bebidas → Barra— y el producto solo se toca cuando es la excepción.
-- Resolución en la caja: producto → categoría → nada (y entonces va a cocina, como hoy).
--
-- LÍMITE CONOCIDO: `areas_cocina` cuelga de una SUCURSAL y `categorias` es del negocio entero. Con
-- varias sucursales, una categoría solo puede apuntar al área de una de ellas; las demás caen al
-- comportamiento de hoy (todo a cocina) en vez de imprimir en el lugar equivocado. Se resuelve el
-- día que haya un segundo local, que es cuando se sabrá cómo lo quieren de verdad.
-- ============================================================================

ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS area_cocina_id uuid NULL REFERENCES areas_cocina(id) ON DELETE SET NULL;

COMMENT ON COLUMN categorias.area_cocina_id IS
  'Estación de preparación por defecto de la categoría. El producto puede llevar la contraria con su propio area_cocina_id.';

CREATE INDEX IF NOT EXISTS idx_categorias_area_cocina
  ON categorias (area_cocina_id) WHERE area_cocina_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Las áreas bajan a la caja. Sin esto el POS no sabe a qué estación va cada producto y todo
-- seguiría saliendo por la misma impresora.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Estaciones de preparación: la caja necesita saber a cuál va cada producto para partir la comanda.
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Repartidores: se dan de alta en el panel y se eligen en la caja al marcar una salida.
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Roles del tenant + los de sistema (tenant_id NULL): sin estos, los empleados llegan con un
    -- rol_id que no resuelve y el POS no los lista.
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x
                                        WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x
                                        WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x
                                        WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;

REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;
