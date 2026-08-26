-- ============================================================================
-- 0086 — El precio lo fija el tamaño del paquete, no la vertical.
--
-- QUÉ CAMBIA Y POR QUÉ
--
-- Hasta hoy había un plan por vertical (FT $399, QS/CB $999, FS $1,299,
-- DK $1,499, ENT $2,499) y la vertical elegida en el alta decidía el precio.
-- Eso ataba dos cosas que no tienen por qué ir juntas: qué TIPO de negocio es
-- (que configura el producto) y CUÁNTO paga (que depende de su tamaño).
--
-- En la práctica se rompía sola: una taquería de tres sucursales pagaba menos
-- que un restaurante de mantel de una, porque la vertical mandaba. Y al revés,
-- dos negocios idénticos en tamaño pagaban distinto por haber marcado una
-- vertical distinta en el alta.
--
-- El modelo nuevo son tres escalones por tamaño —Esencial, Negocio, Cadena— y
-- son EXACTAMENTE los que ya están publicados en vimpos.com.mx/precios. Ese es
-- el motivo de fondo para hacerlo ahora y no después: el sitio está en línea e
-- indexado prometiendo $699 / $999 / $1,999, y la base decía otra cosa. Un
-- precio publicado que no coincide con el que factura el sistema es de los
-- errores más caros que hay, porque el cliente descubre la diferencia cuando ya
-- firmó.
--
-- La vertical NO desaparece: sigue en `tenants.vertical_principal`, que es donde
-- corresponde, y sigue configurando el producto. Lo que deja de hacer es poner
-- el precio.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
--
--   · NO cambia de plan a ningún cliente que ya exista. Mover a alguien de plan
--     es cambiarle lo que paga, y eso se habla con el cliente, no se hace en un
--     `UPDATE`. Los planes viejos se retiran del catálogo pero siguen existiendo
--     y sirviendo a quien esté en ellos.
--
--   · NO borra los planes viejos. `tenants.plan_actual_id` y `suscripciones`
--     apuntan a ellos; borrarlos rompería la referencia y, peor, borraría el
--     dato de a qué precio se contrató a cada quien.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Un plan ya no pertenece a una vertical
--
-- Los tres escalones sirven a cualquier tipo de negocio, así que la columna deja
-- de ser obligatoria. Se conserva —no se borra— porque los seis planes viejos la
-- tienen llena y ese dato explica de dónde viene cada cliente heredado.
-- ---------------------------------------------------------------------------
ALTER TABLE planes ALTER COLUMN vertical DROP NOT NULL;

COMMENT ON COLUMN planes.vertical IS
  'Solo en los planes heredados por vertical (retirados en 0086). Los planes por tamaño la dejan NULL: el precio lo fija el paquete, y la vertical vive en tenants.vertical_principal.';

-- ---------------------------------------------------------------------------
-- 2. Los tres escalones
--
-- Los valores salen de la página de precios publicada, tabla «Qué cambia de un
-- plan a otro». Si algún día cambian ahí, cambian aquí: son el mismo trato.
--
--   · `max_cajas_por_sucursal` NULL en Cadena = sin límite, como dice el sitio.
--   · `timbres_cfdi_mensuales` es la base mensual NO acumulable (10/20/40).
--   · `cfdi_incluido` en features es la única bandera de este archivo que el
--     código lee de verdad (abajo, en el alta). Las demás describen el plan.
--
-- ON CONFLICT para que la migración se pueda volver a correr sin duplicar y para
-- que corregir un precio aquí sea una migración aditiva más, no un parche a mano.
-- ---------------------------------------------------------------------------
INSERT INTO planes (
  codigo, nombre, descripcion, vertical, precio_mensual_mxn,
  max_sucursales, max_cajas_por_sucursal, timbres_cfdi_mensuales,
  features_incluidos, visible_publico, activo, orden_visualizacion
) VALUES
  (
    'ESENCIAL', 'Esencial',
    'Una sola caja. Cocina, mesas, reportes y corte. La facturación se contrata aparte.',
    NULL, 699.00,
    1, 1, 10,
    '{"cfdi_incluido": false, "inventario": false, "consolidado_sucursales": false, "carga_menu": "guiada", "arranque": "soporte_en_linea"}'::jsonb,
    true, true, 1
  ),
  (
    'NEGOCIO', 'Negocio',
    'Hasta tres cajas en una sucursal. Suma inventario y mermas, y la facturación va incluida.',
    NULL, 999.00,
    1, 3, 20,
    '{"cfdi_incluido": true, "inventario": true, "consolidado_sucursales": false, "carga_menu": "la_hacemos_nosotros", "arranque": "acompanamiento_en_linea"}'::jsonb,
    true, true, 2
  ),
  (
    'CADENA', 'Cadena',
    'Tres sucursales y cajas sin límite, con el reporte que las suma todas.',
    NULL, 1999.00,
    3, NULL, 40,
    '{"cfdi_incluido": true, "inventario": true, "consolidado_sucursales": true, "carga_menu": "la_hacemos_nosotros", "arranque": "visita_presencial"}'::jsonb,
    true, true, 3
  )
ON CONFLICT (codigo) DO UPDATE SET
  nombre                  = EXCLUDED.nombre,
  descripcion             = EXCLUDED.descripcion,
  vertical                = EXCLUDED.vertical,
  precio_mensual_mxn      = EXCLUDED.precio_mensual_mxn,
  max_sucursales          = EXCLUDED.max_sucursales,
  max_cajas_por_sucursal  = EXCLUDED.max_cajas_por_sucursal,
  timbres_cfdi_mensuales  = EXCLUDED.timbres_cfdi_mensuales,
  features_incluidos      = EXCLUDED.features_incluidos,
  visible_publico         = EXCLUDED.visible_publico,
  activo                  = EXCLUDED.activo,
  orden_visualizacion     = EXCLUDED.orden_visualizacion,
  updated_at              = now();

