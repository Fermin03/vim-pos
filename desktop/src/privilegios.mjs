// Privilegios de tabla del Postgres local (Auditoría integral 30/09/2026, hallazgo D1).
//
// QUÉ ESTABA MAL. En cada arranque runtime.mjs hacía
//   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
//   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
// después de aplicar las migraciones. Dos daños:
//   a) Las libretas del sync (_vim_migraciones, _vim_push_ok, _vim_mov_ok, _vim_errores_ok,
//      _vim_turnos_ok, _vim_sync, …) no tienen RLS: quedaban escribibles por CUALQUIER JWT
//      `authenticated` a través del gateway, que escucha en la LAN. Borrar una fila de
//      _vim_migraciones hace que el siguiente arranque reaplique esa migración y la caja no abra;
//      meter ids en _vim_mov_ok/_vim_errores_ok hace que esas filas no suban nunca a la nube. Y
//      `anon` (sin sesión) leía _vim_migraciones.
//   b) Deshacía, en cada arranque, los REVOKE deliberados de las migraciones (0024, 0084, 0090,
//      0092, 0128, 0130 y los que vengan con grants por columna): en la caja quedaban sin efecto.
//
// POR QUÉ EXISTÍA. Venía de la Fase 0, cuando ninguna migración otorgaba privilegios de tabla y el
// shim aún no fijaba default privileges: sin ese GRANT, PostgREST contestaba "permission denied".
// Hoy ya no hace falta: el shim fija ALTER DEFAULT PRIVILEGES antes de la primera migración y la
// 0065 hace lo mismo (y el GRANT inicial sobre lo que ya existía). Es exactamente lo que hace
// Supabase en la nube: cada tabla nace con sus privilegios y cada migración los recorta si quiere.
// Una caja ya instalada conserva los grants que ya tenía (viven en el ACL de cada tabla), así que
// quitarlo no le retira nada que necesite.
//
// Lo que queda aquí:
//   · blindarTablasInternas: REVOKE ALL de anon/authenticated/PUBLIC sobre toda tabla _vim_*.
//     Corre en cada arranque. Las que se crean A MEDIA JORNADA (el primer push crea varias) las
//     cubre además el event trigger del shim (vim_blindar_tablas_internas), así que no hace falta
//     acordarse de esto en cada helper que haga CREATE TABLE IF NOT EXISTS _vim_…
//   · repararRevokesUnaVez: reaplica, UNA sola vez, los REVOKE de las migraciones que el GRANT
//     masivo había deshecho en las cajas ya instaladas. Va ANTES de aplicar las migraciones nuevas,
//     para que ninguna de estas sentencias viejas pise lo que decida una migración posterior.

/** Tablas internas del escritorio: sin RLS, no son de la API. Patrón LIKE con '_' escapado. */
export const PATRON_TABLAS_INTERNAS = "\\_vim\\_%";

/**
 * Sentencias de privilegios de las migraciones que el GRANT masivo deshacía, en su orden original.
 * Copiadas literalmente de cada archivo (no parseadas) para que se lean y se auditen. Cada una
 * se aplica solo si su tabla existe (una caja vieja puede no tener todavía la 0128 o la 0130).
 */
