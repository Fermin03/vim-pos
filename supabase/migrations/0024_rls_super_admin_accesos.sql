-- SEC CN-002 (Cyber Neo) — Cerrar el único hueco de RLS del esquema.
-- super_admin_accesos (0012 §9.2) es el ledger de impersonación/auditoría de VIM.
-- Tiene tenant_id pero se creó sin ENABLE ROW LEVEL SECURITY ni política (todas las
-- demás tablas con tenant_id están cubiertas). Hoy solo se escribe vía service_role,
-- pero con RLS off dependía de los grants por defecto de Postgres → un JWT de tenant
-- podría leer datos operativos cross-tenant de VIM (quién impersonó a quién, IPs, motivos).
--
-- service_role tiene BYPASSRLS por diseño, así que el provisioning de la plataforma
-- (apps/platform / Edge Functions) sigue funcionando. Ningún rol de tenant debe tocar
-- esta tabla → sin política + REVOKE explícito.

ALTER TABLE super_admin_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admin_accesos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON super_admin_accesos FROM anon, authenticated, public;

COMMENT ON TABLE super_admin_accesos IS
  'Bitácora de toda acción de VIM sobre un tenant. Impersonación exige motivo. Doc 12 §9.2. '
  'RLS forzado + sin política para roles de tenant: SOLO service_role (BYPASSRLS) accede. SEC CN-002.';
