// Prueba de carga · paso 1 — Captura una PLANTILLA con la forma real de un snapshot de push.
//
// POR QUÉ NO SE INVENTA EL PAYLOAD.
//
// Medir la nube con tickets sintéticos hechos a mano miente por dos lados: el tamaño (un ticket
// real trae snapshots fiscales, modificadores y notas — pesa varias veces lo que uno de juguete)
// y las llaves foráneas (un producto o una caja que no existen hacen que `_vim_apply_rows` caiga
// al camino fila-por-fila de la 0074, que es MÁS lento que el normal: se estaría midiendo la
// ruta de error). Así que la plantilla sale de un día real de operación de una caja real, y el
// generador de carga la clona.
//
// No usa `construirSnapshotPush` de sync-push.mjs a propósito: esa función solo devuelve lo
// PENDIENTE de subir, y en una caja al corriente eso son cero filas. Aquí se quiere un día
// cualquiera, ya subido o no.
//
// Uso (con la caja apagada o corriendo — solo lee):
//   node scripts/capturar-plantilla.mjs --dia 2026-08-19
//   node scripts/capturar-plantilla.mjs --ultimos 40 --salida plantillas/knockout.json
//   node scripts/capturar-plantilla.mjs --listar-dias        # qué días tiene esta caja
//
// Opciones:
//   --dia YYYY-MM-DD   día contable a capturar (recomendado: el más ocupado)
//   --ultimos N        en vez de un día, las últimas N ventas terminales
//   --salida ruta      destino (default: plantillas/plantilla-<dia>.json)
//   --pg-port N        puerto del Postgres de la caja (default 54329)
//   --data-root ruta   carpeta de datos de la caja instalada (para leer su contraseña)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lector de argumentos: `--clave valor` y banderas sueltas. */
function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  const sig = process.argv[i + 1];
  return !sig || sig.startsWith("--") ? true : sig;
}

/**
 * La contraseña del Postgres local ya no es fija (SEC CN-018): runtime.mjs genera una por
 * instalación. Se busca donde la deja: el repo para el Postgres de desarrollo, o la carpeta de
 * datos de la app instalada.
 */
function passLocal() {
  const dataRoot = arg("data-root");
  const candidatos = [
    dataRoot ? path.join(String(dataRoot), "bin", ".pg-password") : null,
    dataRoot ? path.join(String(dataRoot), ".pg-password") : null,
    path.join(raiz, "bin", ".pg-password"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "vim-pos-desktop", "bin", ".pg-password") : null,
  ].filter(Boolean);
  for (const c of candidatos) {
    try {
      const v = readFileSync(c, "utf8").trim();
      if (v) return v;
    } catch { /* siguiente */ }
  }
  return "postgres"; // clúster anterior a la rotación
}

const TERMINALES = ["PAGADO", "FACTURADO", "CANCELADO"];

// La misma forma exacta que arma `construirSnapshotPush` en sync-push.mjs. Si allá se agrega una
// tabla a la rebanada, aquí también — si no, la plantilla mide de menos.
const SQL_SNAPSHOT = `
  WITH tk AS (
    SELECT id, turno_id FROM tickets
     WHERE estado_fiscal = ANY($1)
       AND ($2::date IS NULL OR dia_contable = $2::date)
       AND deleted_at IS NULL
     ORDER BY fecha_apertura DESC
     LIMIT $3
  ),
  tn AS (
    SELECT DISTINCT id FROM turnos WHERE id IN (SELECT turno_id FROM tk)
  )
  SELECT
    (SELECT count(*)::int FROM tk) AS n_tickets,
    (SELECT tenant_id FROM tickets WHERE id IN (SELECT id FROM tk) LIMIT 1) AS tenant_id,
    jsonb_strip_nulls(jsonb_build_object(
      'turnos',                    (SELECT jsonb_agg(to_jsonb(x)) FROM turnos x WHERE x.id IN (SELECT id FROM tn)),
      'tickets',                   (SELECT jsonb_agg(to_jsonb(x)) FROM tickets x WHERE x.id IN (SELECT id FROM tk)),
      'ticket_items',              (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_items x WHERE x.ticket_id IN (SELECT id FROM tk)),
      'ticket_item_modificadores', (SELECT jsonb_agg(to_jsonb(x)) FROM ticket_item_modificadores x WHERE x.ticket_item_id IN (SELECT id FROM ticket_items WHERE ticket_id IN (SELECT id FROM tk))),
      'pagos',                     (SELECT jsonb_agg(to_jsonb(x)) FROM pagos x WHERE x.ticket_id IN (SELECT id FROM tk)),
      'movimientos_caja',          (SELECT jsonb_agg(to_jsonb(x)) FROM movimientos_caja x WHERE x.turno_id IN (SELECT id FROM tn)),
      'delivery_asignaciones',     (SELECT jsonb_agg(to_jsonb(x)) FROM delivery_asignaciones x WHERE x.ticket_id IN (SELECT id FROM tk))
    )) AS snapshot
`;

