-- ============================================================================
-- 0072 — `errores_app`: bitácora de errores de las aplicaciones.
--
-- Hoy cuando el POS truena en el restaurante, el error muere en un archivo de texto de ESA
-- computadora que nadie abre. VIM se entera por teléfono, y para entonces nadie sabe qué botón
-- se apretó ni qué decía el error. Reproducirlo después es casi imposible.
--
-- Esta tabla es el destino de esos errores, y el panel de plataforma los muestra junto a las
-- alertas. Alternativa considerada y descartada: Sentry —más detalle, pero un proveedor más y
-- una cuenta más que vigilar para un operador de una sola persona.
--
-- CÓMO LLEGAN DESDE LA CAJA. La caja escribe en su Postgres LOCAL (esta migración también se
-- aplica ahí, viaja en el instalador). El escritorio los sube en su ciclo de sync con el token
-- del dispositivo, marcando lo enviado en una tabla local aparte para no repetirlos. No se
-- meten en el snapshot de ventas a propósito: ese camino mueve dinero y no se toca por una
-- bitácora.
--
-- SIN datos personales ni del negocio: mensaje, traza y contexto técnico. La traza puede
-- contener rutas de archivo, nada más.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.errores_app (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Quién lo reportó: 'pos' | 'admin' | 'caja' (proceso principal de Electron) | 'kds'
  app           varchar(20) NOT NULL,
  version       varchar(20) NULL,           -- versión del escritorio, para agrupar por release

  mensaje       text NOT NULL,
  stack         text NULL,
  -- Dónde ocurrió y qué se estaba haciendo. jsonb para no cerrar la puerta a más contexto.
  contexto      jsonb NOT NULL DEFAULT '{}'::jsonb,

  sucursal_id   uuid NULL REFERENCES public.sucursales(id) ON DELETE SET NULL,
  caja_id       uuid NULL REFERENCES public.cajas(id) ON DELETE SET NULL,
  usuario_id    uuid NULL,                  -- sin FK: el error puede ocurrir sin sesión válida

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- El panel lista los más recientes por tenant; es la única consulta que hace.
CREATE INDEX IF NOT EXISTS idx_errores_app_tenant_fecha
  ON public.errores_app (tenant_id, created_at DESC);

ALTER TABLE public.errores_app ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Insertar: cualquiera del tenant. Un error hay que poder reportarlo siempre; negarlo por
  -- permisos deja ciego justo al que falla.
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'errores_app_insert') THEN
    CREATE POLICY errores_app_insert ON public.errores_app
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
  END IF;

  -- Leer: también del tenant. El panel de VIM entra con service_role y no pasa por RLS.
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'errores_app_select') THEN
    CREATE POLICY errores_app_select ON public.errores_app
      FOR SELECT USING (tenant_id = current_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT ON public.errores_app TO authenticated, anon;

COMMENT ON TABLE public.errores_app IS
  'Errores reportados por POS/admin/caja. Los sube el escritorio en su ciclo de sync; el panel de plataforma los muestra.';
