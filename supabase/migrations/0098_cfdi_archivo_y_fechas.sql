-- ============================================================================
-- 0098 — Archivo de comprobantes y hora real del timbrado.
--
-- 1) Bucket privado `cfdi` para el XML, el PDF y el acuse de cada comprobante. Hasta hoy
--    `tickets_cfdi` guardaba las rutas (cfdi/<id>.xml) pero ningún archivo: el bucket no existía
--    y nadie subía nada. Se vio con el primer CFDI real (3 sep 2026). Sin políticas en
--    storage.objects: solo service_role (las Edge Functions) lee y escribe; `descargar-cfdi`
--    sirve los archivos a quien demuestra ser del negocio.
--
-- 2) Facturama devuelve la hora de timbrado en hora local de México sin zona y se guardó como
--    UTC: seis horas antes de lo real. El adaptador ya la normaliza (`_shared/pac/fechas.ts`);
--    aquí se corrigen las filas ya guardadas. Criterio: un timbrado no puede ser más de dos
--    horas anterior a la creación de su propia fila.
--
-- En el Postgres embebido del escritorio no hay esquema `storage`: el bloque 1 se omite.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('cfdi', 'cfdi', false, 5242880, ARRAY['application/xml', 'text/xml', 'application/pdf'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

UPDATE tickets_cfdi
SET fecha_timbrado = fecha_timbrado + interval '6 hours',
    fecha_emision  = CASE WHEN fecha_emision IS NULL THEN NULL ELSE fecha_emision + interval '6 hours' END
WHERE pac_proveedor = 'FACTURAMA'
  AND fecha_timbrado IS NOT NULL
  AND fecha_timbrado < created_at - interval '2 hours';