const pool = new pg.Pool({
  host: "127.0.0.1",
  port: Number(arg("pg-port", 54329)),
  user: "postgres",
  password: passLocal(),
  database: "vimpos",
  max: 2,
});

try {
  // Modo inventario: sirve para elegir qué día capturar sin adivinar.
  if (arg("listar-dias")) {
    const { rows } = await pool.query(
      `SELECT dia_contable, count(*)::int AS ventas, round(sum(total_mxn), 2) AS total
         FROM tickets
        WHERE estado_fiscal = ANY($1) AND deleted_at IS NULL
        GROUP BY dia_contable ORDER BY ventas DESC LIMIT 30`, [TERMINALES]);
    if (!rows.length) {
      console.log("Esta caja no tiene ventas terminales.");
    } else {
      console.log("Días con más ventas en esta caja (el más ocupado es la mejor plantilla):\n");
      for (const r of rows) {
        const dia = r.dia_contable instanceof Date ? r.dia_contable.toISOString().slice(0, 10) : String(r.dia_contable);
        console.log(`  ${dia}   ${String(r.ventas).padStart(4)} ventas   $${r.total}`);
      }
    }
    process.exit(0);
  }

  const dia = arg("dia") ? String(arg("dia")) : null;
  const ultimos = arg("ultimos") ? Number(arg("ultimos")) : null;
  if (!dia && !ultimos) {
    console.error("Falta qué capturar: --dia YYYY-MM-DD  o  --ultimos N  (o --listar-dias para ver qué hay).");
    process.exit(2);
  }

  const { rows } = await pool.query(SQL_SNAPSHOT, [TERMINALES, dia, ultimos ?? 100000]);
  const { snapshot, n_tickets: nTickets, tenant_id: tenantId } = rows[0];

  if (!nTickets) {
    console.error(`No hay ventas terminales para ${dia ? `el día ${dia}` : `las últimas ${ultimos}`}.`);
    console.error("Corre --listar-dias para ver qué días tiene esta caja.");
    process.exit(1);
  }

  const resumen = Object.fromEntries(Object.entries(snapshot).map(([t, filas]) => [t, filas?.length ?? 0]));
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));

  const plantilla = {
    capturada_en: new Date().toISOString(),
    origen: dia ? { dia } : { ultimos },
    tenant_id: tenantId,
    resumen,
    bytes,
    snapshot,
  };

  const salida = path.resolve(raiz, String(arg("salida", path.join("plantillas", `plantilla-${dia ?? `ultimos-${ultimos}`}.json`))));
  if (!existsSync(path.dirname(salida))) mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, JSON.stringify(plantilla, null, 2), "utf8");

  console.log(`\n✅ Plantilla capturada → ${path.relative(raiz, salida)}`);
  console.log(`   tenant   ${tenantId}`);
  console.log(`   tamaño   ${(bytes / 1024).toFixed(1)} KB de JSON`);
  console.log(`   filas    ${Object.entries(resumen).map(([t, n]) => `${t}=${n}`).join(" · ")}`);
  console.log(`\n   Este es el peso REAL de un push. Un ciclo normal de 10 min sube una fracción;`);
  console.log(`   un día entero (esta plantilla) es el caso "la caja estuvo desconectada".\n`);
} catch (e) {
  console.error("\n❌ No se pudo capturar:", e.message);
  if (/ECONNREFUSED/.test(e.message)) {
    console.error("   El Postgres de la caja no está escuchando. Levanta la app (npm start) o pasa --pg-port.");
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
