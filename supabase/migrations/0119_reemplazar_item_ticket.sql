-- ============================================================================
-- 0119 — Editar un renglón de una cuenta abierta que todavía no sale a cocina.
--
-- En la caja, tocar un renglón del ticket lo reabre en su modal (modificadores o combo) para
-- cambiarlo (escritorio 0.4.81). Eso funcionaba solo en los carritos que viven en la pantalla:
-- en una cuenta de mesa cada producto se guarda en la base al tocarlo, y no había forma de
-- cambiarle "sin cebolla" a una hamburguesa ya guardada salvo cancelarla (con motivo) y volver a
-- capturarla.
--
-- reemplazar_item_ticket(item, líneas) hace esa sustitución de una sola vez:
--
--   1. Valida que el renglón se pueda tocar: vivo, no es componente suelto de combo ni cargo de
--      envío, la cuenta está BORRADOR/ABIERTO, NI ÉL NI SUS COMPONENTES se han mandado a cocina
--      (enviado_cocina_at, 0069), y no tiene descuento vigente ni precio cambiado con PIN —esos
--      se autorizaron para ESTE renglón y no se trasladan en silencio a otro—.
--   2. Lo cancela junto con sus hijos, con motivo 'EDITADO'. No se borra: la política de 0008 es
--      que los renglones de un ticket ABIERTO se cancelan, no se borran, y así queda rastro. Los
--      reportes de ventas ya excluyen renglones cancelados y no cuentan cancelaciones por renglón,
--      así que una edición no ensucia ninguna cifra.
--   3. Inserta las líneas nuevas con las RPC de siempre (agregar_item_a_ticket /
--      agregar_combo_a_ticket): mismas validaciones, mismos snapshots, mismo prorrateo de combos.
--   4. Las acomoda en el LUGAR del renglón viejo (orden_visualizacion), no al final de la cuenta.
--
-- "Cambiar solo 1 de 3" llega como dos líneas: la original con 2 y la editada con 1. "Cambiar las
-- 3" llega como una. Las líneas tienen que ser del mismo producto que el renglón: esto edita, no
-- sustituye una hamburguesa por una malteada.
--
-- Idempotente: si la llamada ya se aplicó (el renglón está cancelado como 'EDITADO' y todas las
-- líneas ya existen por su client_id_local), devuelve esas mismas líneas en vez de fallar. Así un
-- reintento tras un corte de red no duplica ni truena.
--
-- SECURITY INVOKER, como las RPC que llama: corre bajo la RLS del empleado (0008 permite UPDATE e
-- INSERT de ticket_items de su tenant).
-- ============================================================================

