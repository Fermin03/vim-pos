-- Smoke T2 Reservaciones: crear (CONFIRMADA) -> confirmar llegada (LLEGO); y crear -> no-show. ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_dueno  uuid := '99999999-0000-0000-0000-0000000000e1';
  v_r1 uuid; v_r2 uuid; v_estado text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dueno::text, 'tenant_id', v_tenant::text)::text, true);

  v_r1 := crear_reservacion(v_suc, 'María López', '4771112233', NULL, now() + interval '2 hours', 4, 'TELEFONO'::reservacion_canal);
  SELECT estado INTO v_estado FROM reservaciones WHERE id=v_r1;
  RAISE NOTICE 'r1 creada: % (esperado CONFIRMADA)', v_estado;
  IF v_estado <> 'CONFIRMADA' THEN RAISE EXCEPTION 'no quedó CONFIRMADA'; END IF;

  PERFORM confirmar_llegada_reservacion(v_r1, NULL, NULL);
  SELECT estado INTO v_estado FROM reservaciones WHERE id=v_r1;
  RAISE NOTICE 'r1 tras llegada: % (esperado LLEGO)', v_estado;
  IF v_estado <> 'LLEGO' THEN RAISE EXCEPTION 'no quedó LLEGO'; END IF;

  v_r2 := crear_reservacion(v_suc, 'Cliente Ausente', '4774445566', NULL, now() + interval '30 minutes', 2, 'WHATSAPP'::reservacion_canal);
  PERFORM marcar_no_show_reservacion(v_r2);
  SELECT estado INTO v_estado FROM reservaciones WHERE id=v_r2;
  RAISE NOTICE 'r2 tras no-show: % (esperado NO_SHOW)', v_estado;
  IF v_estado <> 'NO_SHOW' THEN RAISE EXCEPTION 'no quedó NO_SHOW'; END IF;

  RAISE NOTICE 'SMOKE RESERVACIONES OK: crear->CONFIRMADA->LLEGO + crear->NO_SHOW.';
END $$;
ROLLBACK;
