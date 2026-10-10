-- Smoke tienda en línea (mig. 0161 §6): una sucursal recibe pedidos de la tienda solo si alguna
-- caja suya reportó turno abierto HACE POCO. La señal es una marca de tiempo y no un booleano para
-- que falle cerrada: una caja que deja de reportarlo no conserva un «sí» viejo junto a un latido fresco.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_caja_lista.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_suc  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
BEGIN
  UPDATE cajas SET espejo_apps_at = NULL, espejo_turno_abierto_at = NULL WHERE sucursal_id = v_suc;

  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '1: sin marca de turno abierto no debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now(), espejo_turno_abierto_at = now() WHERE id = v_caja;
  IF NOT sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '2: con una marca reciente debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now() - interval '2 minutes', espejo_turno_abierto_at = now() - interval '2 minutes' WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '3: una marca de hace 2 minutos ya no cuenta'; END IF;

  -- La caja sigue sondeando pero ya no reporta turno abierto (lo cerró, o dejó de declarar la tienda).
  UPDATE cajas SET espejo_apps_at = now() WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '4: un latido fresco con la marca de turno vieja no debe recibir'; END IF;

  UPDATE cajas SET espejo_turno_abierto_at = now(), activa = false WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '5: una caja desactivada no cuenta'; END IF;

  RAISE NOTICE 'smoke_tienda_caja_lista OK';
END $$;
ROLLBACK;
