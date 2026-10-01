-- ============================================================================
-- 0145 — Los prospectos de demo se atienden desde /platform: seguimiento con fecha.
--
-- La tabla `prospectos` (0084) ya traía el estado de seguimiento (NUEVO, CONTACTADO,
-- DEMO_AGENDADA, GANADO, PERDIDO, SPAM), una nota libre y `atendido_en`, pero ninguna pantalla los
-- leía: una solicitud de demo solo llegaba por correo, y un correo entre cincuenta se pierde.
-- Ahora el panel los lista, los mueve de estado y avisa en Atención de los que siguen NUEVOS
-- pasadas 24 horas.
--
-- Lo que añade esta migración es poco, a propósito:
--
--   · `estado_cambiado_en` — cuándo se movió por última vez. Sin él, "contactado" no dice si fue
--     ayer o hace un mes. Las filas que ya existen quedan con NULL (nunca se movieron) y en NUEVO,
--     que es el DEFAULT de 0084.
--   · Un tope a `notas` (500): es una bandeja de entrada, no un CRM.
--   · Un trigger que sella las dos fechas. Va en la base y no en la ruta del panel para que valgan
--     igual si un día se mueve un prospecto desde SQL: `atendido_en` es la PRIMERA vez que dejó de
--     ser NUEVO (cuánto tardamos en contestar) y no se pisa después.
--
-- LO QUE NO CAMBIA: la tabla sigue cerrada. RLS forzado, una política que niega a anon y a
-- authenticated, y sin privilegios para ninguno de los dos (0084). Solo `service_role` —la Edge
-- Function `solicitar-demo` y el servidor del panel— la toca. pgTAP 0029 lo comprueba.
-- ============================================================================

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS estado_cambiado_en timestamptz NULL;

COMMENT ON COLUMN public.prospectos.estado_cambiado_en IS
  'Última vez que cambió el estado de seguimiento (0145). NULL = nunca se ha movido de NUEVO. Lo sella el trigger, no la aplicación.';
COMMENT ON COLUMN public.prospectos.atendido_en IS
  'Primera vez que dejó de ser NUEVO: cuánto tardó VIM en contestar. Lo sella el trigger (0145) y no se pisa.';

-- NOT VALID primero: la regla vale desde ya para lo que se escriba, y la migración no se cae si
-- alguna nota vieja (capturada a mano en SQL) pasa del tope. Solo se valida si todo cabe; si no,
-- queda sin validar y se avisa — recortar la nota de un prospecto no es decisión de una migración.
DO $$
DECLARE
  v_largas integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospectos_notas_largo' AND conrelid = 'public.prospectos'::regclass) THEN
    ALTER TABLE public.prospectos
      ADD CONSTRAINT prospectos_notas_largo CHECK (notas IS NULL OR length(notas) <= 500) NOT VALID;
  END IF;
  SELECT count(*) INTO v_largas FROM public.prospectos WHERE length(notas) > 500;
  IF v_largas = 0 THEN
    ALTER TABLE public.prospectos VALIDATE CONSTRAINT prospectos_notas_largo;
  ELSE
    RAISE NOTICE '0145: % prospecto(s) con nota de más de 500 caracteres: el tope queda SIN validar para ellos. Recórtalas y corre VALIDATE CONSTRAINT prospectos_notas_largo.', v_largas;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.prospectos_sellar_seguimiento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.estado_cambiado_en := now();
    IF OLD.estado = 'NUEVO' AND NEW.atendido_en IS NULL THEN
      NEW.atendido_en := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prospectos_sellar_seguimiento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prospectos_seguimiento ON public.prospectos;
CREATE TRIGGER trg_prospectos_seguimiento
  BEFORE UPDATE OF estado ON public.prospectos
  FOR EACH ROW EXECUTE FUNCTION public.prospectos_sellar_seguimiento();

-- El filtro por estado de la bandeja. El índice parcial de 0084 solo cubre los NUEVOS.
CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON public.prospectos (estado, creado_en DESC);

-- Cinturón y tirantes: 0084 ya lo hizo, pero una tabla con datos personales que estrena pantalla
-- merece que la migración que la abre al panel repita quién NO entra.
REVOKE ALL ON public.prospectos FROM anon, authenticated;
