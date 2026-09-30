-- ============================================================================
-- 0127 — Permiso 'turno.recontar_arqueo' (corte ciego).
--
-- Desde la 0.4.94 el arqueo es CIEGO: el cajero declara lo que contó sin ver cuánto debería
-- haber, y la diferencia aparece después. El punto débil de un corte ciego es volver atrás: si
-- después de ver "−$200 faltante" el cajero puede regresar y teclear otra cifra, el conteo deja
-- de ser ciego. Volver a contar sigue siendo necesario (un billete que se quedó en el cajón, un
-- dedo que tecleó 3,200 por 320), así que no se prohíbe: se autoriza.
--
-- Jerarquía 3 (SUPERVISOR), como reimprimir ticket (0067): un supervisor de piso basta, porque
-- exigir al dueño a medianoche haría que el control se salte. 'turno.validar_con_diferencia' no
-- sirve aquí: no admite PIN y solo lo tienen ADMIN y DUENO.
--
-- El corte anterior NO se borra: cada "Generar corte" inserta en cortes_caja, así que el primer
-- conteo queda como registro junto al que se autorizó.
--
-- Migración ADITIVA e idempotente; roles por CÓDIGO (ver 0067).
-- ============================================================================

INSERT INTO public.permisos (id, codigo, nombre, descripcion, categoria, permite_autorizacion_pin, jerarquia_minima_pin)
VALUES (
  '3f8e14da-b2e0-473a-9119-c3132ef612f3',
  'turno.recontar_arqueo',
  'Volver a contar el arqueo',
  'Regresar al conteo después de ver la diferencia del corte ciego. El conteo anterior queda registrado.',
  'TURNO',
  true,
  3
)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.rol_permisos (rol_id, permiso_id, concedido)
SELECT r.id, p.id, true
FROM public.roles r
CROSS JOIN public.permisos p
WHERE r.tenant_id IS NULL
  AND r.codigo IN ('SUPERVISOR', 'ADMIN', 'DUENO')
  AND p.codigo = 'turno.recontar_arqueo'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
