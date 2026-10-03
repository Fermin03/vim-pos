-- ============================================================================
-- 0151 — Detalles de los anuncios de la pantalla del cliente (ADR 0026).
--
-- 1) reordenar_anuncios: el nuevo orden se escribe en UNA sola operación.
-- 2) Solo el dueño o el admin cambian el tiempo general de los anuncios.
-- ============================================================================

-- ── 1) Reordenar de forma atómica ───────────────────────────────────────────
-- Antes el admin mandaba un UPDATE por anuncio: si la red o la pestaña se cortaban a la mitad, el
-- orden quedaba escrito a medias (dos anuncios con el mismo lugar, o uno fuera de sitio). Aquí todo
-- se decide en un solo UPDATE y, si algo no cuadra, la llamada entera se revierte.
--
-- SECURITY INVOKER a propósito: las políticas de anuncios_pantalla siguen mandando. La comprobación
-- de es_admin_del_tenant de arriba es para dar un mensaje claro; sin ella, un cajero recibiría un
-- «La lista cambió» engañoso (RLS le filtraría las filas y el conteo no cuadraría).
CREATE OR REPLACE FUNCTION reordenar_anuncios(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant      uuid := current_tenant_id();
  v_actualizados integer;
BEGIN
  IF NOT es_admin_del_tenant(v_tenant) THEN
    RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar los anuncios.' USING ERRCODE = '42501';
  END IF;

  -- Pasos de 10 (0, 10, 20…) como los que ya escribe la subida: deja hueco para insertar a mano.
  UPDATE anuncios_pantalla a
     SET orden = (n.pos - 1) * 10
    FROM unnest(p_ids) WITH ORDINALITY AS n(id, pos)
   WHERE a.id = n.id
     AND a.tenant_id = v_tenant
     AND a.deleted_at IS NULL;
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;

  -- Un id ajeno, dado de baja, inexistente o repetido hace que el conteo no coincida: la lista que
  -- tenía la página ya no es la de la base. Se revierte todo y se pide recargar.
  IF v_actualizados IS DISTINCT FROM cardinality(p_ids) THEN
    RAISE EXCEPTION 'La lista de anuncios cambió. Recarga la página.' USING ERRCODE = 'P0002';
  END IF;
END $$;

REVOKE ALL ON FUNCTION reordenar_anuncios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reordenar_anuncios(uuid[]) TO authenticated, service_role;

-- ── 2) Tiempo general: solo dueño o admin ───────────────────────────────────
-- POR QUÉ UN TRIGGER Y NO LA POLÍTICA DE configuracion_tenant
-- Esa política es FOR ALL por negocio y la usan otras pantallas (propina, impuestos, datos del
-- ticket…) con empleados que no son admin. Estrecharla para proteger UNA columna podría romper
-- esas pantallas. El trigger mira solo pantalla_cliente_segundos y deja pasar todo lo demás.
--
-- Solo se aplica a quien llega con sesión de usuario (auth.role() = 'authenticated'). No afecta a
-- service_role (funciones del servidor) ni a la caja: sus escrituras locales corren como postgres,
-- sin claims, y el pull del sync va en modo réplica, donde los triggers ni se disparan.
CREATE OR REPLACE FUNCTION configuracion_tenant_segundos_solo_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE' AND NEW.pantalla_cliente_segundos IS DISTINCT FROM OLD.pantalla_cliente_segundos)
     OR (TG_OP = 'INSERT' AND NEW.pantalla_cliente_segundos IS DISTINCT FROM 8) THEN
    IF NOT es_admin_del_tenant(NEW.tenant_id) THEN
      RAISE EXCEPTION 'Solo el dueño o un administrador puede cambiar el tiempo de los anuncios.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_configuracion_tenant_segundos_solo_admin ON configuracion_tenant;
CREATE TRIGGER trg_configuracion_tenant_segundos_solo_admin
  BEFORE INSERT OR UPDATE ON configuracion_tenant
  FOR EACH ROW EXECUTE FUNCTION configuracion_tenant_segundos_solo_admin();
