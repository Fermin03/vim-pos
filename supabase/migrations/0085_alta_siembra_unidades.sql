-- ============================================================================
-- 0085 — El alta de un negocio siembra sus unidades de medida.
--
-- EL HUECO, Y LLEVABA ESCRITO DESDE LA 0035
--
-- `unidades_medida` es POR NEGOCIO. La migración 0035 creó
-- `sembrar_unidades_base(tenant_id)` y la aplicó a todos los tenants que
-- existían ese día, y dejó dicho en su propio encabezado:
--
--     «El provisioning de nuevos tenants debería llamarla también
--      — pendiente de cablear en F12.»
--
-- Nunca se cableó. Resultado: TODO negocio dado de alta después de la 0035
-- nace sin unidades, y como `insumos.unidad_medida_id` es NOT NULL, su módulo
-- de inventario queda inservible desde el primer día.
--
-- CÓMO SE VE EL FALLO, QUE ES LO PEOR DE TODO
--
-- El botón «Nuevo insumo» del panel se apaga —`disabled={unidades.length === 0}`—
-- sin decir por qué. No hay error, no hay aviso: un botón gris. El dueño
-- concluye que el inventario «no funciona» o que hizo algo mal. Así se
-- encontró: probando el panel y sin poder dar de alta nada.
--
-- QUÉ HACE ESTA MIGRACIÓN
--
--   1. Envuelve `crear_tenant_con_owner` para que siembre las unidades al
--      final, sin tocar el resto de su cuerpo.
--   2. Vuelve a sembrar los tenants que hoy están sin unidades, para que los
--      dados de alta en la ventana entre la 0035 y hoy queden cubiertos.
--
-- El paso 2 es idempotente: `sembrar_unidades_base` comprueba antes de
-- insertar, así que a quien ya las tenga no le añade nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El alta las siembra
--
-- Se envuelve en vez de reescribir el cuerpo: `crear_tenant_con_owner` hace
-- seis cosas y ninguna hay que tocar. Renombrar el original y llamarlo desde
-- el nuevo mantiene esta migración pequeña y deja el original intacto para
-- quien lo audite.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Solo la primera vez: si ya existe el original renombrado, esta migración
  -- ya corrió y volver a renombrar rompería la cadena.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'crear_tenant_con_owner_base'
  ) THEN
    ALTER FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text)
      RENAME TO crear_tenant_con_owner_base;
  END IF;
END $$;

/* Los tipos son EXACTAMENTE los del original —varchar y los dos enums, no
   text— porque en Postgres la firma es parte del nombre: con `text` esto no
   reemplazaría nada, crearía una segunda función y las llamadas seguirían
   yendo a la vieja, sin unidades y sin ningún error que lo delate. */
CREATE OR REPLACE FUNCTION crear_tenant_con_owner(
  p_owner_user_id    uuid,
  p_codigo           varchar,
  p_nombre_comercial varchar,
  p_nombre_owner     varchar,
  p_telefono_owner   varchar,
  p_vertical         vertical_tipo,
  p_plan_codigo      varchar,
  p_estado           tenant_estado,
  p_notas_internas   text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp  -- el mismo del original
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Las unidades de medida. Van DESPUÉS de crear el tenant porque cuelgan de
     él, y dentro de la misma transacción: un negocio a medio sembrar es peor
     que uno que no se creó, porque el segundo se reintenta y el primero no se
     nota hasta que alguien abre Inventario. */
  PERFORM sembrar_unidades_base(v_tenant);

  RETURN v_tenant;
END;
$$;

COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base y le añade la siembra de unidades_medida, que la 0035 dejó pendiente de cablear.';

-- Los permisos del original: al recrear la función se pierden, y sin esto el
-- provisioning deja de funcionar con un error de permisos que no dice nada.
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Cubrir a los que ya nacieron sin ellas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_t uuid;
  v_n int := 0;
BEGIN
  FOR v_t IN
    SELECT t.id FROM tenants t
     WHERE t.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM unidades_medida u WHERE u.tenant_id = t.id)
  LOOP
    PERFORM sembrar_unidades_base(v_t);
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    RAISE NOTICE 'Unidades de medida sembradas para % negocio(s) que no las tenían.', v_n;
  END IF;
END $$;
