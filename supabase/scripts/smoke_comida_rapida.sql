-- Smoke 0242: configuración del mostrador. Las columnas nacen en false y un negocio no lee la
-- configuración de otro.
-- Uso: cd desktop && npm run smokes -- smoke_comida_rapida.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t      uuid := '99999999-0000-0000-0000-0000000000aa';
  v_otro   uuid := '61616161-0000-0000-0000-0000000000ab';
  v_cajero uuid := '99999999-0000-0000-0000-000000000001';
  v_n      integer;
  v_nombre boolean;
  v_comer  boolean;
BEGIN
  INSERT INTO tenants (id, codigo, nombre_comercial, estado, vertical_principal)
  VALUES (v_otro, 'tenant-0242', 'Otro negocio', 'INTERNO', 'QUICK_SERVICE');
  INSERT INTO configuracion_tenant (tenant_id) VALUES (v_t), (v_otro);

  -- 1) Valores por defecto.
  SELECT pedir_nombre_cliente, tiene_donde_comer INTO v_nombre, v_comer FROM configuracion_tenant WHERE tenant_id = v_t;
  IF v_nombre IS DISTINCT FROM false OR v_comer IS DISTINCT FROM false THEN
    RAISE EXCEPTION '1: los valores por defecto no son false (% / %)', v_nombre, v_comer;
  END IF;

  -- 2) Otro negocio no las lee ni las cambia.
  UPDATE configuracion_tenant SET pedir_nombre_cliente = true, tiene_donde_comer = true WHERE tenant_id = v_otro;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated', 'tenant_id', v_t)::text, true);
  SELECT count(*) INTO v_n FROM configuracion_tenant WHERE tenant_id = v_otro;
  IF v_n <> 0 THEN RAISE EXCEPTION '2: un negocio leyó la configuración de otro'; END IF;
  SELECT pedir_nombre_cliente INTO v_nombre FROM configuracion_tenant;
  IF v_nombre IS DISTINCT FROM false THEN RAISE EXCEPTION '2: la configuración propia se contaminó'; END IF;
  RAISE NOTICE 'smoke_comida_rapida OK';
END $$;
ROLLBACK;