-- ---------------------------------------------------------------------------
-- 3. Retirar los planes por vertical
--
-- `activo = false` los saca del selector del panel y del alta. Siguen en la
-- tabla, y quien los tenga contratado los conserva con su precio: el histórico
-- de a cuánto se le vendió a cada cliente es justo lo que hace falta el día que
-- alguien reclama un cobro.
--
-- Se marcan por código, no por «los que tienen vertical no nula», para que
-- añadir un plan nuevo mañana no los arrastre.
-- ---------------------------------------------------------------------------
UPDATE planes
   SET activo = false, visible_publico = false, updated_at = now()
 WHERE codigo IN ('FT', 'QS', 'CB', 'FS', 'DK', 'ENT');

-- ---------------------------------------------------------------------------
-- 4. El alta respeta lo que el plan incluye
--
-- Aquí estaba el hueco que habría convertido los escalones en etiquetas: el
-- permiso para facturar lo da `tenant_addon_activo()`, que solo mira si hay fila
-- vigente en `tenant_addons`. O sea que un cliente de Negocio —que paga la
-- facturación DENTRO de su plan— se daba de alta sin esa fila y no podía timbrar
-- ni una factura. Habría pagado por algo que el sistema le negaba, y el fallo
-- solo aparece el día que su primer comensal pide comprobante.
--
-- Se arregla en el alta y no cambiando el gate: `tenant_addons` sigue siendo la
-- única fuente de quién puede facturar. Dos fuentes (la fila y el plan) es como
-- se llega a que el panel diga una cosa y el timbrado haga otra.
--
-- El add-on incluido entra a precio CERO, que es la verdad: ya está cobrado
-- dentro de la mensualidad. Así el tablero de CFDI lo lista —puede facturar, hay
-- que vigilarle los folios— sin inflar el ingreso por add-ons.
--
-- Se REEMPLAZA la envoltura de la 0085 en vez de encadenar otra: dos capas de
-- envoltorio sobre la misma función son imposibles de seguir a los seis meses.
-- Esta versión hace las dos siembras y es la única que hay que leer.
-- ---------------------------------------------------------------------------
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
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_tenant   uuid;
  v_addon    uuid;
  v_incluido boolean;
  v_plan_nom varchar;
BEGIN
  v_tenant := crear_tenant_con_owner_base(
    p_owner_user_id, p_codigo, p_nombre_comercial, p_nombre_owner,
    p_telefono_owner, p_vertical, p_plan_codigo, p_estado, p_notas_internas
  );

  /* Unidades de medida (venía de la 0085): sin ellas `insumos.unidad_medida_id`
     es NOT NULL y el módulo de inventario nace inservible, con el botón «Nuevo
     insumo» apagado y sin decir por qué. */
  PERFORM sembrar_unidades_base(v_tenant);

  /* Facturación, si el plan la incluye. */
  SELECT COALESCE((features_incluidos->>'cfdi_incluido')::boolean, false), nombre
    INTO v_incluido, v_plan_nom
    FROM planes WHERE codigo = p_plan_codigo;

  IF COALESCE(v_incluido, false) THEN
    SELECT id INTO v_addon FROM addons WHERE codigo = 'CFDI';
    IF v_addon IS NOT NULL THEN
      INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas)
      VALUES (
        v_tenant, v_addon, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 0,
        'Incluido en el plan ' || COALESCE(v_plan_nom, p_plan_codigo)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_tenant;
END;
$$;

COMMENT ON FUNCTION crear_tenant_con_owner IS
  'Alta de negocio + owner. Envuelve crear_tenant_con_owner_base y siembra lo que el alta no hacía: unidades de medida (0085) y el add-on CFDI cuando el plan lo incluye (0086).';

-- Al recrear la función se pierden sus permisos, y sin esto el provisioning falla
-- con un error de permisos que no dice de dónde viene.
REVOKE ALL ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_tenant_con_owner(uuid, varchar, varchar, varchar, varchar, vertical_tipo, varchar, tenant_estado, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Los clientes que YA existen y tienen un plan con CFDI incluido
--
-- Solo aplica a quien ya esté en uno de los tres escalones nuevos, que hoy es
-- nadie: el paso 4 solo corre en altas futuras, y sin esto un cliente movido a
-- Negocio a mano se quedaría sin poder facturar. No toca a nadie más.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_addon uuid;
  v_n     int := 0;
  v_t     record;
BEGIN
  SELECT id INTO v_addon FROM addons WHERE codigo = 'CFDI';
  IF v_addon IS NULL THEN RETURN; END IF;

  FOR v_t IN
    SELECT t.id, p.nombre
      FROM tenants t
      JOIN planes p ON p.id = t.plan_actual_id
     WHERE t.deleted_at IS NULL
       AND COALESCE((p.features_incluidos->>'cfdi_incluido')::boolean, false)
       AND NOT EXISTS (
         SELECT 1 FROM tenant_addons ta
          WHERE ta.tenant_id = t.id AND ta.addon_id = v_addon AND ta.activo
       )
  LOOP
    INSERT INTO tenant_addons (tenant_id, addon_id, fecha_inicio, activo, precio_mensual_mxn, notas)
    VALUES (v_t.id, v_addon, (now() AT TIME ZONE 'America/Mexico_City')::date, true, 0,
            'Incluido en el plan ' || v_t.nombre)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 THEN
    RAISE NOTICE 'Add-on CFDI activado para % cliente(s) cuyo plan lo incluye.', v_n;
  END IF;
END $$;
