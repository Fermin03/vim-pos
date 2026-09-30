-- 0136 · Límites de tasa en la base y el pull de la caja sin contraseñas ajenas
--
-- Auditoría integral 30/09/2026, equipo C2 (Edge Functions públicas y sync). Dos arreglos que no
-- tienen que ver entre sí salvo por quién los usa: las Edge Functions.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) consumir_cupo / cupo_agotado — hallazgos C2-1, C2-3 y C2-7
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Qué estaba mal. `solicitar-demo` y `autofacturar` limitaban los envíos con un `Map` en memoria
-- de la instancia, indexado por el PRIMER valor de `X-Forwarded-For`:
--   · la primera entrada de XFF la escribe el cliente (`curl -H 'X-Forwarded-For: 1.2.3.<n>'`):
--     cambiarla en cada petición da un contador nuevo cada vez, así que el límite no limitaba;
--   · cada instancia tiene su propio Map y las instancias van y vienen: aunque la IP fuera buena,
--     el tope real era MAX × instancias vivas;
--   · el Map de autofacturar no se purgaba nunca.
-- `signup-tenant` (alta de negocios con cuenta de dueño ya confirmada) y `provisionar-tenant`
-- (clave compartida) no tenían ningún límite.
--
-- Arreglo. Un contador en la base, compartido por todas las instancias: `limites_cupo`, una fila
-- por (clave, ventana fija). `consumir_cupo(clave, ventana, max)` suma uno con un upsert atómico
-- (dos peticiones simultáneas no pueden leer el mismo conteo) y dice si todavía cabe.
-- `cupo_agotado` es la misma cuenta sin sumar, para contar solo los FALLOS (provisionar-tenant):
-- se pregunta antes y se consume solo cuando el intento falla.
--
-- Ventanas fijas y no deslizantes, a propósito: una fila por ventana, sin guardar marcas de tiempo.
-- El costo es que en la frontera entre dos ventanas caben hasta 2×max seguidos. Para frenar bots y
-- abuso eso da igual; si algún día se necesita precisión, se cambia aquí sin tocar a los llamantes.
--
-- Limpieza: cada llamada borra hasta 200 filas vencidas (índice por `expira_en`). Acotado para que
-- ninguna petición pague la limpieza de un día entero, y suficiente porque cada petición limpia más
-- de lo que ensucia (ensucia a lo sumo una fila).
--
-- Solo service_role: la tabla no tiene políticas (deny-all bajo RLS) y las funciones son SECURITY
-- DEFINER sin EXECUTE para anon/authenticated. Si un cliente pudiera llamarlas, podría agotar el
-- cupo de otra IP o del tope global y dejar fuera a los demás.
--
-- Nada en el escritorio usa esto; la tabla existe también en el Postgres local de la caja porque
-- aplica las mismas migraciones, y ahí se queda vacía.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) sync_pull_snapshot sin `encrypted_password` de personas — hallazgo C2-5
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Qué estaba mal. La rebanada de `auth.users` que baja a cada caja (definición vigente en
-- 0116_zonas_envio.sql) incluía `encrypted_password` de TODOS los usuarios con acceso al tenant,
-- incluidos el dueño y los administradores: su contraseña del panel web, en bcrypt. Reproducido con
-- el seed: `sync_pull_snapshot('99999999-…aa')->'users'` trae el hash de dueno@knockout.dev. Ese hash
-- queda en el Postgres de cada caja —que la LAN del local alcanza— y se puede atacar sin límite de
-- intentos, fuera de línea. Una contraseña del dueño recuperada abre el panel web desde cualquier
-- lugar.
--
-- Para qué lo usaba la caja (revisado en desktop/src): `deviceSignIn` (auth.mjs) valida con
-- `crypt($2, encrypted_password)` el login de supabase-js contra el gateway local, y el ÚNICO que
-- hace ese login es el POS con las credenciales del dispositivo (apps/pos/app/lib/supabase.ts). El
-- escritorio no sirve el panel de administración, los empleados entran por PIN (`pin_hash`,
-- verificar_pin_login) y nada más lee `encrypted_password`. Es decir: ningún flujo local legítimo
-- necesita la contraseña de una persona, solo la de la cuenta de la caja.
--
-- Arreglo. `encrypted_password` solo viaja para las cuentas de DISPOSITIVO: correo sintético de
-- caja (`caja-<uuid>@dispositivos.vimpos.com.mx` o el dominio viejo, ver _shared/dispositivo.ts), rol
-- DISPOSITIVO en este tenant, y NINGÚN acceso con otro rol en ningún tenant (una cuenta que además
-- sea de una persona no es una cuenta de caja). Para todas las demás la clave va como `null`
-- EXPLÍCITO, no se omite: el pull de la caja hace upsert columna por columna con lo que llega, así
-- que un `null` borra en el siguiente ciclo el hash que ya estaba copiado en cada caja instalada.
-- Omitir la clave habría dejado para siempre los hashes ya filtrados.
--
-- Qué NO cambia. `pin_hash` (en usuarios_perfil) sigue bajando: el login por PIN sin internet lo
-- necesita. El costo bcrypt de los PIN nuevos ya es 10 desde la 0064 (crear_perfil_con_pin,
-- resetear_pin_empleado, cambiar_pin_propio; revisado con pg_get_functiondef): no hace falta
-- redeclararlas. Queda anotado en el informe que un PIN de 4–6 dígitos sigue siendo recuperable
-- fuera de línea aunque el costo sea 10: el control real es que el PIN solo sirve con la cuenta de
-- una caja del mismo tenant.
--
-- El cuerpo es el de 0116 (pg_get_functiondef de la vigente) con un solo cambio: la entrada
-- 'users'. Convención del repo: cada migración que toca sync_pull_snapshot la redeclara entera; la
-- siguiente que la toque tiene que partir de ESTA.

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1) Cupos
-- ═════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS limites_cupo (
  clave          text        NOT NULL,
  ventana_inicio timestamptz NOT NULL,
  expira_en      timestamptz NOT NULL,
  usos           integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (clave, ventana_inicio)
);
CREATE INDEX IF NOT EXISTS idx_limites_cupo_expira ON limites_cupo (expira_en);

