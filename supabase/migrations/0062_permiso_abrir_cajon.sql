-- ============================================================================
-- 0062 — Permiso 'caja.abrir_cajon': abrir el cajón de dinero sin una venta de por medio
-- (botón "Abrir caja" del POS). Es el punto clásico de fraude en caja (abrir el cajón
-- "para revisar algo" sin que quede registrada una venta), así que se gatea igual que
-- caja.ajuste_admin: solo DUEÑO/ADMIN lo tienen, jerarquía mínima 4 para autorizar por PIN.
--
-- El flujo de autorización (Edge Function autorizar-pin + verificar_autorizacion_pin,
-- mig. 0018/0043) es genérico por `permisos.codigo`: no hace falta tocar SQL de negocio,
-- solo sembrar el permiso y concederlo a los roles correctos.
--
-- Migración ADITIVA. Idempotente (ON CONFLICT DO NOTHING), igual que el resto del seed
-- de catálogos globales (mig. 0046).
--
-- Los roles de sistema (DUEÑO/ADMIN) se resuelven por `codigo` — NO por el id fijo que usa
-- 0046 — porque `roles.codigo` es UNIQUE cuando tenant_id IS NULL (rol_codigo_sistema_uq,
-- mig. 0004). Si un ambiente sembró esos roles ANTES de que corriera 0046 (con id propio,
-- p. ej. seed.sql/fixture local o un tenant provisionado antes de esa migración), el INSERT
-- de 0046 se salta por el conflicto de `codigo` y el id real nunca fue el fijo. Ya es un
-- problema conocido del proyecto (ver alta-nube.ts / reconciliarCatalogo, mismo motivo);
-- una migración nueva no debe asumir esos UUIDs literales.
-- ============================================================================

INSERT INTO public.permisos (id, codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin)
VALUES (
  'a506a50c-5178-4120-87a4-8bc70e04d778',
  'caja.abrir_cajon',
  'Abrir cajón de dinero',
  'Abre el cajón de dinero sin una venta de por medio (revisar cambio, corregir efectivo). Queda registrado quién lo autorizó.',
  'CAJA',
  true,
  4
)
ON CONFLICT (codigo) DO NOTHING;

-- Concedido a los roles de sistema DUEÑO y ADMIN, resueltos por código.
INSERT INTO public.rol_permisos (rol_id, permiso_id, concedido)
SELECT r.id, p.id, true
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.tenant_id IS NULL
  AND r.codigo IN ('DUENO', 'ADMIN')
  AND p.codigo = 'caja.abrir_cajon'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
