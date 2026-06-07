-- Tier1 Inventario — el módulo de inventario requiere unidades_medida, pero el provisioning
-- (crear_tenant_con_owner) NUNCA las sembró, así que ningún tenant tiene unidades y por tanto no
-- se pueden crear insumos (unidad_medida_id es NOT NULL). La RLS de unidades_medida es solo-lectura,
-- así que deben sembrarse server-side. Esta migración crea una función reutilizable que siembra el
-- catálogo base de unidades de un restaurante mexicano y la aplica a todos los tenants existentes.
-- (El provisioning de nuevos tenants debería llamarla también — pendiente de cablear en F12.)

CREATE OR REPLACE FUNCTION sembrar_unidades_base(p_tenant_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_u record;
  v_orden int := 0;
BEGIN
  FOR v_u IN
    SELECT * FROM (VALUES
      ('PZA', 'Pieza',       'pza', 'CANTIDAD'),
      ('POR', 'Porción',     'por', 'CANTIDAD'),
      ('ORD', 'Orden',       'ord', 'CANTIDAD'),
      ('PAQ', 'Paquete',     'paq', 'CANTIDAD'),
      ('CAJ', 'Caja',        'caja','CANTIDAD'),
      ('BOT', 'Botella',     'bot', 'CANTIDAD'),
      ('KG',  'Kilogramo',   'kg',  'MASA'),
      ('G',   'Gramo',       'g',   'MASA'),
      ('OZ',  'Onza',        'oz',  'MASA'),
      ('L',   'Litro',       'L',   'VOLUMEN'),
      ('ML',  'Mililitro',   'ml',  'VOLUMEN')
    ) AS t(codigo, nombre, simbolo, dimension)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM unidades_medida WHERE tenant_id = p_tenant_id AND codigo = v_u.codigo
    ) THEN
      INSERT INTO unidades_medida (tenant_id, codigo, nombre, simbolo, dimension, es_sistema, activa, orden_visualizacion)
      VALUES (p_tenant_id, v_u.codigo, v_u.nombre, v_u.simbolo, v_u.dimension, true, true, v_orden);
    END IF;
    v_orden := v_orden + 1;
  END LOOP;
END;
$$;

-- Sembrar para todos los tenants existentes.
DO $$
DECLARE v_t uuid;
BEGIN
  FOR v_t IN SELECT id FROM tenants WHERE deleted_at IS NULL LOOP
    PERFORM sembrar_unidades_base(v_t);
  END LOOP;
END $$;
