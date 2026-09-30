-- 0133 · el dinero no se escribe por la puerta de atrás (REST directo a tabla)
--
-- Auditoría integral 30/09/2026 (hallazgo B-1, crítico). Las políticas RLS de las tablas de
-- dinero solo comprueban el negocio (`tenant_id = current_tenant_id()`), no QUÉ se escribe. Como
-- `authenticated` tiene INSERT/UPDATE/DELETE sobre ellas (0065), cualquier sesión del negocio —el
-- JWT de pin-login de un cajero o la sesión del dispositivo que guarda el navegador— podía
-- saltarse las RPCs y hablarle a PostgREST directo. Reproducido como `authenticated` en la BD
-- local:
--   · PATCH /tickets        total_mxn=1, estado_fiscal='CANCELADO' sobre un ticket PAGADO
--   · PATCH /pagos          monto_mxn=1
--   · PATCH /turnos         fondo_inicial_mxn=... (mueve el efectivo esperado del arqueo)
--   · PATCH /ticket_items   precio_unitario_snapshot=0.01 (el trigger recalcula el total solo)
--   · PATCH /productos      precio_base_mxn=0.01 (un cajero cambia el menú)
--   · POST  /cancelaciones_ticket  (el trigger AFTER INSERT cancela el ticket, sin PIN)
--   · POST  /devoluciones {total 5000, EFECTIVO, BORRADOR} + PATCH estado='CONFIRMADA'
--       → el trigger saca un movimiento de caja de -5000 y el arqueo "cuadra" con el faltante
--   · PATCH /movimientos_caja después de autorizado (el trigger del PIN solo corría en INSERT)
--
-- Por qué no un REVOKE: las RPCs del POS son casi todas SECURITY INVOKER (corren como
-- `authenticated` y escriben esas mismas tablas bajo RLS). Quitarle el privilegio de tabla a
-- `authenticated` las rompería todas, y reescribir ~40 RPCs como DEFINER es una migración que
-- nadie puede revisar de una sentada.
--
-- Arreglo: un trigger guardián BEFORE INSERT/UPDATE/DELETE, que corre ANTES que cualquier otro
-- BEFORE de la tabla (se llama `a00_…`: Postgres dispara los triggers del mismo evento por
-- orden alfabético, y todos los demás empiezan con `trg_`; así ve lo que mandó el cliente y no
-- lo que ya tocó otro trigger). Solo actúa cuando se cumplen las tres:
--
--   1) pg_trigger_depth() = 1 — la sentencia la lanzó el cliente, no la cascada de otro trigger
--      (recalcular totales, cerrar ticket, sacar el movimiento de una devolución...).
--   2) la petición es REST directa a una tabla: PostgREST pone `request.path` en cada petición
--      ('/tickets', '/rpc/aplicar_pago'); si NO empieza por '/rpc/' es escritura a tabla.
--      '/rpc/graphql' cuenta como directa: pg_graphql traduce mutaciones a escrituras de tabla
--      y Supabase lo sirve por esa ruta.
--   3) el rol está sujeto a RLS (ni superusuario ni BYPASSRLS: service_role, postgres). Las
--      Edge Functions con service_role (delivery-espejo sella cajas.espejo_apps_at, timbrado,
--      etc.) no pasan por aquí.
--
-- Sin `request.path` (SQL directo, smokes, pgTAP, el sync del escritorio que aplica en
-- `session_replication_role = replica`, jobs de pg_cron) el guardián no actúa, y es correcto:
-- ninguno de esos caminos lo puede usar un navegador. Un cliente solo llega a la base por
-- PostgREST, y PostgREST SIEMPRE fija `request.path` (desde v10; la nube y el postgrest.exe del
-- escritorio son v12). Una RPC (`/rpc/...`) sí escribe bajo el guardián apagado: es código
-- nuestro y cada una valida lo suyo.
--
-- Qué se permite por REST directo (lista blanca construida con grep de TODAS las escrituras
-- `.from("<tabla>").insert/update/upsert/delete` en apps/pos, apps/admin, apps/kds,
-- packages/kds-core, desktop/src y supabase/functions — multilínea, comillas simples y dobles):
--
--   tickets        UPDATE de: nombre_cliente, nota_general, nota_imprime_en_comanda,
--                  cliente_id, direccion_entrega_id, mesero_id (cobro.ts, clientes-cuenta.ts,
--                  mesero.ts) → solo con el ticket en BORRADOR/ABIERTO;
--                  estado_cocina (mesero.ts, kds-core/comandas.ts; lo valida
--                  trg_ticket_validar_estado_cocina), comanda_impresa_at (cuentas-abiertas.ts);
--                  deleted_at/deleted_by (borrarCuentaVacia) → solo BORRADOR/ABIERTO, sin
--                  renglones vivos ni pagos, y solo para borrar (no para "desborrar").
--   ticket_items   UPDATE de enviado_cocina_at (mesero.ts enviarACocina).
--   turnos         INSERT (turno.ts abrirTurno, verify-dia.mjs): solo un turno ABIERTO, del
--                  propio usuario, con fondo >= 0 y sin cifras de cierre.
--                  UPDATE de evento_comision_mxn (turno.ts) → turno ABIERTO y monto >= 0.
--   movimientos_caja  INSERT (movimientos.ts): solo los tipos que exigen PIN (SANGRIA,
--                  DEPOSITO, PAGO_PROVEEDOR, INYECCION_FONDO), en un turno ABIERTO de esa caja,
--                  sin cancelar, y el solicitante es quien llama. El PIN lo valida (y ahora lo
--                  consume) exigir_autorizacion_movimiento_caja (0134).
--   updated_at/updated_by siempre (los sella set_updated_at).
--   Todo lo demás (DELETE siempre; INSERT fuera de los dos casos; UPDATE de otra columna) se
--   rechaza con 42501.
--
-- Tablas de dinero cubiertas: tickets, ticket_items, ticket_item_modificadores, pagos,
-- devoluciones, devolucion_items, cancelaciones_ticket, movimientos_caja, turnos, cortes_caja,
-- cortes_caja_detalle, cortes_parciales, contadores_folio, ticket_descuentos_manuales,
-- ticket_promociones_aplicadas, reportes_z_historico, y —sin escritura directa legítima hoy—
-- propinas_distribucion, cierres_dia, delivery_asignaciones, denominaciones_conteo,
-- denominaciones_fondo.
--
-- Catálogo (productos, categorias, grupos_modificadores, opciones_modificador,
-- productos_grupos_modificadores, combo_grupos, combo_opciones, promociones): el panel escribe
-- directo (apps/admin/app/lib/{catalogo,combos,modificadores,areas-cocina,promociones}.ts), así
-- que no se bloquea la escritura: se limita a quien la matriz deja administrar el catálogo
-- (09-MATRIZ §4.8: DUEÑO, y ADMIN configurable). En la BD eso es el permiso `config.productos`
-- (`config.promociones` para promociones), que hoy tienen DUENO y ADMIN — los mismos que el
-- panel deja entrar a /catalogo y /promociones (acceso.ts, jerarquía >= 4). Un override del
-- negocio que se lo quite al ADMIN se respeta. Cajero, supervisor, personal y el dispositivo
-- ya no pueden cambiar un precio por REST.
--
-- Fuera de alcance (anotado en el informe): zonas_envio.costo_mxn lo edita el cajero desde el
-- POS (apps/pos/app/lib/zonas-envio.ts) y sigue abierto; y `sync_procesar_push` (el op-log
-- congelado del outbox web) es una RPC que inserta tickets/pagos con lo que manda el cliente.

