-- Smoke tienda en línea (mig. 0161 §6): una sucursal recibe pedidos de la tienda solo si alguna
-- caja suya consultó hace poco Y reportó turno abierto.
-- Uso: cd desktop && npm run smokes -- smoke_tienda_caja_lista.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_suc  uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja uuid := '99999999-0000-0000-0000-0000000000cc';
BEGIN
  UPDATE cajas SET espejo_apps_at = NULL, espejo_turno_abierto = false WHERE sucursal_id = v_suc;

  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '1: sin sondeo no debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now(), espejo_turno_abierto = false WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '2: con sondeo pero sin turno abierto no debe recibir'; END IF;

  UPDATE cajas SET espejo_turno_abierto = true WHERE id = v_caja;
  IF NOT sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '3: con sondeo reciente y turno abierto debe recibir'; END IF;

  UPDATE cajas SET espejo_apps_at = now() - interval '2 minutes' WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '4: un sondeo de hace 2 minutos ya no cuenta'; END IF;

  UPDATE cajas SET espejo_apps_at = now(), activa = false WHERE id = v_caja;
  IF sucursal_recibe_pedidos(v_suc) THEN RAISE EXCEPTION '5: una caja desactivada no cuenta'; END IF;

  RAISE NOTICE 'smoke_tienda_caja_lista OK';
END $$;
ROLLBACK;
