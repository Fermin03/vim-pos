-- ============================================================================
-- 0066 — Logo del negocio: `tenants.logo_url`.
--
-- El POS lo muestra en la pantalla principal y encima del ticket del cliente. `logo_url`
-- ya existía en `marcas_virtuales` (una marca de dark kitchen tiene identidad propia), pero
-- el negocio en sí no tenía logo, así que la pantalla mostraba solo el nombre.
--
-- POR QUÉ SE GUARDA EL LOGO Y NO UNA URL A STORAGE. La caja es local-first: opera días
-- enteros sin internet, y `tenants` viaja completo en el snapshot de sync (mig. 0055). Si
-- aquí viviera una URL de Supabase Storage, la caja no vería el logo sin conexión, y menos
-- podría imprimirlo — justo cuando más se necesita, porque el ticket sale igual offline.
-- Guardando el data URI, el logo llega solo con el snapshot y funciona sin red.
--
-- El tamaño se controla en el cliente (se reescala a 512 px de lado y se recomprime antes de
-- guardar) y aquí con un CHECK de tope duro: sin él, un logo pesado se colaría en CADA
-- snapshot de sync de esa caja.
--
-- Migración ADITIVA (columna nueva, nullable).
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url text NULL;

COMMENT ON COLUMN public.tenants.logo_url IS
  'Logo del negocio como data URI (data:image/...;base64,...). Se guarda embebido —no una URL— porque la caja opera offline y debe poder mostrarlo e imprimirlo sin red. Máx ~512 KB.';

-- Tope duro de tamaño. 512 KB de data URI ≈ 380 KB de imagen: de sobra para un logo de
-- 512 px, y evita que un archivo pesado se replique en cada snapshot de sync.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenant_logo_tamano_max;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenant_logo_tamano_max
  CHECK (logo_url IS NULL OR length(logo_url) <= 524288);
