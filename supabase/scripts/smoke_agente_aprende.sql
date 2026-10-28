-- Smoke del agente que aprende (migración 0287): tabla de lecciones, caducidad a los 3 días y acceso solo de service_role.
-- Uso: cd desktop && npm run smokes -- smoke_agente_aprende.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_vieja uuid; v_nueva uuid;
BEGIN
  -- 1. Caducidad: solo la de 4 días pasa a CADUCADA
  INSERT INTO wa_lecciones (tipo, texto, evidencia, creado_en)
  VALUES ('DUDA', 'vieja', 'ev', now() - interval '4 days') RETURNING id INTO v_vieja;
  INSERT INTO wa_lecciones (tipo, texto, evidencia) VALUES ('TONO', 'nueva', 'ev') RETURNING id INTO v_nueva;
  ASSERT wa_caducar_lecciones() = 1, '1a: caduca una';
  ASSERT (SELECT estado FROM wa_lecciones WHERE id = v_vieja) = 'CADUCADA', '1b: la vieja caducó';
  ASSERT (SELECT estado FROM wa_lecciones WHERE id = v_nueva) = 'PENDIENTE', '1c: la de hoy sigue pendiente';
  ASSERT wa_caducar_lecciones() = 0, '1d: idempotente';

  -- 2. CHECK de estado
  BEGIN
    INSERT INTO wa_lecciones (tipo, texto, evidencia, estado) VALUES ('DUDA', 't', 'e', 'OTRO');
    RAISE EXCEPTION '2: aceptó estado OTRO';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3. Solo service_role
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM wa_lecciones;
    RAISE EXCEPTION '3: anon leyó wa_lecciones';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM wa_caducar_lecciones();
    RAISE EXCEPTION '3: anon ejecutó wa_caducar_lecciones';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

ROLLBACK;
