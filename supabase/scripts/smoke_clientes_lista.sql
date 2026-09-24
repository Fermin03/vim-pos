-- Smoke de la lista paginada de clientes (0118): vw_clientes_lista trae datos + compras de cada
-- cliente, y vw_clientes_kpis da los indicadores del padrón COMPLETO (no de la página cargada).
-- Se auto-envuelve en transacción con ROLLBACK (no persiste nada).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_t uuid := '99999999-0000-0000-0000-0000000000aa';
  v_base_total int; v_base_rfc int;
  v_sin uuid; v_con uuid; v_borrado uuid;
  v_fila record; v_k record;
BEGIN
  SELECT COALESCE(total, 0), COALESCE(con_rfc, 0) INTO v_base_total, v_base_rfc
    FROM vw_clientes_kpis WHERE tenant_id = v_t;
  v_base_total := COALESCE(v_base_total, 0); v_base_rfc := COALESCE(v_base_rfc, 0);

  INSERT INTO clientes (tenant_id, nombre, telefono) VALUES (v_t, 'Smoke Lista Sin', '4779990118') RETURNING id INTO v_sin;
  INSERT INTO clientes (tenant_id, nombre, rfc) VALUES (v_t, 'Smoke Lista Con', 'XAXX010101000') RETURNING id INTO v_con;
  INSERT INTO clientes (tenant_id, nombre, deleted_at) VALUES (v_t, 'Smoke Lista Borrado', now()) RETURNING id INTO v_borrado;

  -- Un cliente sin compras aparece en ceros, no desaparece.
  SELECT * INTO v_fila FROM vw_clientes_lista WHERE id = v_sin;
  IF v_fila IS NULL THEN RAISE EXCEPTION 'el cliente sin compras no aparece en la lista'; END IF;
  IF v_fila.compras <> 0 OR v_fila.gasto_total_mxn <> 0 OR v_fila.ultima_visita IS NOT NULL THEN
    RAISE EXCEPTION 'cliente sin compras con cifras: % / % / %', v_fila.compras, v_fila.gasto_total_mxn, v_fila.ultima_visita;
  END IF;
  IF v_fila.telefono <> '4779990118' THEN RAISE EXCEPTION 'la lista no trae los datos de contacto'; END IF;

  -- Un borrado no aparece.
  IF EXISTS (SELECT 1 FROM vw_clientes_lista WHERE id = v_borrado) THEN RAISE EXCEPTION 'aparece un cliente borrado'; END IF;

  -- Los KPIs cuentan el padrón entero.
  SELECT * INTO v_k FROM vw_clientes_kpis WHERE tenant_id = v_t;
  IF v_k.total <> v_base_total + 2 THEN RAISE EXCEPTION 'total: % (esperaba %)', v_k.total, v_base_total + 2; END IF;
  IF v_k.con_rfc <> v_base_rfc + 1 THEN RAISE EXCEPTION 'con_rfc: % (esperaba %)', v_k.con_rfc, v_base_rfc + 1; END IF;

  RAISE NOTICE 'SMOKE CLIENTES LISTA OK: lista con cifras en cero, sin borrados, KPIs del padrón completo.';
END $$;
ROLLBACK;