-- ---------------------------------------------------------------------------------------------
-- ¿Esta sentencia es una escritura REST directa de un rol sujeto a RLS?
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._es_escritura_rest_directa()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(current_setting('request.path', true), '') <> ''
     AND (current_setting('request.path', true) NOT LIKE '/rpc/%'
          OR current_setting('request.path', true) LIKE '/rpc/graphql%')
     AND NOT coalesce((SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- ¿El usuario de la sesión tiene este permiso EN EL NEGOCIO DEL JWT? Envoltorio de
-- usuario_tiene_permiso_en_tenant (0132, la regla única de permisos: overrides, PERSONALIZADO,
-- multi-rol), que es solo de service_role porque pregunta por cualquier usuario y negocio. Esta
-- solo responde por quien llama, en su negocio.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.usuario_actual_tiene_permiso(p_permiso_codigo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND current_tenant_id() IS NOT NULL
     AND public.usuario_tiene_permiso_en_tenant(auth.uid(), current_tenant_id(), p_permiso_codigo);
$$;

REVOKE EXECUTE ON FUNCTION public.usuario_actual_tiene_permiso(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.usuario_actual_tiene_permiso(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- El guardián.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardia_escritura_directa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tabla      text := TG_TABLE_NAME;
  v_permitidas text[];
  v_cambiadas  text[];
  v_prohibidas text[];
  v_turno      record;
BEGIN
  IF pg_trigger_depth() <> 1 OR NOT _es_escritura_rest_directa() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- ── Catálogo: se escribe directo desde el panel, pero solo quien lo administra ──────────
  IF v_tabla IN ('productos', 'categorias', 'grupos_modificadores', 'opciones_modificador',
                 'productos_grupos_modificadores', 'combo_grupos', 'combo_opciones', 'promociones') THEN
    IF NOT usuario_actual_tiene_permiso(
         CASE WHEN v_tabla = 'promociones' THEN 'config.promociones' ELSE 'config.productos' END) THEN
      RAISE EXCEPTION 'Tu rol no puede modificar el catálogo (%).', v_tabla
        USING ERRCODE = 'insufficient_privilege',
              HINT = 'Lo administran el dueño y el administrador desde el panel.';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- ── Tablas de dinero ───────────────────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se borran filas de % desde el cliente.', v_tabla
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_tabla = 'turnos' THEN
      IF NEW.estado <> 'ABIERTO'
         OR NEW.fecha_cierre IS NOT NULL OR NEW.fecha_validacion IS NOT NULL
         OR NEW.usuario_cierre_id IS NOT NULL OR NEW.usuario_validacion_id IS NOT NULL
         OR NEW.efectivo_esperado_mxn IS NOT NULL OR NEW.efectivo_contado_mxn IS NOT NULL
         OR NEW.diferencia_mxn IS NOT NULL OR NEW.admin_decision IS NOT NULL
         OR NEW.evento_comision_mxn IS NOT NULL
         OR NEW.fondo_inicial_mxn IS NULL OR NEW.fondo_inicial_mxn < 0 THEN
        RAISE EXCEPTION 'Un turno se abre ABIERTO, con fondo >= 0 y sin cifras de cierre.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.usuario_apertura_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'El turno lo abre quien tiene la sesión.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NEW;
    END IF;

    IF v_tabla = 'movimientos_caja' THEN
      IF NEW.tipo NOT IN ('SANGRIA', 'DEPOSITO', 'PAGO_PROVEEDOR', 'INYECCION_FONDO') THEN
        RAISE EXCEPTION 'El movimiento % lo registra el sistema, no la caja.', NEW.tipo
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.cancelado OR NEW.cancelado_por IS NOT NULL OR NEW.fecha_cancelacion IS NOT NULL THEN
        RAISE EXCEPTION 'Un movimiento no nace cancelado.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      SELECT estado, caja_id, tenant_id INTO v_turno FROM turnos WHERE id = NEW.turno_id;
      IF NOT FOUND OR v_turno.estado <> 'ABIERTO' OR v_turno.caja_id <> NEW.caja_id
         OR v_turno.tenant_id <> NEW.tenant_id THEN
        RAISE EXCEPTION 'El movimiento va a un turno ABIERTO de esa misma caja.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- Quién lo pide sale de la sesión, no del cuerpo de la petición. Quién lo autorizó lo
      -- pone exigir_autorizacion_movimiento_caja desde la autorización (0134).
      NEW.usuario_solicitante_id := coalesce(auth.uid(), NEW.usuario_solicitante_id);
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No se insertan filas en % desde el cliente: usa la RPC correspondiente.', v_tabla
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- UPDATE: solo columnas de la lista blanca de la tabla.
  v_permitidas := CASE v_tabla
    WHEN 'tickets' THEN ARRAY['nombre_cliente', 'nota_general', 'nota_imprime_en_comanda',
                              'cliente_id', 'direccion_entrega_id', 'mesero_id',
                              'estado_cocina', 'comanda_impresa_at', 'deleted_at', 'deleted_by']
    WHEN 'ticket_items' THEN ARRAY['enviado_cocina_at']
    WHEN 'turnos' THEN ARRAY['evento_comision_mxn']
    ELSE ARRAY[]::text[]
  END || ARRAY['updated_at', 'updated_by'];

  -- Las columnas generadas (tickets.monto_pendiente_mxn) llegan NULL a un BEFORE: se calculan
  -- después. No las escribe nadie, así que no cuentan como cambio.
  SELECT coalesce(array_agg(n.key ORDER BY n.key), ARRAY[]::text[])
    INTO v_cambiadas
    FROM jsonb_each(to_jsonb(NEW)) n
   WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key)
     AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = TG_RELID AND a.attname = n.key AND a.attgenerated <> '');

  SELECT coalesce(array_agg(c), ARRAY[]::text[]) INTO v_prohibidas
    FROM unnest(v_cambiadas) c WHERE c <> ALL (v_permitidas);

  IF cardinality(v_prohibidas) > 0 THEN
    RAISE EXCEPTION 'No se modifica % (%) desde el cliente: usa la RPC correspondiente.',
      v_tabla, array_to_string(v_prohibidas, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_tabla = 'tickets' THEN
    IF v_cambiadas && ARRAY['nombre_cliente', 'nota_general', 'nota_imprime_en_comanda',
                            'cliente_id', 'direccion_entrega_id', 'mesero_id', 'deleted_at', 'deleted_by']
       AND OLD.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
      RAISE EXCEPTION 'La cuenta ya está %: sus datos no se cambian desde el cliente.', OLD.estado_fiscal
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_cambiadas && ARRAY['deleted_at', 'deleted_by'] THEN
      IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Una cuenta borrada no se recupera desde el cliente.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF EXISTS (SELECT 1 FROM ticket_items WHERE ticket_id = OLD.id AND cancelado = false) THEN
        RAISE EXCEPTION 'La cuenta tiene productos: cancélalos o cancela la cuenta.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF EXISTS (SELECT 1 FROM pagos WHERE ticket_id = OLD.id AND deleted_at IS NULL
                                       AND estado <> 'CANCELADO') THEN
        RAISE EXCEPTION 'La cuenta tiene pagos: no se puede borrar.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  ELSIF v_tabla = 'turnos' THEN
    IF OLD.estado <> 'ABIERTO' OR (NEW.evento_comision_mxn IS NOT NULL AND NEW.evento_comision_mxn < 0) THEN
      RAISE EXCEPTION 'La comisión del evento solo se registra con el turno ABIERTO y no es negativa.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- dinero
    'tickets', 'ticket_items', 'ticket_item_modificadores', 'pagos', 'devoluciones',
    'devolucion_items', 'cancelaciones_ticket', 'movimientos_caja', 'turnos', 'cortes_caja',
    'cortes_caja_detalle', 'cortes_parciales', 'contadores_folio', 'ticket_descuentos_manuales',
    'ticket_promociones_aplicadas', 'reportes_z_historico', 'propinas_distribucion', 'cierres_dia',
    'delivery_asignaciones', 'denominaciones_conteo', 'denominaciones_fondo',
    -- catálogo
    'productos', 'categorias', 'grupos_modificadores', 'opciones_modificador',
    'productos_grupos_modificadores', 'combo_grupos', 'combo_opciones', 'promociones'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER a00_guardia_escritura_directa BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guardia_escritura_directa()', t);
  END LOOP;
END $$;
