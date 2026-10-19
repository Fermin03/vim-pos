-- Belleza, entrega 1: la agenda viaja con la caja instalada (diseño 2026-10-18).
--
-- Pull: baja el catálogo de la agenda completo (las ausencias, solo las vigentes o futuras) y las
-- citas desde hace 7 días (día de America/Mexico_City) más las que están en espera, con sus tramos.
-- Push: acepta `citas` y `citas_servicios` hechas o editadas en la caja (las RPC de la 0218 corren
-- contra su Postgres local). La caja las manda por huella, como las cotizaciones (0213). El catálogo
-- NO se acepta desde la caja: si llega, queda en `_ignoradas`.
-- Empalmes: la caja agenda sin ver lo que la nube agendó mientras estaba sin internet. Un tramo que
-- choca con otro de la nube no se pierde ni se rechaza: entra con `empalme = true`, y se marcan
-- también el tramo de la nube y las dos citas. La recepción lo arregla y `resolver_empalme` (0218)
-- quita la marca. Nunca se borra ni se cancela una cita por chocar.

-- ── §1 Aplicador ────────────────────────────────────────────────────────────
-- Molde de _vim_aplicar_cotizaciones_caja (0213). Corre en origin: el disparador de `activa`
-- (0218) decide si cada tramo ocupa, según el estado de la cita en la nube.
--   · tenant_id de la fila = el del dispositivo; un id que ya es de otro negocio es error;
--   · sucursal, cliente (redirigido por clientes_alias, 0156) y venta, del negocio;
--   · una cita TERMINADA, NO_LLEGO o CANCELADA en la nube ya no cambia: una copia vieja de la caja
--     no la regresa a «Por llegar». Fuera de eso gana el último push;
--   · la cita se escribe completa con sus tramos: los de la nube se borran y entran los que manda la
--     caja (editar en la caja les da ids nuevos). Un tramo cuya cita no entró en este envío se salta;
--   · producto, colaborador y espacio de cada tramo, del negocio;
--   · un tramo que se cruza con otro activo (de otra cita, mismo colaborador o mismo espacio) entra
--     con empalme = true y marca al otro y a las dos citas. Se busca a mano y no con el EXCLUDE:
--     el EXCLUDE no ve los tramos ya marcados, y un reenvío borraría la marca de la cita entrante.
-- Devuelve {citas int, citas_servicios int, errores [{tabla, id, error}]}.
CREATE OR REPLACE FUNCTION _vim_aplicar_citas_caja(p_tenant uuid, p_citas jsonb, p_servicios jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fila      jsonb;
  v_cita      uuid;
  v_cli       uuid;
  v_dueno     uuid;
  v_estado    cita_estado;
  v_choca     uuid[];
  v_aplicadas uuid[] := '{}';
  v_nc        integer := 0;
  v_ns        integer := 0;
  v_errores   jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_citas) = 'array' THEN
    FOR v_fila IN SELECT value FROM jsonb_array_elements(p_citas) ORDER BY value->>'created_at' LOOP
      BEGIN
        v_cita := (v_fila->>'id')::uuid;
        IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'fila de otro negocio';
        END IF;
        v_dueno := NULL; v_estado := NULL;
        SELECT tenant_id, estado INTO v_dueno, v_estado FROM citas WHERE id = v_cita;
        IF v_dueno IS DISTINCT FROM p_tenant AND v_dueno IS NOT NULL THEN
          RAISE EXCEPTION 'el id ya existe en otro negocio';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = (v_fila->>'sucursal_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'sucursal de otro negocio';
        END IF;
        v_cli := (v_fila->>'cliente_id')::uuid;
        IF v_cli IS NOT NULL THEN
          v_cli := COALESCE((SELECT cliente_id FROM clientes_alias WHERE alias_id = v_cli AND tenant_id = p_tenant), v_cli);
          v_fila := v_fila || jsonb_build_object('cliente_id', v_cli);
          IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cli AND tenant_id = p_tenant) THEN
            RAISE EXCEPTION 'cliente de otro negocio';
          END IF;
        END IF;
        IF v_fila->>'ticket_id' IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM tickets WHERE id = (v_fila->>'ticket_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'venta de otro negocio o que aún no sube';
        END IF;
        IF v_estado IN ('TERMINADA', 'NO_LLEGO', 'CANCELADA') THEN
          CONTINUE;   -- cerrada en la nube: la copia de la caja no la reabre
        END IF;
        -- Primero fuera los tramos de la nube: cambiar el estado no debe reactivar unos que se van.
        DELETE FROM citas_servicios WHERE cita_id = v_cita;
        INSERT INTO citas AS c SELECT * FROM jsonb_populate_record(NULL::citas, v_fila)
          ON CONFLICT (id) DO UPDATE SET
            sucursal_id = EXCLUDED.sucursal_id, cliente_id = EXCLUDED.cliente_id,
            cliente_nombre = EXCLUDED.cliente_nombre, cliente_telefono = EXCLUDED.cliente_telefono,
            cliente_email = EXCLUDED.cliente_email, estado = EXCLUDED.estado, canal = EXCLUDED.canal,
            inicia = EXCLUDED.inicia, termina = EXCLUDED.termina, llego_at = EXCLUDED.llego_at,
            nota = EXCLUDED.nota, cancelada_motivo = EXCLUDED.cancelada_motivo, empalme = EXCLUDED.empalme,
            updated_at = EXCLUDED.updated_at
          WHERE c.tenant_id = p_tenant;
        v_aplicadas := v_aplicadas || v_cita;
        v_nc := v_nc + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errores := v_errores || jsonb_build_object('tabla', 'citas', 'id', v_fila->>'id', 'error', SQLERRM);
      END;
    END LOOP;
  END IF;

  IF jsonb_typeof(p_servicios) = 'array' THEN
    FOR v_fila IN SELECT value FROM jsonb_array_elements(p_servicios) ORDER BY value->>'cita_id', (value->>'orden')::integer LOOP
      BEGIN
        v_cita := (v_fila->>'cita_id')::uuid;
        IF (v_fila->>'tenant_id')::uuid IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'fila de otro negocio';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM citas WHERE id = v_cita AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'cita de otro negocio o que aún no sube';
        END IF;
        IF NOT (v_cita = ANY(v_aplicadas)) THEN
          CONTINUE;   -- su cita no se escribió en este envío (cerrada en la nube)
        END IF;
        SELECT tenant_id INTO v_dueno FROM citas_servicios WHERE id = (v_fila->>'id')::uuid;
        IF FOUND AND v_dueno IS DISTINCT FROM p_tenant THEN
          RAISE EXCEPTION 'el id ya existe en otro negocio';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM productos WHERE id = (v_fila->>'producto_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'producto de otro negocio';
        END IF;
        IF v_fila->>'usuario_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM usuarios_acceso WHERE usuario_id = (v_fila->>'usuario_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'colaborador de otro negocio';
        END IF;
        IF v_fila->>'espacio_id' IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM espacios WHERE id = (v_fila->>'espacio_id')::uuid AND tenant_id = p_tenant) THEN
          RAISE EXCEPTION 'espacio de otro negocio';
        END IF;

        -- ¿Ocupará (según el estado de su cita en la nube) un tramo que otro ya ocupa?
        v_choca := NULL;
        IF (SELECT estado NOT IN ('CANCELADA', 'NO_LLEGO', 'EN_ESPERA') FROM citas WHERE id = v_cita)
           AND v_fila->>'inicia' IS NOT NULL AND v_fila->>'termina' IS NOT NULL THEN
          SELECT array_agg(o.id) INTO v_choca
            FROM citas_servicios o
           WHERE o.tenant_id = p_tenant AND o.activa AND o.cita_id <> v_cita
             AND (o.usuario_id = (v_fila->>'usuario_id')::uuid
                  OR (v_fila->>'espacio_id' IS NOT NULL AND o.espacio_id = (v_fila->>'espacio_id')::uuid))
             AND tstzrange(o.inicia, o.termina, '[)') && tstzrange((v_fila->>'inicia')::timestamptz, (v_fila->>'termina')::timestamptz, '[)');
        END IF;
        IF v_choca IS NOT NULL THEN
          UPDATE citas_servicios SET empalme = true WHERE id = ANY(v_choca) AND NOT empalme;
          UPDATE citas SET empalme = true
           WHERE NOT empalme AND (id = v_cita OR id IN (SELECT cita_id FROM citas_servicios WHERE id = ANY(v_choca)));
          v_fila := v_fila || '{"empalme": true}'::jsonb;
        END IF;
        INSERT INTO citas_servicios SELECT * FROM jsonb_populate_record(NULL::citas_servicios, v_fila);
        v_ns := v_ns + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errores := v_errores || jsonb_build_object('tabla', 'citas_servicios', 'id', v_fila->>'id', 'error', SQLERRM);
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('citas', v_nc, 'citas_servicios', v_ns, 'errores', v_errores);
END;
$fn$;
REVOKE ALL ON FUNCTION _vim_aplicar_citas_caja(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ── §2 sync_pull_snapshot ───────────────────────────────────────────────────
-- La de la 0210 (vigente) más la agenda (marcado "0219"). La ventana de citas vive en `ci`.
CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  WITH ci AS (   -- 0219: las citas que bajan
    SELECT c.id FROM citas c
     WHERE c.tenant_id = p_tenant
       AND (c.estado = 'EN_ESPERA'
            OR c.inicia >= (((now() AT TIME ZONE 'America/Mexico_City')::date - 7)::timestamp AT TIME ZONE 'America/Mexico_City'))
  )
  SELECT jsonb_build_object(
    'tenants',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Menú por sucursal (0152, ADR 0027).
    'productos_sucursal',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0187: el catálogo de colonias (ADR 0036). Sube y baja, como las zonas.
    'colonias',                       coalesce((SELECT jsonb_agg(to_jsonb(x) - 'nombre_busqueda') FROM colonias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Propinas por sucursal (0184): lo que el dueño configura en el admin, para que la caja lo respete.
    'sucursal_propinas_config',       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursal_propinas_config x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Anuncios de la pantalla del cliente (0150). Solo la lista: las imágenes las baja la caja aparte.
    'anuncios_pantalla',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM anuncios_pantalla x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Lealtad (0156, ADR 0030). Los clientes bajan por primera vez: sin esto el cliente de una
    -- sucursal no existe en la otra. Los saldos bajan solo para mostrarse; la caja les suma lo que
    -- aún no subió. Los movimientos NO bajan.
    'clientes',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_programa',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_programa x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_premios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_premios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'lealtad_saldos',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM lealtad_saldos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0210: el crédito. Las filas son inmutables y la caja baja en cada ciclo, así que basta la
    -- ventana: lo que sigue debiéndose (o a favor) y lo de los últimos 90 días, que trae el abono o
    -- el uso que dejó la cuenta en cero. Sin la ventana, la caja se quedaría con una deuda o un saldo
    -- a favor que ya no existen.
    'clientes_credito',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM clientes_credito x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'abonos_credito',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM abonos_credito x WHERE x.tenant_id = p_tenant
                                        AND (x.created_at >= now() - interval '90 days' OR credito_saldo_ticket(x.ticket_id) > 0)), '[]'::jsonb),
    -- 0210: deuda de cada venta a crédito con saldo, para que la caja sume la de otras cajas (§0).
    'creditos_resumen_nube',          coalesce((SELECT jsonb_agg(jsonb_build_object('ticket_id', v.id, 'tenant_id', v.tenant_id,
                                          'cliente_id', v.cliente_id, 'saldo_mxn', v.saldo, 'fecha_venta', v.fecha, 'sincronizado_at', now()))
                                        FROM (SELECT t.id, t.tenant_id, t.cliente_id, COALESCE(t.fecha_pago, t.fecha_apertura) AS fecha,
                                                     credito_saldo_ticket(t.id) AS saldo
                                                FROM tickets t
                                               WHERE t.tenant_id = p_tenant AND t.cliente_id IS NOT NULL
                                                 AND t.id IN (SELECT p.ticket_id FROM pagos p WHERE p.metodo_pago = 'CREDITO'
                                                                 AND p.estado = 'APLICADO' AND p.deleted_at IS NULL)) v
                                       WHERE v.saldo > 0), '[]'::jsonb),
    'saldo_favor_movimientos',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM saldo_favor_movimientos x WHERE x.tenant_id = p_tenant
                                        AND x.cliente_id IN (SELECT s.cliente_id FROM saldo_favor_movimientos s WHERE s.tenant_id = p_tenant
                                                              GROUP BY s.cliente_id
                                                             HAVING max(s.created_at) >= now() - interval '90 days'
                                                                 OR sum(CASE WHEN s.tipo = 'USO' THEN -s.monto_mxn ELSE s.monto_mxn END) > 0)), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- 0195: existencias por producto de todas las sucursales vivas (la caja enseña las de las otras).
    'producto_existencias',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM producto_existencias x WHERE x.tenant_id = p_tenant
                                        AND x.sucursal_id IN (SELECT id FROM sucursales WHERE tenant_id = p_tenant AND deleted_at IS NULL)), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
  -- 0219: la agenda, en su propio objeto (jsonb_build_object no acepta más de 100 argumentos).
  -- El catálogo entero; las ausencias que aún no terminan; las citas de los últimos 7 días (día de
  -- México) y las que esperan, con sus tramos tal como están (`activa` y `empalme` incluidos).
  || jsonb_build_object(
    'tipos_espacio',                  coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tipos_espacio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'espacios',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM espacios x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'servicios_agenda',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM servicios_agenda x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'colaboradores_agenda',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM colaboradores_agenda x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'servicio_colaborador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM servicio_colaborador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'horarios_colaborador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM horarios_colaborador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'ausencias_colaborador',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM ausencias_colaborador x WHERE x.tenant_id = p_tenant
                                        AND x.hasta >= (now() AT TIME ZONE 'America/Mexico_City')::date), '[]'::jsonb),
    'citas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM citas x WHERE x.id IN (SELECT id FROM ci)), '[]'::jsonb),
    'citas_servicios',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM citas_servicios x WHERE x.cita_id IN (SELECT id FROM ci)), '[]'::jsonb)
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;

