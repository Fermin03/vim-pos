-- 0135 · CFDI: el emisor lo prueba el sello, no lo escribe el cliente
--
-- Auditoría integral 30/09/2026 (equipo C1 · CFDI y autofactura, hallazgos C1-1 a C1-5).
--
-- CONTEXTO QUE HACE GRAVE TODO LO DE ABAJO
--
-- Facturama Multiemisor es UNA cuenta de VIM compartida por todos los clientes. El PAC elige el
-- sello (CSD) con el que firma por el `Issuer.Rfc` que le mandamos (_shared/pac/facturama.ts). Así
-- que el RFC que viaja en el payload decide A NOMBRE DE QUIÉN se emite un comprobante fiscal real.
--
-- C1-1 (CRÍTICO) · Suplantación de emisor. Ese RFC salía de datos que el propio tenant escribe:
--   · `tickets_cfdi.emisor_rfc`, que pone `cfdi_crear_borrador(p_emisor_rfc…)` con lo que mande el
--     navegador, y que la política `cfdi_update` deja reescribir a cualquier usuario del tenant;
--   · `tenant_cfdi_emisor.rfc`, editable por el admin del tenant (0026);
--   · `tenants.rfc`, editable por el admin del tenant.
--   Reproducido: un negocio dado de alta gratis escribe el RFC de otro cliente de VIM en
--   Configuración → Facturación (o en el borrador) y `timbrar-cfdi` / `timbrar-global` /
--   `autofacturar` timbran con el sello de ese otro cliente — sin tener su .key ni su contraseña.
--   Arreglo: la ÚNICA prueba de que un RFC es tuyo es haber cargado su CSD (.cer + .key +
--   contraseña) con éxito en `cargar-csd`. Esa función, con service_role y solo tras `subida.ok`,
--   escribe `tenant_cfdi_emisor.rfc_verificado`; al borrar el sello lo limpia. Los tres puntos que
--   timbran usan `rfc_verificado` como Issuer.Rfc y se niegan (409) si es nulo o no coincide con lo
--   declarado. A `authenticated` se le quita escribir `rfc_verificado` y `csd_*` (privilegios por
--   columna). Defensa adicional: un trigger fuerza `tickets_cfdi.emisor_rfc` al RFC verificado.
--
-- C1-2 (ALTO) · `cargar-csd` "borrar" borraba en la cuenta compartida el sello del RFC que el
--   admin hubiera escrito — el de otro cliente, si escribía el suyo. Se arregla en la función
--   (solo borra `rfc_verificado` de ESTE tenant); aquí solo se añade la columna que lo permite.
--
-- C1-3 (MEDIO) · `tickets_cfdi` era UPDATE-able por cualquier usuario del tenant, columnas
--   fiscales incluidas: `*_storage_path` (que `descargar-cfdi`/`autofacturar` bajaban con
--   service_role sin mirar el bucket: cualquier objeto de Storage), `pac_referencia` (que
--   `cancelar-cfdi` cancela ante el SAT: la factura de otro cliente), `uuid_fiscal`, `estado_sat`.
--   Y las funciones que marcan timbrado/error/cancelación eran SECURITY INVOKER y ejecutables por
--   cualquiera: un cajero podía llamar `cfdi_marcar_timbrado` y dejar un ticket FACTURADO sin
--   timbre real (bloqueando además la autofactura del cliente). Arreglo: `tickets_cfdi` pasa a ser
--   de solo lectura para `authenticated`; toda escritura va por `cfdi_crear_borrador` (ahora
--   SECURITY DEFINER con chequeo de tenant) o por las Edge Functions con service_role, que es
--   quien llama a las `cfdi_marcar_*` (revocadas al resto). Se quitan las políticas de Storage
--   `cfdi_*_own_tenant` de la 0009, que dejaban a cualquier empleado subir al bucket `cfdi` (la
--   0098 ya decía que solo service_role escribe ahí).
--   De paso: `consumir_folio_cfdi` (SECURITY DEFINER, sin chequeo de tenant) era ejecutable por
--   cualquier `authenticated` contra CUALQUIER tenant: vaciar los folios de otro cliente, o con
--   `p_es_global = true` apuntarle consumos "tolerados" sin límite. Pasa a solo service_role.
--
-- C1-4 (ALTO) · Autofactura enumerable. El QR era `/{codigo}?folio={folio}` y los folios son
--   secuenciales: cualquiera recorre tickets (fecha y total) y los timbra a RFC inventados,
--   gastando folios del negocio y dejando al cliente real con "ya facturado". Arreglo: un token
--   no adivinable por ticket (HMAC-SHA256 del ticket_id con un secreto que solo vive en la base,
--   16 caracteres base64url = 96 bits) que imprime el POS en el QR y que `autofacturar` verifica
--   antes de buscar nada. Sin token (tickets ya impresos, o la caja de escritorio sin secreto) el
--   portal exige además el total exacto del ticket.
--
--   El HMAC se calcula con `sha256()` del núcleo (PG 11+) y no con pgcrypto: ninguna migración
--   depende de pgcrypto y la caja de escritorio aplica estas mismas migraciones en un Postgres
--   embebido donde no hay garantía de que esté.
--
--   El secreto se genera SOLO en la nube (donde existe `storage.buckets`, mismo criterio que la
--   0098). En el escritorio no hay secreto, `autofactura_token` devuelve NULL y el ticket sale con
--   el QR sin token: el comensal escribe el total. Si la caja generara su propio secreto, sus
--   tokens no validarían en la nube y el QR fallaría con un mensaje engañoso.
--
-- C1-5 · El add-on CFDI se comprueba en las Edge Functions (no hay cambio de base).
--
-- BACKFILL de `rfc_verificado`: las filas con `csd_numero_certificado` ya escrito pasan a
-- `rfc_verificado = rfc`. Por qué es razonable: `cargar-csd` solo escribe el número de certificado
-- después de comprobar que el .cer es de ESE rfc (`esDelRfc`) y de que el PAC aceptó .cer + .key +
-- contraseña. El hueco es que hasta hoy el admin también podía escribir `csd_numero_certificado`
-- a mano (0026 le daba UPDATE de toda la fila) o cambiar `rfc` después de cargar el sello. A la
-- fecha solo Knock-Out tiene sello cargado (ADR 0009, 3 sep 2026), así que el riesgo del backfill
-- es acotado; aun así, tras aplicar, contrastar en producción:
--   SELECT tenant_id, rfc_verificado, csd_numero_certificado FROM tenant_cfdi_emisor
--    WHERE rfc_verificado IS NOT NULL;
-- contra los CSD que lista la cuenta de Facturama (GET /api-lite/csds). Una fila que no cuadre se
-- limpia con `UPDATE tenant_cfdi_emisor SET rfc_verificado = NULL WHERE tenant_id = …`.

