-- Smoke de la 0125: en la NUBE, una sucursal con caja instalada emite folios de la serie W; sin
-- caja instalada, o corriendo en la caja misma, la serie normal. Sirve igual en el runner local
-- (Postgres de la caja: existe _vim_migraciones) y en el CI (base de la nube: no existe).
BEGIN;

DO $$
DECLARE
  v_suc     uuid := '99999999-0000-0000-0000-0000000000bb';
  v_caja    uuid := '99999999-0000-0000-0000-0000000000cc';
  v_codigo  varchar;
  v_anio    text := EXTRACT(YEAR FROM now())::integer::text;
  v_local   boolean := to_regclass('public._vim_migraciones') IS NOT NULL;
  v_folio   varchar;
  v_folio2  varchar;
BEGIN
  SELECT codigo INTO v_codigo FROM sucursales WHERE id = v_suc;

  -- Para probar el comportamiento de la NUBE en el runner local, se esconde el marcador de la caja
  -- (dentro de la transacción; el ROLLBACK lo devuelve).
  IF v_local THEN
    ALTER TABLE _vim_migraciones RENAME TO _vim_migraciones_smoke_0125;
  END IF;

  -- 1) Sin caja instalada: serie normal.
  UPDATE cajas SET ultima_conexion = NULL, ultimo_latido = NULL, version_app = NULL WHERE sucursal_id = v_suc;
  SELECT folio_completo INTO v_folio FROM generar_folio(v_suc, 'TICKET');
  IF v_folio NOT LIKE v_codigo || '-' || v_anio || '-%' THEN
    RAISE EXCEPTION 'sin caja instalada esperaba la serie normal, salió %', v_folio;
  END IF;

  -- 2) Con caja instalada (ya latió): serie W, con su propio contador empezando en 1.
  UPDATE cajas SET ultimo_latido = now() WHERE id = v_caja;
  SELECT folio_completo INTO v_folio FROM generar_folio(v_suc, 'TICKET');
  IF v_folio <> v_codigo || 'W-' || v_anio || '-000001' THEN
    RAISE EXCEPTION 'con caja instalada esperaba %W-%-000001, salió %', v_codigo, v_anio, v_folio;
  END IF;
  SELECT folio_completo INTO v_folio2 FROM generar_folio(v_suc, 'CANCELACION');
  IF v_folio2 NOT LIKE v_codigo || 'W-' || v_anio || '-%' THEN
    RAISE EXCEPTION 'la cancelación en la nube también debe ir en la serie W, salió %', v_folio2;
  END IF;
  SELECT folio_completo INTO v_folio2 FROM generar_folio(v_suc, 'TICKET');
  IF v_folio2 <> v_codigo || 'W-' || v_anio || '-000002' THEN
    RAISE EXCEPTION 'la serie W debe avanzar: esperaba 000002, salió %', v_folio2;
  END IF;

  -- 3) En la caja misma (marcador presente): serie normal aunque la sucursal tenga caja.
  IF v_local THEN
    ALTER TABLE _vim_migraciones_smoke_0125 RENAME TO _vim_migraciones;
    SELECT folio_completo INTO v_folio FROM generar_folio(v_suc, 'TICKET');
    IF v_folio NOT LIKE v_codigo || '-' || v_anio || '-%' THEN
      RAISE EXCEPTION 'en la caja esperaba la serie normal, salió %', v_folio;
    END IF;
  END IF;

  RAISE NOTICE 'smoke_folio_serie_nube OK (local=%)', v_local;
END $$;

ROLLBACK;
