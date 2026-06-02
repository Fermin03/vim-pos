-- F4.4 — Permitir al admin del tenant editar su propio negocio.
-- La policy original `tenants_select_propio` (0002) solo permite SELECT.
-- Sucursales/cajas ya son FOR ALL por tenant (0003) y propinas por tenant (0010).

CREATE POLICY tenants_update_admin ON public.tenants
  FOR UPDATE TO authenticated
  USING (id = ((auth.jwt() ->> 'tenant_id'::text))::uuid AND es_admin_del_tenant(id))
  WITH CHECK (id = ((auth.jwt() ->> 'tenant_id'::text))::uuid AND es_admin_del_tenant(id));

COMMENT ON POLICY tenants_update_admin ON public.tenants IS
  'F4.4 — admin (DUENO/ADMIN) del tenant puede actualizar su propio negocio.';