-- ── 1) tenant_cfdi_emisor.rfc_verificado ───────────────────────────────────────────────────────
ALTER TABLE tenant_cfdi_emisor
  ADD COLUMN IF NOT EXISTS rfc_verificado    varchar(13) NULL,
  ADD COLUMN IF NOT EXISTS rfc_verificado_at timestamptz NULL;

COMMENT ON COLUMN tenant_cfdi_emisor.rfc_verificado IS
  'RFC cuyo CSD cargó este tenant con éxito (cargar-csd, service_role). Es el ÚNICO Issuer.Rfc con que se timbra. Nadie más lo escribe (0135).';

UPDATE tenant_cfdi_emisor
   SET rfc_verificado    = upper(btrim(rfc)),
       rfc_verificado_at = COALESCE(csd_subido_at, now())
 WHERE csd_numero_certificado IS NOT NULL
   AND rfc_verificado IS NULL;

-- Privilegios por columna. Un REVOKE de columna no sirve mientras exista el GRANT de tabla
-- (Supabase da ALL a anon/authenticated por defecto), así que se quita el de tabla y se otorga
-- de vuelta solo lo que el panel escribe (`guardarCfdiEmisor`). `tenant_id` va en el UPDATE porque
-- el upsert de PostgREST lo incluye en el `DO UPDATE SET`; la política WITH CHECK de la 0026 sigue
-- obligando a que sea el propio.
REVOKE ALL ON tenant_cfdi_emisor FROM anon, authenticated;
GRANT SELECT ON tenant_cfdi_emisor TO authenticated;
GRANT INSERT (tenant_id, rfc, facturama_issuer_ref, estado, proveedor_pac, periodicidad_global)
  ON tenant_cfdi_emisor TO authenticated;
