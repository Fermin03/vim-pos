-- ============================================================================
-- 0121 — La caja reporta su pantalla en el latido.
--
-- La interfaz de la caja tiene que verse bien tanto en una pantalla 1920×1080 como en la casi
-- cuadrada de Knock-Out (1024×768 o 1280×1024, según la escala de Windows), y no había forma de
-- saber qué pantalla tiene cada cliente sin preguntarle. El latido ya viaja cada 10 minutos (ADR
-- 0014): ahora trae también el tamaño y la escala, y el panel interno los enseña por caja.
--
-- Se guardan los píxeles FÍSICOS y la escala de Windows por separado, porque el diseño depende
-- de los dos: 1280×1024 al 125 % se comporta como 1024×819 para la interfaz.
--
-- caja_latido gana tres parámetros con DEFAULT NULL. Se reemplaza la firma (DROP + CREATE) en vez
-- de sumar una sobrecarga: con dos funciones del mismo nombre, la llamada de la Edge Function —que
-- usa parámetros con nombre— se volvería ambigua. La Edge Function que hoy está desplegada no
-- manda los nuevos y sigue funcionando: los defaults cubren la ventana entre esta migración y el
-- despliegue de la función nueva.
-- ============================================================================

ALTER TABLE cajas
  ADD COLUMN IF NOT EXISTS pantalla_ancho  integer NULL CHECK (pantalla_ancho  BETWEEN 320 AND 16384),
  ADD COLUMN IF NOT EXISTS pantalla_alto   integer NULL CHECK (pantalla_alto   BETWEEN 240 AND 16384),
  ADD COLUMN IF NOT EXISTS pantalla_escala numeric(4,2) NULL CHECK (pantalla_escala BETWEEN 0.5 AND 5);

COMMENT ON COLUMN cajas.pantalla_ancho IS 'Ancho en píxeles físicos de la pantalla donde corre la caja, según su último latido. 0121.';
COMMENT ON COLUMN cajas.pantalla_alto IS 'Alto en píxeles físicos de la pantalla donde corre la caja, según su último latido. 0121.';
COMMENT ON COLUMN cajas.pantalla_escala IS 'Escala de Windows (1.25 = 125 %). La interfaz ve ancho/escala × alto/escala. 0121.';

DROP FUNCTION IF EXISTS caja_latido(uuid, text, text, inet, uuid[]);

CREATE FUNCTION caja_latido(
  p_caja uuid, p_version text DEFAULT NULL, p_so text DEFAULT NULL, p_ip inet DEFAULT NULL,
  p_avisos_vistos uuid[] DEFAULT NULL,
  p_pantalla_ancho integer DEFAULT NULL, p_pantalla_alto integer DEFAULT NULL,
  p_pantalla_escala numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_tenant uuid;
BEGIN
  UPDATE cajas
     SET ultimo_latido   = now(),
         version_app     = COALESCE(left(p_version, 20), version_app),
         so              = COALESCE(left(p_so, 80), so),
         ultima_ip       = COALESCE(p_ip, ultima_ip),
         -- La pantalla va completa o no va: medio dato (ancho sin escala) diría algo falso.
         pantalla_ancho  = CASE WHEN p_pantalla_ancho IS NOT NULL AND p_pantalla_alto IS NOT NULL AND p_pantalla_escala IS NOT NULL
                                THEN p_pantalla_ancho ELSE pantalla_ancho END,
         pantalla_alto   = CASE WHEN p_pantalla_ancho IS NOT NULL AND p_pantalla_alto IS NOT NULL AND p_pantalla_escala IS NOT NULL
                                THEN p_pantalla_alto ELSE pantalla_alto END,
         pantalla_escala = CASE WHEN p_pantalla_ancho IS NOT NULL AND p_pantalla_alto IS NOT NULL AND p_pantalla_escala IS NOT NULL
                                THEN round(p_pantalla_escala, 2) ELSE pantalla_escala END
   WHERE id = p_caja AND deleted_at IS NULL
   RETURNING tenant_id INTO v_tenant;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Acuses. El INSERT ... SELECT filtra contra la propia tabla de avisos y contra el tenant de
  -- la caja, así que un id inventado —o de otro negocio— simplemente no inserta nada: un acuse
  -- inválido no puede tumbar el latido, que es lo que mantiene viva la señal de la caja.
  IF p_avisos_vistos IS NOT NULL AND array_length(p_avisos_vistos, 1) > 0 THEN
    INSERT INTO avisos_lecturas (aviso_id, tenant_id, caja_id)
    SELECT a.id, v_tenant, p_caja
      FROM avisos_plataforma a
     WHERE a.id = ANY (p_avisos_vistos)
       AND (a.tenant_id = v_tenant OR a.tenant_id IS NULL)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN resolver_directivas(v_tenant, p_caja);
END;
$$;

COMMENT ON FUNCTION caja_latido(uuid, text, text, inet, uuid[], integer, integer, numeric) IS
  'Sella que la caja está viva, guarda su versión y su pantalla, registra acuses de avisos y devuelve sus directivas (ADR 0014, 0121).';
REVOKE EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[], integer, integer, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION caja_latido(uuid, text, text, inet, uuid[], integer, integer, numeric) TO service_role;
