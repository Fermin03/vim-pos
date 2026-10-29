-- ============================================================================
-- 0289 · Descuento al cobro final, por cliente.
--
-- Lo pone VIM desde /platform → Clientes: porcentaje o importe fijo sobre el TOTAL que toca pagar
-- (plan ya con promoción + add-ons). Tres formas en el panel —los próximos N cobros, un rango de
-- fechas o sin fecha de fin— que aquí quedan en dos: un rango [desde, hasta] o `hasta` NULL.
--
-- Va en la suscripción vigente, como la promoción (0141), y no en una tabla aparte: uno a la vez,
-- la historia queda en la bitácora del panel (`tenant.descuento_fijar` / `tenant.descuento_quitar`).
-- El cálculo vive en TS (`rebajaDescuento` de @vim/db/cobro): la base no calcula montos de cobro,
-- los pagos se registran a mano con el monto que sugiere el panel.
--
-- `descuento_porcentaje` (0002) NO es esto: nadie la ha leído ni escrito nunca y se queda como está.
--
-- TODO ES ADITIVO: columnas NULL y CHECKs. El dueño ya lee `suscripciones` por RLS (solo SELECT),
-- así que ve su descuento y no lo puede mover. Seguro en el escritorio: la caja no usa esta tabla.
-- ============================================================================

ALTER TABLE public.suscripciones
  ADD COLUMN IF NOT EXISTS descuento_tipo   text          NULL,
  ADD COLUMN IF NOT EXISTS descuento_valor  numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS descuento_desde  date          NULL,
  ADD COLUMN IF NOT EXISTS descuento_hasta  date          NULL,
  ADD COLUMN IF NOT EXISTS descuento_motivo text          NULL;

DO $$ BEGIN
  -- Tipo, valor e inicio van juntos; el fin y el motivo solo con ellos.
  ALTER TABLE public.suscripciones ADD CONSTRAINT suscripciones_descuento_ck CHECK (
    (descuento_tipo IS NULL AND descuento_valor IS NULL AND descuento_desde IS NULL AND descuento_hasta IS NULL AND descuento_motivo IS NULL)
    OR (
      descuento_desde IS NOT NULL
      AND (descuento_hasta IS NULL OR descuento_hasta >= descuento_desde)
      AND (
        (descuento_tipo = 'PORCENTAJE' AND descuento_valor > 0 AND descuento_valor <= 100)
        OR (descuento_tipo = 'IMPORTE' AND descuento_valor > 0)
      )
      AND (descuento_motivo IS NULL OR length(descuento_motivo) <= 500)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.suscripciones.descuento_tipo IS
  'PORCENTAJE o IMPORTE (0289). Descuento sobre el total del cobro (plan con promoción + add-ons).';
COMMENT ON COLUMN public.suscripciones.descuento_valor IS
  'Porcentaje (1–100) o importe en pesos que se rebaja a cada cobro (0289). Nunca deja el cobro negativo.';
COMMENT ON COLUMN public.suscripciones.descuento_desde IS
  'Primer día (hora de México) en que una fecha de cobro lleva el descuento (0289).';
COMMENT ON COLUMN public.suscripciones.descuento_hasta IS
  'Último día (inclusive) en que una fecha de cobro lleva el descuento. NULL = sin fecha de fin (0289).';
COMMENT ON COLUMN public.suscripciones.descuento_motivo IS
  'Por qué se dio el descuento, como lo escribió VIM en el panel (0289).';
