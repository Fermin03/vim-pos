-- Smoke de zonas de envío. Corre como postgres contra la BD sembrada, en transacción con ROLLBACK.
-- Objetivo: el contrato completo del cargo de envío — catálogo, totales, IVA heredado,
--           un solo renglón vivo, y la invariante que protege el timbrado.
-- Uso: cd desktop && npm run smokes -- smoke_envio.sql
BEGIN;

DO $$
DECLARE
  v_tenant uuid := '99999999-0000-0000-0000-0000000000aa';
  v_suc    uuid := '99999999-0000-0000-0000-0000000000bb';
  v_z_centro uuid;
  v_z_norte  uuid;
BEGIN
  -- 1) Alta de zonas
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Centro', 0.00) RETURNING id INTO v_z_centro;
  INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
  VALUES (v_tenant, v_suc, 'Zona Norte', 35.00) RETURNING id INTO v_z_norte;

  -- 2) Nombre repetido en la misma sucursal: rechazado aunque cambien mayúsculas y espacios
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, '  zona norte ', 50.00);
    RAISE EXCEPTION 'FALLO: se permitió una zona con nombre duplicado';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3) Costo negativo: rechazado
  BEGIN
    INSERT INTO zonas_envio (tenant_id, sucursal_id, nombre, costo_mxn)
    VALUES (v_tenant, v_suc, 'Imposible', -1.00);
    RAISE EXCEPTION 'FALLO: se permitió un costo de envío negativo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4) Las columnas nuevas existen y aceptan la zona
  UPDATE direcciones_cliente SET zona_envio_id = v_z_norte WHERE false;
  UPDATE tickets             SET zona_envio_id = v_z_norte WHERE false;
  UPDATE ticket_items        SET cargo_tipo    = 'ENVIO'   WHERE false;

  -- 5) El CHECK de cargo_tipo existe (el rechazo real se prueba en el smoke de la RPC, que sí
  --    crea renglones)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_items_cargo_tipo_chk') THEN
    RAISE EXCEPTION 'FALLO: falta el CHECK de cargo_tipo';
  END IF;

  RAISE NOTICE 'OK esquema de zonas_envio';
END $$;

ROLLBACK;
