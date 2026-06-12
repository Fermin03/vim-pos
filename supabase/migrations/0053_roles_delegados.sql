-- 0053 — Fase 5: roles delegados y permisos personalizados (doc 09 §7, D71/D72).
-- D71: el DUEÑO puede QUITAR permisos a roles del sistema en SU tenant (override
--      restrictivo; ampliar NUNCA — las restricciones son defensa en profundidad).
-- D72: rol comodín PERSONALIZADO cuyo acceso son SOLO permisos explícitos por usuario.

-- ── Rol comodín PERSONALIZADO (catálogo global) ──────────────────────────────
INSERT INTO roles (codigo, nombre, descripcion, es_sistema, jerarquia, activo)
VALUES ('PERSONALIZADO', 'Personalizado',
        'Permisos explícitos por usuario (D72). Sin permisos base: solo lo otorgado en permisos_personalizados.',
        true, 1, true)
ON CONFLICT DO NOTHING;

-- ── D71: overrides restrictivos por tenant ──────────────────────────────────
CREATE TABLE rol_permiso_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rol_id      uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id  uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  CONSTRAINT rpo_override_unico UNIQUE (tenant_id, rol_id, permiso_id)
);
COMMENT ON TABLE rol_permiso_overrides IS 'D71: permisos QUITADOS a un rol del sistema en un tenant (solo restrictivo).';

ALTER TABLE rol_permiso_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY rpo_select ON rol_permiso_overrides FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY rpo_insert ON rol_permiso_overrides FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY rpo_delete ON rol_permiso_overrides FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── D72: permisos explícitos del rol PERSONALIZADO ───────────────────────────
CREATE TABLE permisos_personalizados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permiso_id  uuid NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  CONSTRAINT pp_permiso_usuario_unico UNIQUE (tenant_id, usuario_id, permiso_id)
);
COMMENT ON TABLE permisos_personalizados IS 'D72: permisos otorgados explícitamente a un usuario con rol PERSONALIZADO.';

ALTER TABLE permisos_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY pp_select ON permisos_personalizados FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY pp_insert ON permisos_personalizados FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
CREATE POLICY pp_delete ON permisos_personalizados FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── Resolver: ¿el usuario tiene el permiso? ──────────────────────────────────
-- rol del sistema: rol_permisos.concedido MENOS overrides del tenant (D71).
-- rol PERSONALIZADO: SOLO permisos_personalizados (D72).
CREATE OR REPLACE FUNCTION public.usuario_tiene_permiso(p_usuario_id uuid, p_permiso_codigo varchar)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acc record;
  v_permiso_id uuid;
BEGIN
  SELECT ua.tenant_id, ua.rol_id, r.codigo AS rol_codigo
    INTO v_acc
    FROM usuarios_acceso ua
    JOIN roles r ON r.id = ua.rol_id
   WHERE ua.usuario_id = p_usuario_id AND ua.activo = true
   ORDER BY r.jerarquia DESC
   LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT id INTO v_permiso_id FROM permisos WHERE codigo = p_permiso_codigo;
  IF v_permiso_id IS NULL THEN RETURN false; END IF;

  IF v_acc.rol_codigo = 'PERSONALIZADO' THEN
    RETURN EXISTS (
      SELECT 1 FROM permisos_personalizados
       WHERE tenant_id = v_acc.tenant_id AND usuario_id = p_usuario_id AND permiso_id = v_permiso_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM rol_permisos rp
     WHERE rp.rol_id = v_acc.rol_id AND rp.permiso_id = v_permiso_id AND rp.concedido = true
  ) AND NOT EXISTS (
    SELECT 1 FROM rol_permiso_overrides o
     WHERE o.tenant_id = v_acc.tenant_id AND o.rol_id = v_acc.rol_id AND o.permiso_id = v_permiso_id
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.usuario_tiene_permiso(uuid, varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_tiene_permiso(uuid, varchar) TO authenticated, service_role;