GRANT UPDATE (tenant_id, rfc, facturama_issuer_ref, estado, proveedor_pac, periodicidad_global)
  ON tenant_cfdi_emisor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_cfdi_emisor TO service_role;

-- ── 2) tickets_cfdi: solo lectura para los usuarios ────────────────────────────────────────────
-- Quién escribía y por dónde pasa ahora (grep de apps/, packages/, desktop/src, supabase/):
--   · cfdi_crear_borrador (panel → Facturación)      → SECURITY DEFINER, abajo.
--   · timbrar-global: INSERT del borrador de la global → cliente service_role.
--   · timbrar-cfdi: UPDATE de pac_proveedor           → cliente service_role.
--   · cfdi_marcar_* / cfdi_registrar_cancelacion      → las Edge Functions con service_role.
--   · autofacturar                                    → ya era service_role.
-- El POS y el escritorio no escriben esta tabla.
REVOKE ALL ON tickets_cfdi FROM anon, authenticated;
GRANT SELECT ON tickets_cfdi TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tickets_cfdi TO service_role;

-- El emisor del comprobante es el RFC verificado del tenant, diga lo que diga quien inserta.
-- Solo en INSERT: un CFDI ya emitido conserva el emisor con que se timbró aunque el negocio cambie
-- de sello después. Si el tenant aún no tiene RFC verificado se respeta lo que venga — ese borrador
-- no se va a poder timbrar (las Edge Functions exigen `rfc_verificado`), y forzar un error aquí
-- rompería el smoke de CFDI y la captura de borradores antes de cargar el sello.
CREATE OR REPLACE FUNCTION trg_cfdi_emisor_verificado() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rfc varchar;
BEGIN
  SELECT rfc_verificado INTO v_rfc FROM tenant_cfdi_emisor WHERE tenant_id = NEW.tenant_id;
  IF v_rfc IS NOT NULL THEN
    NEW.emisor_rfc := v_rfc;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION trg_cfdi_emisor_verificado() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tickets_cfdi_emisor_verificado ON tickets_cfdi;
CREATE TRIGGER trg_tickets_cfdi_emisor_verificado
  BEFORE INSERT ON tickets_cfdi
  FOR EACH ROW EXECUTE FUNCTION trg_cfdi_emisor_verificado();