CREATE OR REPLACE FUNCTION reemplazar_item_ticket(
  p_ticket_item_id uuid,
  p_lineas         jsonb
) RETURNS uuid[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_item        record;
  v_linea       jsonb;
  v_client      text;
  v_nuevo       uuid;
  v_nuevos      uuid[] := '{}';
  v_filas_nuevas uuid[];
  v_ultimo      integer;
  v_n_filas     integer;
  v_existentes  uuid[];
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Hace falta al menos una línea para reemplazar el renglón';
  END IF;

  SELECT ti.*, t.estado_fiscal
    INTO v_item
    FROM ticket_items ti
    JOIN tickets t ON t.id = ti.ticket_id
   WHERE ti.id = p_ticket_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_item % no existe', p_ticket_item_id; END IF;

  -- Reintento de una edición que ya se aplicó: devolver lo que quedó, no fallar.
  IF v_item.cancelado AND v_item.motivo_cancelacion = 'EDITADO' THEN
    SELECT array_agg(ti.id ORDER BY ti.orden_visualizacion) INTO v_existentes
      FROM ticket_items ti
     WHERE ti.tenant_id = v_item.tenant_id
       AND ti.client_id_local IN (SELECT l->>'client_id_local' FROM jsonb_array_elements(p_lineas) l);
    IF COALESCE(array_length(v_existentes, 1), 0) = jsonb_array_length(p_lineas) THEN
      RETURN v_existentes;
    END IF;
  END IF;

  IF v_item.cancelado THEN RAISE EXCEPTION 'El producto ya está cancelado'; END IF;
  IF v_item.combo_rol = 'HIJO' THEN RAISE EXCEPTION 'Edita el combo completo'; END IF;
  IF v_item.cargo_tipo IS NOT NULL THEN RAISE EXCEPTION 'El cargo de envío se cambia desde la zona'; END IF;
  IF v_item.estado_fiscal NOT IN ('BORRADOR', 'ABIERTO') THEN
    RAISE EXCEPTION 'Solo se editan productos de cuentas abiertas (estado actual: %)', v_item.estado_fiscal;
  END IF;
  IF EXISTS (
    SELECT 1 FROM ticket_items
     WHERE (id = p_ticket_item_id OR (parent_item_id = p_ticket_item_id AND cancelado = false))
       AND enviado_cocina_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'El producto ya se mandó a cocina: ya no se puede modificar';
  END IF;
  IF v_item.precio_override THEN
    RAISE EXCEPTION 'El producto tiene el precio cambiado con autorización: quítalo antes de editarlo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ticket_descuentos_manuales
     WHERE ticket_item_id = p_ticket_item_id AND reversado = false
  ) THEN
    RAISE EXCEPTION 'El producto tiene un descuento: quítalo antes de editarlo';
  END IF;

  -- Cada línea: del mismo producto, con cantidad, y con un client_id_local que no exista todavía
  -- (si existiera, las RPC de alta devolverían ESE renglón por idempotencia y lo robaríamos).
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF COALESCE(v_linea->>'combo_producto_id', v_linea->>'producto_id') IS DISTINCT FROM v_item.producto_id::text THEN
      RAISE EXCEPTION 'Las líneas tienen que ser del mismo producto que el renglón que se edita';
    END IF;
    -- COALESCE: en un renglón normal combo_rol es NULL, y NULL <> algo no dispara el IF.
    IF COALESCE(v_item.combo_rol = 'PADRE', false) <> (v_linea ? 'combo_producto_id') THEN
      RAISE EXCEPTION 'Un combo se reemplaza por combos y un producto por productos';
    END IF;
    IF COALESCE((v_linea->>'cantidad')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;
    v_client := NULLIF(v_linea->>'client_id_local', '');
    IF v_client IS NULL THEN RAISE EXCEPTION 'Cada línea necesita su client_id_local'; END IF;
    IF EXISTS (SELECT 1 FROM ticket_items WHERE tenant_id = v_item.tenant_id AND client_id_local = v_client) THEN
      RAISE EXCEPTION 'client_id_local % ya existe', v_client;
    END IF;
    -- Los componentes de un combo también: reusar el id de un hijo del renglón viejo (cancelado,
    -- pero sigue ahí) haría que agregar_combo_a_ticket lo encontrara y rechazara el combo.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(v_linea->'componentes', '[]'::jsonb)) c
        JOIN ticket_items ti ON ti.tenant_id = v_item.tenant_id AND ti.client_id_local = c->>'client_id_local'
    ) THEN
      RAISE EXCEPTION 'Un componente trae un client_id_local que ya existe: manda ids nuevos';
    END IF;
  END LOOP;

  -- El hueco que deja el renglón viejo: su último orden (el del padre o el de su último hijo).
  SELECT MAX(orden_visualizacion) INTO v_ultimo
    FROM ticket_items
   WHERE id = p_ticket_item_id OR parent_item_id = p_ticket_item_id;

  -- 2) Cancelar el viejo con sus hijos. El trigger recalcula los totales (UPDATE OF cancelado).
  UPDATE ticket_items
     SET cancelado = true,
         motivo_cancelacion = 'EDITADO',
         usuario_cancelo_id = auth.uid(),
         cancelado_at = now()
   WHERE id = p_ticket_item_id
      OR (parent_item_id = p_ticket_item_id AND cancelado = false);

  -- 3) Las líneas nuevas, por las RPC de alta.
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF v_linea ? 'combo_producto_id' THEN
      v_nuevo := agregar_combo_a_ticket(
        v_item.ticket_id,
        (v_linea->>'combo_producto_id')::uuid,
        (v_linea->>'cantidad')::numeric,
        COALESCE(v_linea->'componentes', '[]'::jsonb),
        '[]'::jsonb,
        NULLIF(v_linea->>'nota_cocina', ''),
        v_linea->>'client_id_local');
    ELSE
      v_nuevo := agregar_item_a_ticket(
        v_item.ticket_id,
        (v_linea->>'producto_id')::uuid,
        (v_linea->>'cantidad')::numeric,
        NULLIF(v_linea->>'nota_cocina', ''),
        COALESCE(v_linea->'modificadores', '[]'::jsonb),
        v_linea->>'client_id_local');
    END IF;
    v_nuevos := v_nuevos || v_nuevo;
  END LOOP;

  -- 4) Acomodarlas donde estaba el viejo: se recorre lo que venía después y las nuevas (con sus
  --    hijos, en el orden en que entraron) ocupan el hueco.
  SELECT array_agg(id ORDER BY orden_visualizacion) INTO v_filas_nuevas
    FROM ticket_items
   WHERE id = ANY (v_nuevos) OR parent_item_id = ANY (v_nuevos);
  v_n_filas := array_length(v_filas_nuevas, 1);

  UPDATE ticket_items
     SET orden_visualizacion = orden_visualizacion + v_n_filas
   WHERE ticket_id = v_item.ticket_id
     AND orden_visualizacion > v_ultimo
     AND NOT (id = ANY (v_filas_nuevas));

  UPDATE ticket_items ti
     SET orden_visualizacion = v_ultimo + x.pos
    FROM unnest(v_filas_nuevas) WITH ORDINALITY AS x(id, pos)
   WHERE ti.id = x.id;

  RETURN v_nuevos;
END;
$$;

COMMENT ON FUNCTION reemplazar_item_ticket(uuid, jsonb) IS
  'Edita un renglón de una cuenta abierta que aún no sale a cocina: lo cancela (motivo EDITADO) con sus hijos y pone en su lugar las líneas dadas, del mismo producto, por agregar_item_a_ticket / agregar_combo_a_ticket. Rechaza lo ya enviado a cocina y lo que tenga descuento o precio cambiado. Idempotente por client_id_local. 0119.';

REVOKE EXECUTE ON FUNCTION reemplazar_item_ticket(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION reemplazar_item_ticket(uuid, jsonb) TO authenticated, service_role;