COMMENT ON TABLE limites_cupo IS
  'Contadores de límite de tasa de las Edge Functions (consumir_cupo). Solo service_role. 0136.';

-- Deny-all: RLS encendido y sin políticas. service_role (BYPASSRLS) y las funciones definer, que
-- corren como el dueño de la tabla, son los únicos que la tocan.
ALTER TABLE limites_cupo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON limites_cupo FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON limites_cupo TO service_role;

-- Inicio de la ventana fija de `p_ventana` que contiene al instante actual.
CREATE OR REPLACE FUNCTION _cupo_ventana(p_ventana interval)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seg double precision := extract(epoch FROM p_ventana);
BEGIN
  IF v_seg IS NULL OR v_seg < 1 OR v_seg > 7 * 86400 THEN
    RAISE EXCEPTION 'VENTANA_INVALIDA: entre 1 segundo y 7 días' USING ERRCODE = '22023';
  END IF;
  -- clock_timestamp y no now(): now() es la hora de inicio de la transacción, y una llamada larga
  -- (o una prueba en una sola transacción) contaría siempre en la misma ventana.
  RETURN to_timestamp(floor(extract(epoch FROM clock_timestamp()) / v_seg) * v_seg);
END;
$$;
REVOKE EXECUTE ON FUNCTION _cupo_ventana(interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION consumir_cupo(p_clave text, p_ventana interval, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inicio timestamptz;
  v_usos   integer;
BEGIN
  IF p_clave IS NULL OR length(p_clave) = 0 OR length(p_clave) > 200 THEN
    RAISE EXCEPTION 'CLAVE_INVALIDA' USING ERRCODE = '22023';
  END IF;
  IF p_max IS NULL OR p_max < 0 THEN
    RAISE EXCEPTION 'MAX_INVALIDO' USING ERRCODE = '22023';
  END IF;
  v_inicio := _cupo_ventana(p_ventana);

  -- Upsert atómico: el conteo lo da la fila bloqueada por el ON CONFLICT, no una lectura previa.
  -- LEAST: un ataque sostenido no puede desbordar el integer y tumbar la función.
  INSERT INTO limites_cupo AS l (clave, ventana_inicio, expira_en, usos)
  VALUES (p_clave, v_inicio, v_inicio + p_ventana, 1)
  ON CONFLICT (clave, ventana_inicio)
  DO UPDATE SET usos = LEAST(l.usos + 1, 2000000000)
  RETURNING l.usos INTO v_usos;

  -- Limpieza acotada de ventanas vencidas (de cualquier clave).
  DELETE FROM limites_cupo
   WHERE ctid IN (SELECT ctid FROM limites_cupo WHERE expira_en < clock_timestamp() LIMIT 200);

  RETURN v_usos <= p_max;
END;
$$;

CREATE OR REPLACE FUNCTION cupo_agotado(p_clave text, p_ventana interval, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usos integer;
BEGIN
  IF p_clave IS NULL OR p_max IS NULL THEN
    RAISE EXCEPTION 'CLAVE_O_MAX_INVALIDO' USING ERRCODE = '22023';
  END IF;
  SELECT usos INTO v_usos FROM limites_cupo
   WHERE clave = p_clave AND ventana_inicio = _cupo_ventana(p_ventana);
  RETURN coalesce(v_usos, 0) >= p_max;
END;
$$;

COMMENT ON FUNCTION consumir_cupo(text, interval, integer) IS
  'Suma un uso a (clave, ventana fija) y devuelve true si todavía cabe (usos <= max). Solo service_role. 0136.';
COMMENT ON FUNCTION cupo_agotado(text, interval, integer) IS
  'true si (clave, ventana actual) ya llegó a max, sin sumar. Para contar solo fallos. Solo service_role. 0136.';

REVOKE EXECUTE ON FUNCTION consumir_cupo(text, interval, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION cupo_agotado(text, interval, integer)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION consumir_cupo(text, interval, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION cupo_agotado(text, interval, integer)  TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2) sync_pull_snapshot: encrypted_password solo de cuentas de dispositivo
-- ═════════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_pull_snapshot(p_tenant uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'tenants',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM tenants x WHERE x.id = p_tenant), '[]'::jsonb),
    'sucursales',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM sucursales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'cajas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM cajas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'secciones',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM secciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'mesas',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM mesas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'areas_cocina',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM areas_cocina x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'marcas_virtuales',               coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM marcas_virtuales x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'categorias',                     coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM categorias x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'grupos_modificadores',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos',                      coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'opciones_modificador',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM opciones_modificador x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'productos_grupos_modificadores', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM productos_grupos_modificadores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Combos (ADR 0015): slots y opciones; el combo mismo ya baja con productos.
    'combo_grupos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_grupos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'combo_opciones',                 coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM combo_opciones x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'subtipos_personal',              coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM subtipos_personal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'configuracion_tenant',           coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM configuracion_tenant x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'repartidores',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM repartidores x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'zonas_envio',                    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM zonas_envio x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    -- Inventario (ADR 0013): lo que la caja necesita para descontar al vender. Nunca sube de vuelta.
    'unidades_medida',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM unidades_medida x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'insumos',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumos x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'insumo_stock_sucursal',          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM insumo_stock_sucursal x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'recetas',                        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recetas x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'receta_componentes',             coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM receta_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'modificador_componentes',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM modificador_componentes x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'roles',                          coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM roles x WHERE x.tenant_id = p_tenant OR x.tenant_id IS NULL), '[]'::jsonb),
    'rol_permisos',                   coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rol_permisos x WHERE x.rol_id IN (SELECT id FROM roles WHERE tenant_id = p_tenant OR tenant_id IS NULL)), '[]'::jsonb),
    'permisos',                       coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM permisos x), '[]'::jsonb),
    'usuarios_acceso',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_acceso x WHERE x.tenant_id = p_tenant), '[]'::jsonb),
    'usuarios_perfil',                coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM usuarios_perfil x WHERE x.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    -- 0136 (C2-5): la contraseña solo de la cuenta de una caja; de las personas, null explícito
    -- para que el siguiente pull borre el hash que ya estaba copiado en cada caja.
    'users',                          coalesce((SELECT jsonb_agg(jsonb_build_object(
                                          'id', u.id, 'email', u.email,
                                          'encrypted_password',
                                            CASE WHEN u.email ~* '^caja-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@dispositivos\.vimpos\.(com\.)?mx$'
                                                  AND EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                               WHERE ua.usuario_id = u.id AND ua.tenant_id = p_tenant
                                                                 AND r.codigo = 'DISPOSITIVO')
                                                  AND NOT EXISTS (SELECT 1 FROM usuarios_acceso ua JOIN roles r ON r.id = ua.rol_id
                                                                   WHERE ua.usuario_id = u.id AND r.codigo <> 'DISPOSITIVO')
                                                 THEN u.encrypted_password
                                            END,
                                          'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at,
                                          'raw_app_meta_data', u.raw_app_meta_data, 'raw_user_meta_data', u.raw_user_meta_data))
                                        FROM auth.users u
                                        WHERE u.id IN (SELECT usuario_id FROM usuarios_acceso WHERE tenant_id = p_tenant)), '[]'::jsonb),
    '__watermark', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
$$;
REVOKE EXECUTE ON FUNCTION sync_pull_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_pull_snapshot(uuid) TO service_role;
