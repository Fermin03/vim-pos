#!/usr/bin/env node
/**
 * Rescata los cortes de caja que se quedaron atrapados en esta caja.
 *
 * POR QUÉ HACE FALTA
 *
 * Hasta la 0089, la sincronización no subía `cortes_caja` ni el reporte Z: se
 * generaban aquí, se imprimían, y no salían nunca. En el piloto quedaron trece
 * turnos cerrados sin un solo corte en la nube, y el reporte «Cortes Z
 * históricos» del panel estaba vacío para siempre.
 *
 * Arreglar la sincronización no basta para recuperarlos. La caja lleva una
 * HUELLA por turno (`_vim_turnos_ok`) para no reenviar lo que ya subió: como
 * esos turnos no han cambiado desde entonces, su huella coincide y no se vuelven
 * a mandar — y sus cortes se quedarían aquí igual que hasta ahora.
 *
 * QUÉ HACE
 *
 * Borra la huella de los turnos que tienen corte o reporte Z. Eso es todo: en el
 * siguiente ciclo de sincronización esos turnos se ven como «cambiados» y suben
 * otra vez, esta vez arrastrando su cierre.
 *
 * NO borra datos ni toca la nube. Y volver a subir un turno es inofensivo: el
 * lado de la nube hace `ON CONFLICT (id) DO UPDATE`, así que re-enviar escribe
 * lo mismo encima. Se puede correr dos veces sin consecuencias.
 *
 * USO
 *
 *   npm run resincronizar-cortes            (ver qué haría, sin tocar nada)
 *   npm run resincronizar-cortes -- --hacer (aplicarlo)
 *
 * Después, deja la caja abierta hasta que el sync corra: el ciclo es de unos
 * minutos. Se confirma en el panel, en Reportes → Cortes Z históricos.
 */
import { startBackend } from "../src/backend.mjs";

const aplicar = process.argv.includes("--hacer");

async function main() {
  const backend = await startBackend();
  const pool = backend.pool;
  const q = async (sql, p) => (await pool.query(sql, p)).rows;

  // Si la tabla de huellas no existe, esta caja nunca ha sincronizado: no hay nada que rescatar.
  const [{ existe }] = await q(
    "SELECT to_regclass('public._vim_turnos_ok') IS NOT NULL AS existe",
  );
  if (!existe) {
    console.log("Esta caja no tiene registro de sincronización todavía: no hay nada que rescatar.");
    return;
  }

  const pendientes = await q(`
    SELECT t.id, t.codigo_turno, t.fecha_apertura::date AS dia,
           (SELECT count(*) FROM cortes_caja c WHERE c.turno_id = t.id)          AS cortes,
           (SELECT count(*) FROM reportes_z_historico z WHERE z.turno_id = t.id) AS reportes_z
      FROM turnos t
      JOIN _vim_turnos_ok o ON o.turno_id = t.id
     WHERE EXISTS (SELECT 1 FROM cortes_caja c WHERE c.turno_id = t.id)
        OR EXISTS (SELECT 1 FROM reportes_z_historico z WHERE z.turno_id = t.id)
     ORDER BY t.fecha_apertura
  `);

  if (pendientes.length === 0) {
    console.log("No hay turnos con corte pendiente de re-enviar. Todo al día.");
    return;
  }

  console.log(`Turnos con cierre que volverán a subir: ${pendientes.length}\n`);
  for (const t of pendientes) {
    console.log(
      `  ${String(t.codigo_turno).padEnd(26)} ${t.dia}   ` +
        `${t.cortes} corte(s), ${t.reportes_z} reporte(s) Z`,
    );
  }

  if (!aplicar) {
    console.log("\nEsto fue solo una vista previa. Para aplicarlo:");
    console.log("  npm run resincronizar-cortes -- --hacer");
    return;
  }

  const borrados = await q(
    `DELETE FROM _vim_turnos_ok WHERE turno_id = ANY($1::uuid[]) RETURNING turno_id`,
    [pendientes.map((t) => t.id)],
  );
  console.log(
    `\nListo: ${borrados.length} turno(s) marcados para re-enviar.\n` +
      "Deja la caja encendida y conectada; suben en el próximo ciclo de sincronización.\n" +
      "Se comprueba en el panel: Reportes → Cortes Z históricos.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("No se pudo completar:", e?.message ?? e);
    process.exit(1);
  });