export const REVOKES_DE_MIGRACIONES = [
  // El GRANT masivo daba además SELECT a `anon` sobre TODO (tablas sin RLS incluidas: planes,
  // roles, permisos…), legible sin sesión desde la LAN. La 0065 dice expresamente que anon no
  // necesita nada, y una caja nueva ya nace así; esto iguala a las ya instaladas.
  { tablas: [], sql: "REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon" },
  { tablas: ["errores_app"], sql: "GRANT SELECT, INSERT ON public.errores_app TO authenticated, anon" }, // 0072
  { tablas: ["super_admin_accesos"], sql: "REVOKE ALL ON super_admin_accesos FROM anon, authenticated, public" }, // 0024
  { tablas: ["prospectos"], sql: "REVOKE ALL ON prospectos FROM anon, authenticated" }, // 0084
  // 0090 — el REVOKE y los GRANT que lo siguen en la misma migración: van juntos o no van.
  {
    tablas: ["delivery_conexiones", "delivery_pedidos", "delivery_eventos", "delivery_credenciales_app"],
    sql: [
      "REVOKE ALL ON delivery_conexiones, delivery_pedidos, delivery_eventos, delivery_credenciales_app FROM anon, authenticated",
      "GRANT SELECT, INSERT, UPDATE ON delivery_conexiones TO authenticated, service_role",
      "GRANT SELECT ON delivery_pedidos TO authenticated",
      "GRANT SELECT, INSERT, UPDATE ON delivery_pedidos TO service_role",
      "GRANT SELECT ON delivery_eventos TO authenticated",
      "GRANT SELECT, INSERT, UPDATE ON delivery_eventos TO service_role",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_credenciales_app TO service_role",
    ].join(";\n"),
  },
  {
    tablas: ["delivery_autorizaciones"], // 0092
    sql: "REVOKE ALL ON delivery_autorizaciones FROM PUBLIC, anon, authenticated;\n" +
      "GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_autorizaciones TO service_role",
  },
  { tablas: ["plataforma_operadores"], sql: "REVOKE ALL ON plataforma_operadores FROM anon, authenticated" }, // 0128
  {
    tablas: ["pagos_suscripcion"], // 0130
    sql: "REVOKE ALL ON pagos_suscripcion FROM anon;\n" +
      "REVOKE INSERT, UPDATE, DELETE ON pagos_suscripcion FROM authenticated;\n" +
      "GRANT SELECT ON pagos_suscripcion TO authenticated",
  },
];

const MARCADOR_REPARACION = "reaplicar_revokes_d1";

/**
 * REVOKE ALL sobre toda tabla _vim_* del esquema public. Idempotente; corre en cada arranque.
 * service_role se deja: solo lo porta quien tiene el secreto JWT de esta caja (el propio main).
 */
export async function blindarTablasInternas(db) {
  const { rows } = await db.query(
    `SELECT format('%I.%I', n.nspname, c.relname) AS t
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND c.relname LIKE $1`,
    [PATRON_TABLAS_INTERNAS]);
  for (const { t } of rows) await db.query(`REVOKE ALL ON ${t} FROM PUBLIC, anon, authenticated`);
  return rows.length;
}

/**
 * Reaplica UNA vez los REVOKE que el GRANT masivo deshizo en cajas ya instaladas.
 *
 * `hayMigracionesPrevias` = la BD ya tenía migraciones aplicadas antes de este arranque. En una
 * caja nueva no hay nada que reparar (nunca corrió el GRANT masivo): solo se deja el marcador.
 * Nunca tumba el arranque: si algo falla se registra y la caja sigue (con el ACL de antes, que es
 * el que ya tenía ayer).
 */
export async function repararRevokesUnaVez(db, { hayMigracionesPrevias, log = () => {} }) {
  try {
    await db.query("CREATE TABLE IF NOT EXISTS _vim_migraciones_sync (clave text PRIMARY KEY, aplicada_at timestamptz DEFAULT now())");
    const { rowCount } = await db.query("SELECT 1 FROM _vim_migraciones_sync WHERE clave = $1", [MARCADOR_REPARACION]);
    if (rowCount) return { reparadas: 0, yaCorrio: true };
    let reparadas = 0;
    if (hayMigracionesPrevias) {
      for (const r of REVOKES_DE_MIGRACIONES) {
        if (r.tablas.length) {
          const { rows } = await db.query("SELECT bool_and(to_regclass(t) IS NOT NULL) AS todas FROM unnest($1::text[]) t", [r.tablas]);
          if (!rows[0]?.todas) continue;
        }
        await db.query(r.sql);
        reparadas++;
      }
      if (reparadas) log(`privilegios: ${reparadas} REVOKE de migraciones reaplicados (el GRANT masivo de arranques anteriores los había deshecho)`);
    }
    await db.query("INSERT INTO _vim_migraciones_sync(clave) VALUES ($1) ON CONFLICT DO NOTHING", [MARCADOR_REPARACION]);
    return { reparadas, yaCorrio: false };
  } catch (e) {
    log(`privilegios: no se pudieron reaplicar los REVOKE (${e?.message ?? e}); la caja sigue`);
    return { reparadas: 0, error: String(e?.message ?? e) };
  }
}
