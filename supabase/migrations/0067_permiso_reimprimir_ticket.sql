-- ============================================================================
-- 0067 — Permiso 'venta.reimprimir_ticket'.
--
-- La primera impresión del ticket de una cuenta es parte del flujo normal y no pide nada.
-- La SEGUNDA en adelante sí: reimprimir es la vía clásica para entregar un ticket "de
-- cortesía" y quedarse con el efectivo, y por eso el admin ya tiene un reporte de
-- reimpresiones por cajero (vw_reimpresiones_por_cajero). Sin un permiso que gatee la
-- acción, ese reporte solo registra el hecho sin poder evitarlo.
--
-- Jerarquía 3 (SUPERVISOR): a diferencia de abrir el cajón —que es dinero directo y se
-- reservó a 4— aquí basta un supervisor de piso, porque reimprimir es una operación
-- cotidiana y legítima (se atascó el papel, el cliente pidió otra copia) y exigir al dueño
-- para cada una obligaría a saltarse el control en la práctica.
--
-- Migración ADITIVA e idempotente. Los roles se resuelven por CÓDIGO, no por el id fijo del
-- seed (mig. 0046): en instalaciones donde esos roles se sembraron antes, el id real es
-- otro y un INSERT con UUID literal falla por FK — ya nos pasó con la 0062.
-- ============================================================================

INSERT INTO public.permisos (id, codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin)
VALUES (
  '57e601e6-9476-492a-9d34-430f8af011dc',
  'venta.reimprimir_ticket',
  'Reimprimir ticket de una cuenta',
  'Vuelve a imprimir el ticket de una cuenta que ya se imprimió. Queda registrado quién lo autorizó (antifraude).',
  'VENTA',
  true,
  3
)
ON CONFLICT (codigo) DO NOTHING;

-- SUPERVISOR y arriba pueden autorizarlo.
INSERT INTO public.rol_permisos (rol_id, permiso_id, concedido)
SELECT r.id, p.id, true
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.tenant_id IS NULL
  AND r.codigo IN ('SUPERVISOR', 'ADMIN', 'DUENO')
  AND p.codigo = 'venta.reimprimir_ticket'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
