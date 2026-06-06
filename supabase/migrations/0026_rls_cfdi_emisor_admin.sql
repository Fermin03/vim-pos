-- F8 — tenant_cfdi_emisor solo tenía policy SELECT (cfdi_emisor_select_tenant). Para que el
-- admin del tenant configure su emisor PAC desde el panel (P-018), se agregan INSERT y UPDATE
-- restringidas a admins del tenant (mismo patrón que tenants_update_admin → es_admin_del_tenant).

CREATE POLICY cfdi_emisor_insert_admin ON tenant_cfdi_emisor
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND es_admin_del_tenant(tenant_id)
  );

CREATE POLICY cfdi_emisor_update_admin ON tenant_cfdi_emisor
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND es_admin_del_tenant(tenant_id)
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    AND es_admin_del_tenant(tenant_id)
  );
