-- ============================================================================
-- Combos para Crazy Burgers — capturas del giro Comida rápida.
--
-- Se corre DESPUÉS de semilla-demo.sql (que borra y recrea el tenant, así que
-- volver a correr la semilla base deja Crazy Burgers sin combos, como lo
-- esperan las capturas de siempre). Solo Supabase LOCAL. Idempotente.
--
--   docker exec -i supabase_db_vim-pos psql -U postgres -d postgres -q \
--     < sitio-web/_capturas/semilla-servicio-rapido-combos.sql
-- ============================================================================
DO $$
DECLARE
  v_tenant uuid := '9c3a71e0-0000-4000-8000-000000000001';
  v_cat    uuid;
  v_combo  uuid;
  v_g      uuid;
  v_slot   record;
  v_c      record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN
    RAISE EXCEPTION 'Corre antes semilla-demo.sql';
  END IF;

  -- Idempotente: fuera los combos que haya dejado una corrida anterior.
  DELETE FROM combo_grupos WHERE tenant_id = v_tenant;
  DELETE FROM productos WHERE tenant_id = v_tenant AND es_combo;
  DELETE FROM categorias WHERE tenant_id = v_tenant AND nombre = 'Combos';

  -- Comida rápida: mostrador, domicilio y cocina encendidos (juego del giro, ADR 0034).
  UPDATE tenants SET operacion = juego_inicial_de_giro('QUICK_SERVICE') WHERE id = v_tenant;

  INSERT INTO categorias (tenant_id, nombre, orden_visualizacion, activa)
  VALUES (v_tenant, 'Combos', 0, true) RETURNING id INTO v_cat;

  FOR v_c IN SELECT * FROM (VALUES
      ('Combo Crazy',        189.00, 'Crazy Clásica', 1),
      ('Combo Doble Queso',  225.00, 'Doble Queso',   2),
      ('Combo BBQ Tocino',   235.00, 'BBQ Tocino',    3),
      ('Combo Pollo Crispy', 205.00, 'Pollo Crispy',  4)) AS x(nombre, precio, hamburguesa, ord)
  LOOP
    INSERT INTO productos (tenant_id, categoria_id, nombre, precio_base_mxn, tasa_iva, iva_incluido_en_precio,
                           estado, visible_en_pos, orden_visualizacion, es_combo)
    VALUES (v_tenant, v_cat, v_c.nombre, v_c.precio, 16, true, 'ACTIVO', true, v_c.ord, true)
    RETURNING id INTO v_combo;

    FOR v_slot IN SELECT * FROM (VALUES
        ('Hamburguesa',    1, v_c.hamburguesa),
        ('Acompañamiento', 2, 'Papas gajo'),
        ('Bebida',         3, 'Refresco 600 ml')) AS s(nombre, ord, por_defecto)
    LOOP
      INSERT INTO combo_grupos (tenant_id, combo_producto_id, nombre, orden_visualizacion, minimo_selecciones, maximo_selecciones, modo_precio)
      VALUES (v_tenant, v_combo, v_slot.nombre, v_slot.ord, 1, 1, 'DELTA') RETURNING id INTO v_g;

      -- Opciones explícitas con su diferencia de precio; la de siempre va marcada.
      INSERT INTO combo_opciones (tenant_id, grupo_id, producto_id, precio_delta_mxn, es_default, orden_visualizacion)
      SELECT v_tenant, v_g, p.id, o.delta, p.nombre = v_slot.por_defecto, o.ord
        FROM (VALUES
          ('Hamburguesa', v_c.hamburguesa, 0.00, 1), ('Hamburguesa', 'Arrachera', 40.00, 2),
          ('Hamburguesa', 'Triple Crazy', 60.00, 3), ('Hamburguesa', 'Chipotle', 20.00, 4),
          ('Acompañamiento', 'Papas gajo', 0.00, 1), ('Acompañamiento', 'Papas con queso', 15.00, 2),
          ('Acompañamiento', 'Aros de cebolla', 10.00, 3),
          ('Bebida', 'Refresco 600 ml', 0.00, 1), ('Bebida', 'Limonada natural', 10.00, 2),
          ('Bebida', 'Malteada de fresa', 45.00, 3), ('Bebida', 'Cerveza artesanal', 30.00, 4)
        ) AS o(slot, producto, delta, ord)
        JOIN productos p ON p.tenant_id = v_tenant AND p.nombre = o.producto AND NOT p.es_combo
       WHERE o.slot = v_slot.nombre;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Combos de Crazy Burgers listos.';
END $$;