-- cfdi_crear_borrador pasa a SECURITY DEFINER (ya no hay INSERT para `authenticated`). Misma
-- firma, para no tocar los tipos ni al panel. Al saltarse el RLS, el acotamiento es explícito:
-- el ticket, la devolución y el CFDI sustituido tienen que ser del tenant del JWT.
-- `p_emisor_rfc` se sigue aceptando por compatibilidad, pero el trigger de arriba lo reemplaza.
CREATE OR REPLACE FUNCTION cfdi_crear_borrador(
  p_ticket_id              uuid,
  p_tipo_comprobante       cfdi_tipo_comprobante,
  p_receptor_rfc           varchar,
  p_receptor_razon_social  varchar,
  p_receptor_uso_cfdi      varchar,
  p_receptor_codigo_postal varchar,
  p_receptor_regimen_fiscal varchar,
  p_receptor_email         varchar,
  p_emisor_rfc             varchar,
  p_emisor_razon_social    varchar,
  p_emisor_regimen_fiscal  varchar,
  p_emisor_lugar_expedicion varchar,
  p_metodo_pago_sat        varchar,
  p_forma_pago_sat         varchar,
  p_pac_proveedor          cfdi_proveedor_pac,
  p_devolucion_id          uuid DEFAULT NULL,
  p_cfdi_sustituye_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := current_tenant_id();
  v_ticket    tickets%ROWTYPE;
  v_cfdi_id   uuid;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Sin tenant en la sesión' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket_id;
  END IF;

  IF p_tipo_comprobante = 'INGRESO' AND v_ticket.estado_fiscal <> 'PAGADO' THEN
    RAISE EXCEPTION 'Solo tickets PAGADOS se pueden facturar (estado actual: %)', v_ticket.estado_fiscal;
  END IF;

  IF p_tipo_comprobante = 'EGRESO' AND p_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'Nota de crédito requiere devolucion_id';
  END IF;
  IF p_devolucion_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM devoluciones WHERE id = p_devolucion_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'Devolución % no existe', p_devolucion_id;
  END IF;
  IF p_cfdi_sustituye_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM tickets_cfdi WHERE id = p_cfdi_sustituye_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'CFDI % no existe', p_cfdi_sustituye_id;
  END IF;

  INSERT INTO tickets_cfdi (
    tenant_id, ticket_id, tipo_comprobante,
    receptor_rfc, receptor_razon_social, receptor_uso_cfdi,
    receptor_codigo_postal, receptor_regimen_fiscal, receptor_email,
    emisor_rfc, emisor_razon_social, emisor_regimen_fiscal, emisor_lugar_expedicion,
    subtotal_mxn, descuento_mxn, iva_mxn, total_mxn,
    metodo_pago_sat, forma_pago_sat,
    estado_sat, pac_proveedor,
    cfdi_sustituye_id, devolucion_id,
    created_by, updated_by
  ) VALUES (
    v_tenant_id, p_ticket_id, p_tipo_comprobante,
    p_receptor_rfc, p_receptor_razon_social, p_receptor_uso_cfdi,
    p_receptor_codigo_postal, p_receptor_regimen_fiscal, p_receptor_email,
    p_emisor_rfc, p_emisor_razon_social, p_emisor_regimen_fiscal, p_emisor_lugar_expedicion,
    v_ticket.subtotal_mxn,
    v_ticket.descuentos_manuales_mxn + v_ticket.promociones_mxn,
    v_ticket.iva_mxn,
    v_ticket.total_mxn,
    p_metodo_pago_sat, p_forma_pago_sat,
    'BORRADOR', p_pac_proveedor,
    p_cfdi_sustituye_id, p_devolucion_id,
    auth.uid(), auth.uid()
  ) RETURNING id INTO v_cfdi_id;

  RETURN v_cfdi_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION cfdi_crear_borrador(uuid, cfdi_tipo_comprobante, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, cfdi_proveedor_pac, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION cfdi_crear_borrador(uuid, cfdi_tipo_comprobante, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, cfdi_proveedor_pac, uuid, uuid) TO authenticated, service_role;

-- Las que asientan lo que respondió el PAC: solo las Edge Functions (service_role). Siguen siendo
-- SECURITY INVOKER; con service_role el RLS no estorba. La atribución (quién pidió el timbrado) ya
-- no sale de auth.uid() —que bajo service_role es NULL— sino del `usuario_id` que las funciones
-- ponen en el payload del movimiento.
REVOKE EXECUTE ON FUNCTION cfdi_marcar_timbrado(uuid, varchar, varchar, varchar, timestamptz, timestamptz, varchar, varchar, varchar, integer, jsonb, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cfdi_marcar_error(uuid, varchar, text, jsonb, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cfdi_marcar_cancelado_sat(uuid, varchar, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cfdi_registrar_cancelacion(uuid, cfdi_estado_sat, varchar, varchar, text, jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION consumir_folio_cfdi(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION cfdi_marcar_timbrado(uuid, varchar, varchar, varchar, timestamptz, timestamptz, varchar, varchar, varchar, integer, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION cfdi_marcar_error(uuid, varchar, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION cfdi_marcar_cancelado_sat(uuid, varchar, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION cfdi_registrar_cancelacion(uuid, cfdi_estado_sat, varchar, varchar, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION consumir_folio_cfdi(uuid, uuid, boolean) TO service_role;

-- Storage: el bucket `cfdi` lo escribe y lo lee solo service_role (0098). Las políticas de la 0009
-- dejaban a cualquier empleado subir y leer objetos bajo `<su tenant_id>/…`.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "cfdi_read_own_tenant"  ON storage.objects;
    DROP POLICY IF EXISTS "cfdi_write_own_tenant" ON storage.objects;
  END IF;
END $$;

-- ── 3) Token de autofactura ────────────────────────────────────────────────────────────────────
-- HMAC-SHA256 (RFC 2104) con el `sha256()` del núcleo. Verificado contra el caso 2 de la RFC 4231
-- en supabase/tests/0020 y, del lado TypeScript, en _shared/pac/acceso-ticket.test.ts.
CREATE OR REPLACE FUNCTION _vim_hmac_sha256(p_llave bytea, p_mensaje bytea) RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  k    bytea := p_llave;
  ipad bytea;
  opad bytea;
  i    integer;
BEGIN
  IF length(k) > 64 THEN k := sha256(k); END IF;
  k := k || decode(repeat('00', 64 - length(k)), 'hex');
  ipad := k;
  opad := k;
  FOR i IN 0..63 LOOP
    ipad := set_byte(ipad, i, get_byte(k, i) # 54);   -- 0x36
    opad := set_byte(opad, i, get_byte(k, i) # 92);   -- 0x5c
  END LOOP;
  RETURN sha256(opad || sha256(ipad || p_mensaje));
END;
$$;
REVOKE EXECUTE ON FUNCTION _vim_hmac_sha256(bytea, bytea) FROM public, anon, authenticated;

-- Secreto global del servidor. Una fila. Ni `anon` ni `authenticated` lo leen: RLS sin políticas
-- y sin privilegios. Rotarlo invalida los QR ya impresos (el portal cae al total como segundo
-- factor, no se pierde la facturación).
CREATE TABLE IF NOT EXISTS cfdi_autofactura_secreto (
  id         boolean PRIMARY KEY DEFAULT true CHECK (id),
  secreto    bytea NOT NULL CHECK (length(secreto) >= 32),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cfdi_autofactura_secreto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cfdi_autofactura_secreto FROM public, anon, authenticated;
COMMENT ON TABLE cfdi_autofactura_secreto IS
  'Secreto del token del QR de autofactura (0135). Solo lo lee autofactura_token(). Solo en la nube.';

-- 32 bytes de dos gen_random_uuid() (CSPRNG del servidor; 244 bits útiles). Solo en la nube.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO cfdi_autofactura_secreto (id, secreto)
    VALUES (true, decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'))
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Token del QR: base64url(HMAC(secreto, ticket_id))[:16] → 96 bits. NULL si no hay secreto (caja
-- de escritorio) o si quien pregunta no es del tenant del ticket. service_role (autofacturar) puede
-- pedir el de cualquiera: es quien lo verifica.
CREATE OR REPLACE FUNCTION autofactura_token(p_ticket_id uuid) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid;
  v_secreto bytea;
BEGIN
  SELECT tenant_id INTO v_tenant FROM tickets WHERE id = p_ticket_id;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role'
     AND current_tenant_id() IS DISTINCT FROM v_tenant THEN
    RETURN NULL;
  END IF;
  SELECT secreto INTO v_secreto FROM cfdi_autofactura_secreto WHERE id;
  IF v_secreto IS NULL THEN RETURN NULL; END IF;
  RETURN left(
    translate(encode(_vim_hmac_sha256(v_secreto, convert_to(p_ticket_id::text, 'UTF8')), 'base64'), '+/=', '-_'),
    16
  );
END;
$$;
COMMENT ON FUNCTION autofactura_token(uuid) IS
  'Token no adivinable del QR de autofactura (0135). El POS lo imprime; autofacturar lo verifica.';
REVOKE EXECUTE ON FUNCTION autofactura_token(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION autofactura_token(uuid) TO authenticated, service_role;