-- ── §3 sync_push_snapshot ───────────────────────────────────────────────────
-- La de la 0213 (vigente) más las citas (marcado "0219"): se aplican al final, en origin; no cuentan
-- entre las ignoradas y sirven para hallar la sucursal del rastro.
CREATE OR REPLACE FUNCTION sync_push_snapshot(p_tenant uuid, p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tabla     text;
  v_res       jsonb := '{}'::jsonb;
  v_det       jsonb;
  v_errores   jsonb := '[]'::jsonb;
  v_ignoradas text[] := ARRAY[]::text[];
  v_ini       timestamptz := clock_timestamp();
  v_total     integer := 0;
  v_aplicadas integer := 0;
  v_caja      uuid;
  v_sucursal  uuid;
  v_disp      text;
  v_desc      text;
  v_min       timestamptz;
  v_max       timestamptz;
  v_tickets   jsonb;
  v_descartados jsonb;   -- 0195
  /* Orden de dependencia (ver 0089). `repartidores` primero: `delivery_asignaciones` lo
     referencia. 0117: clientes y direcciones antes que tickets. 0122: lo que cuelga de la venta
     después de sus renglones y pagos; `devoluciones` antes que sus renglones y que
     `cancelaciones_ticket` (que apunta a la devolución que la originó). */
  v_tablas    text[] := ARRAY[
    'repartidores',
    'zonas_envio',
    'colonias',   -- 0187
    'clientes', 'direcciones_cliente',
    'turnos', 'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos',
    'ticket_descuentos_manuales', 'ticket_promociones_aplicadas', 'ticket_canjes_lealtad', 'comanda_impresiones', 'ticket_reimpresiones',
    'devoluciones', 'devolucion_items', 'cancelaciones_ticket',
    'movimientos_caja',
    'delivery_asignaciones', 'cortes_parciales', 'cortes_caja', 'cortes_caja_detalle', 'reportes_z_historico'
  ];
BEGIN
  -- 0156: el teléfono es la identidad. Antes de aplicar nada, los clientes cuyo teléfono ya existe
  -- con otro id se anotan como alias y lo suyo se redirige. Ver _vim_fusionar_clientes.
  p_snapshot := _vim_fusionar_clientes(p_snapshot, p_tenant);
  IF jsonb_typeof(p_snapshot->'_fusion_errores') = 'array' THEN v_errores := v_errores || (p_snapshot->'_fusion_errores'); END IF;
  p_snapshot := p_snapshot - '_fusion_errores';
  -- 0156: una caja sin actualizar no manda las columnas nuevas. Ver _vim_compat_0156.
  p_snapshot := _vim_compat_0156(p_snapshot, p_tenant);
  -- 0187: la colonia que la caja capturó y la nube ya tiene con otro id se funde, no truena.
  p_snapshot := _vim_fusionar_colonias(p_snapshot, p_tenant);

  -- La guarda del FACTURADO (ver el encabezado, punto 2): si la nube ya lo facturó y la caja
  -- manda su copia PAGADO, se conserva FACTURADO. Se reescribe el JSON entrante antes de aplicar,
  -- así el resto de la fila (lo que cambió en la caja) entra igual.
  IF jsonb_typeof(p_snapshot->'tickets') = 'array' THEN
    SELECT jsonb_agg(
             CASE WHEN t.estado_fiscal = 'FACTURADO' AND r->>'estado_fiscal' = 'PAGADO'
                  THEN r || jsonb_build_object('estado_fiscal', 'FACTURADO')
                  ELSE r END)
      INTO v_tickets
      FROM jsonb_array_elements(p_snapshot->'tickets') AS r
      LEFT JOIN public.tickets t ON t.id = NULLIF(r->>'id', '')::uuid AND t.tenant_id = p_tenant;
    p_snapshot := jsonb_set(p_snapshot, '{tickets}', COALESCE(v_tickets, '[]'::jsonb));
  END IF;

  -- Modo réplica: sin triggers ni FK, para conservar folios/totales/estados tal como la caja
  -- los imprimió. Requiere el superusuario dueño de la función (definer).
  SET LOCAL session_replication_role = replica;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    v_det := _vim_apply_rows_detalle(v_tabla, p_snapshot->v_tabla, p_tenant);
    v_res := v_res || jsonb_build_object(v_tabla, (v_det->>'aplicadas')::integer);
    v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  END LOOP;

  -- 0156: un canje que el libro ya devolvió no revive con la copia tardía de la caja. Ver
  -- _vim_conciliar_canjes. Sigue en modo réplica, que es lo que se quiere para su UPDATE.
  v_det := _vim_conciliar_canjes(p_snapshot->'ticket_canjes_lealtad', p_tenant);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- El estado del piso (punto 3). En réplica: el trigger de updated_at no hace falta aquí.
  v_det := _vim_aplicar_estado_mesas(p_snapshot->'mesas_estado', p_tenant);
  v_res := v_res || jsonb_build_object('mesas_estado', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- Inventario: con triggers y FK normales. Es el último paso; no hace falta volver a réplica.
  SET LOCAL session_replication_role = origin;
  v_det := _vim_aplicar_movimientos(p_snapshot->'movimientos_inventario', p_tenant);
  v_res := v_res || jsonb_build_object('movimientos_inventario', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0156: lealtad. Igual que inventario: con triggers y FK normales, y la nube recalcula el saldo.
  v_det := _vim_aplicar_movimientos_lealtad(p_snapshot->'lealtad_movimientos', p_tenant);
  v_res := v_res || jsonb_build_object('lealtad_movimientos', (v_det->>'aplicadas')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0195: existencias por producto. En origin: el disparador mueve producto_existencias.
  v_det := _vim_aplicar_movimientos_producto(p_tenant, p_snapshot->'movimientos_producto');
  v_res := v_res || jsonb_build_object('movimientos_producto', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_descartados := COALESCE(v_det->'descartados', '[]'::jsonb);   -- 0195

  -- 0210: el crédito hecho en la caja. En origin, ya con las ventas y los turnos del lote aplicados.
  v_det := _vim_aplicar_credito_caja(p_tenant, 'abonos_credito', p_snapshot->'abonos_credito');
  v_res := v_res || jsonb_build_object('abonos_credito', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);
  v_det := _vim_aplicar_credito_caja(p_tenant, 'saldo_favor_movimientos', p_snapshot->'saldo_favor_movimientos');
  v_res := v_res || jsonb_build_object('saldo_favor_movimientos', (v_det->>'aplicados')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0213: las cotizaciones de la caja. En origin, ya con las ventas del lote aplicadas.
  v_det := _vim_aplicar_cotizaciones_caja(p_tenant, p_snapshot->'cotizaciones', p_snapshot->'cotizacion_items');
  v_res := v_res || jsonb_build_object('cotizaciones', (v_det->>'cotizaciones')::integer,
                                       'cotizacion_items', (v_det->>'cotizacion_items')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- 0219: las citas de la caja. En origin: el disparador de `activa` decide qué tramos ocupan.
  v_det := _vim_aplicar_citas_caja(p_tenant, p_snapshot->'citas', p_snapshot->'citas_servicios');
  v_res := v_res || jsonb_build_object('citas', (v_det->>'citas')::integer,
                                       'citas_servicios', (v_det->>'citas_servicios')::integer);
  v_errores := v_errores || COALESCE(v_det->'errores', '[]'::jsonb);

  -- ── Rastro del envío (0070/0073) ─────────────────────────────────────────
  BEGIN
    SELECT COALESCE(SUM(jsonb_array_length(v)), 0) INTO v_total
      FROM jsonb_each(p_snapshot) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
    SELECT COALESCE(SUM(value::int), 0) INTO v_aplicadas FROM jsonb_each_text(v_res);

    SELECT MIN((t->>'created_at')::timestamptz), MAX((t->>'created_at')::timestamptz)
      INTO v_min, v_max
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', '[]'::jsonb)) AS t;

    -- Caja y sucursal de la primera fila (tickets, turnos o, si solo vienen movimientos, pagos/movimientos).
    SELECT NULLIF(t->>'caja_id', '')::uuid, NULLIF(t->>'sucursal_id', '')::uuid
      INTO v_caja, v_sucursal
      FROM jsonb_array_elements(COALESCE(p_snapshot->'tickets', p_snapshot->'turnos', p_snapshot->'pagos', p_snapshot->'cotizaciones', '[]'::jsonb)) AS t   -- 0213
     LIMIT 1;
    IF v_sucursal IS NULL THEN
      SELECT NULLIF(t->>'sucursal_id', '')::uuid INTO v_sucursal
        FROM jsonb_array_elements(COALESCE(p_snapshot->'movimientos_inventario', p_snapshot->'movimientos_producto', p_snapshot->'citas', '[]'::jsonb)) AS t LIMIT 1;   -- 0195, 0219
    END IF;
    IF v_caja IS NULL AND v_sucursal IS NOT NULL THEN
      -- Un lote de puros movimientos no trae caja: se toma la de la sucursal con señal de vida más reciente.
      SELECT id INTO v_caja FROM public.cajas WHERE sucursal_id = v_sucursal AND tenant_id = p_tenant
       ORDER BY ultima_conexion DESC NULLS LAST, created_at LIMIT 1;
    END IF;

    SELECT COALESCE(NULLIF(c.identificador_dispositivo, ''), c.nombre, 'escritorio'),
           NULLIF(TRIM(CONCAT_WS(' · ', c.nombre, s.nombre)), '')
      INTO v_disp, v_desc
      FROM public.cajas c LEFT JOIN public.sucursales s ON s.id = c.sucursal_id
     WHERE c.id = v_caja;

    INSERT INTO public.sync_eventos (
      tenant_id, sucursal_id, caja_id, dispositivo_id, dispositivo_descripcion,
      operaciones_total, operaciones_exitosas, operaciones_error,
      fecha_operacion_min, fecha_operacion_max,
      fecha_procesado_inicio, fecha_procesado_fin, duracion_ms, request_summary, response_summary
    ) VALUES (
      p_tenant, v_sucursal, v_caja, COALESCE(v_disp, 'escritorio'), v_desc,
      v_total, v_aplicadas, jsonb_array_length(v_errores),
      v_min, v_max,
      v_ini, clock_timestamp(),
      GREATEST(EXTRACT(MILLISECONDS FROM clock_timestamp() - v_ini)::integer, 0),
      jsonb_build_object('origen', 'sync_push_snapshot'),
      -- 0123: el motivo de cada fila rechazada (hasta 20), no solo cuántas. Sin esto el detalle solo
      -- quedaba en la bitácora de la caja del local, y un rechazo que se reintenta cada 10 minutos
      -- no se podía diagnosticar desde aquí.
      v_res || CASE WHEN jsonb_array_length(v_errores) > 0
                    THEN jsonb_build_object('_errores', (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_errores) e LIMIT 20) x))
                    ELSE '{}'::jsonb END
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo registrar el evento: %', SQLERRM;
  END;

  BEGIN
    IF v_caja IS NOT NULL THEN
      UPDATE public.cajas SET ultima_conexion = now() WHERE id = v_caja;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_push_snapshot: no se pudo sellar ultima_conexion: %', SQLERRM;
  END;

  -- Tablas que la caja mandó y aquí no se replican (0089).
  SELECT array_agg(k) INTO v_ignoradas
    FROM jsonb_object_keys(p_snapshot) AS k
   WHERE NOT (k = ANY(v_tablas || ARRAY['movimientos_inventario', 'mesas_estado', 'lealtad_movimientos', 'movimientos_producto', 'abonos_credito', 'saldo_favor_movimientos', 'cotizaciones', 'cotizacion_items', 'citas', 'citas_servicios']));   -- 0210, 0213, 0219
  IF v_ignoradas IS NOT NULL AND array_length(v_ignoradas, 1) > 0 THEN
    RAISE WARNING 'sync_push_snapshot: el dispositivo mandó tablas que no se replican: %', v_ignoradas;
    v_res := v_res || jsonb_build_object('_ignoradas', to_jsonb(v_ignoradas));
  END IF;

  RETURN v_res || CASE WHEN jsonb_array_length(v_errores) > 0 THEN jsonb_build_object('_errores', v_errores) ELSE '{}'::jsonb END
               -- 0195: ids que la caja marca como subidos aunque la nube no los guardó.
               || CASE WHEN jsonb_array_length(v_descartados) > 0 THEN jsonb_build_object('_descartados', jsonb_build_object('movimientos_producto', v_descartados)) ELSE '{}'::jsonb END;
END;
$$;
REVOKE EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_push_snapshot(uuid, jsonb) TO service_role;
