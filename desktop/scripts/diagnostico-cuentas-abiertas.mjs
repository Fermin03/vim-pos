// Diagnóstico: "aparece una cuenta abierta pero no sale por ningún lado".
//
// Lee la base DE LA CAJA (no la nube: divergen) y, por cada ticket sin cobrar, dice en qué
// pantallas del POS aparece y en cuáles no, con el MISMO filtro que usa cada pantalla.
// Una cuenta fantasma es la que cuenta en un número (badge de inicio, aviso del corte) pero no
// cumple el filtro de ninguna lista.
//
// Uso en la caja (la app VIM POS tiene que estar ABIERTA; no instala nada):
//   copiar el .mjs a C:\vim\ y luego
//   $env:ELECTRON_RUN_AS_NODE=1; & "$env:LOCALAPPDATA\Programs\VIM POS\VIM POS.exe" "C:\vim\diagnostico-cuentas-abiertas.mjs"
// Deja el resultado junto al script: diagnostico-cuentas-abiertas.txt. Solo lectura.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(process.env.LOCALAPPDATA, "Programs", "VIM POS", "resources", "app");
const DATA = path.join(process.env.APPDATA, "vim-pos-desktop");
// Junto al propio script: el Escritorio puede vivir en OneDrive y no en %USERPROFILE%\Desktop.
const SALIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), "diagnostico-cuentas-abiertas.txt");

const lineas = [];
const log = (s = "") => { lineas.push(s); console.log(s); };
const guardar = () => writeFileSync(SALIDA, lineas.join("\r\n"), "utf8");

const pg = createRequire(path.join(APP, "package.json"))("pg");
const password = readFileSync(path.join(DATA, "bin", ".pg-password"), "utf8").trim();
const db = new pg.Client({ host: "127.0.0.1", port: 54329, user: "postgres", password, database: "vimpos" });

async function q(titulo, sql, params = []) {
  try {
    return (await db.query(sql, params)).rows;
  } catch (e) {
    log(`!! ${titulo}: ${e.message}`);
    return [];
  }
}

const VIVOS = ["BORRADOR", "ABIERTO"];

try {
  await db.connect();
} catch (e) {
  log(`No pude conectar a la base de la caja (${e.message}). ¿Está abierta la app VIM POS?`);
  guardar();
  process.exit(1);
}

log(`DIAGNÓSTICO DE CUENTAS ABIERTAS — ${new Date().toISOString()}`);
log(`Máquina: ${process.env.COMPUTERNAME ?? "?"}`);
log("");

// ── Turnos abiertos: los badges de inicio y el corte cuentan por turno ─────────────
const turnos = await q("turnos", `
  SELECT to_jsonb(t) AS t FROM turnos t
  WHERE t.estado = 'ABIERTO' ORDER BY t.fecha_apertura DESC`);
log(`== TURNOS ABIERTOS (${turnos.length}) ==`);
for (const { t } of turnos) log(`  ${t.id}  ${t.codigo_turno}  caja=${t.caja_id}  sucursal=${t.sucursal_id}  desde ${t.fecha_apertura}`);
const turnoIds = new Set(turnos.map(({ t }) => t.id));
const cajaIds = new Set(turnos.map(({ t }) => t.caja_id));
log("");

// ── Todos los tickets sin cobrar ───────────────────────────────────────────────────
const tickets = await q("tickets", `
  SELECT to_jsonb(t) AS t,
         (SELECT jsonb_agg(jsonb_build_object('producto', i.producto_nombre_snapshot, 'cant', i.cantidad,
                                              'cancelado', i.cancelado, 'total', i.total_item_mxn))
            FROM ticket_items i WHERE i.ticket_id = t.id) AS items,
         (SELECT jsonb_agg(jsonb_build_object('mesa', m.numero, 'mesa_estado', m.estado,
                                              'desde', tm.fecha_asignacion, 'liberada', tm.fecha_liberacion))
            FROM tickets_mesas tm LEFT JOIN mesas m ON m.id = tm.mesa_id WHERE tm.ticket_id = t.id) AS mesas,
         (SELECT to_jsonb(tu) FROM turnos tu WHERE tu.id = t.turno_id) AS turno
  FROM tickets t
  WHERE t.estado_fiscal IN ('BORRADOR','ABIERTO')
  ORDER BY t.created_at`);

log(`== TICKETS SIN COBRAR (BORRADOR/ABIERTO): ${tickets.length} ==`);
log("");

let fantasmas = 0;
for (const { t, items, mesas, turno } of tickets) {
  const vivo = VIVOS.includes(t.estado_fiscal);
  const borrado = t.deleted_at != null;
  const delTurnoAbierto = turnoIds.has(t.turno_id);
  const deEstaCaja = cajaIds.has(t.caja_id);
  const modo = t.modo_servicio;

  // Mismos filtros que el código del POS (apps/pos/app/lib/*.ts).
  const pantallas = {
    "Badge inicio (turno.ts contarCuentasAbiertasPorModo)":
      delTurnoAbierto && t.estado_fiscal === "ABIERTO" && !borrado &&
      ["COMER_AQUI", "DRIVE_THRU", "DELIVERY_PROPIO"].includes(modo),
    "Aviso del corte (cierre.ts contarTicketsAbiertos)":
      delTurnoAbierto && t.estado_fiscal === "ABIERTO" && !borrado,
    "Lista del corte (listarCuentasQueBloqueanCorte)":
      delTurnoAbierto && vivo && !borrado,
    "Lista Comedor (MESA/COMER_AQUI)":
      ["MESA", "COMER_AQUI"].includes(modo) && vivo && !borrado && t.en_espera === false,
    "Lista Pick-up (DRIVE_THRU)":
      modo === "DRIVE_THRU" && vivo && !borrado && t.en_espera === false,
    "Lista Domicilio (DELIVERY_PROPIO)":
      modo === "DELIVERY_PROPIO" && vivo && !borrado && t.en_espera === false,
    "Pedidos en espera (espera.ts, por caja)":
      deEstaCaja && t.en_espera === true && vivo,
  };
  const cuenta = pantallas["Badge inicio (turno.ts contarCuentasAbiertasPorModo)"] ||
                 pantallas["Aviso del corte (cierre.ts contarTicketsAbiertos)"];
  const fantasma = cuenta && !Object.entries(pantallas).some(([k, v]) => v && (k.startsWith("Lista Comedor") || k.startsWith("Lista Pick") || k.startsWith("Lista Dom") || k.startsWith("Pedidos")));
  if (fantasma) fantasmas++;

  log(`${fantasma ? ">>> POSIBLE FANTASMA <<< " : ""}Ticket ${t.id}`);
  log(`  folio=${t.folio_completo ?? "(sin folio)"}  estado=${t.estado_fiscal}  modo=${modo}  cocina=${t.estado_cocina}`);
  log(`  total=$${t.total_mxn}  pendiente=$${t.monto_pendiente_mxn}  en_espera=${t.en_espera}${t.etiqueta_espera ? ` ("${t.etiqueta_espera}")` : ""}  borrado=${borrado ? t.deleted_at : "no"}`);
  log(`  creado=${t.created_at}  apertura=${t.fecha_apertura ?? "-"}  sucursal=${t.sucursal_id}  caja=${t.caja_id}`);
  log(`  turno=${t.turno_id} → ${turno ? `${turno.codigo_turno} (${turno.estado})` : "NO EXISTE"}${delTurnoAbierto ? "" : "  ← NO es del turno abierto"}`);
  log(`  mesas=${JSON.stringify(mesas ?? [])}`);
  log(`  items=${JSON.stringify(items ?? [])}`);
  for (const [k, v] of Object.entries(pantallas)) log(`    ${v ? "SÍ" : "no"}  ${k}`);
  log("");
}

log(`== RESUMEN: ${tickets.length} sin cobrar, ${fantasmas} cuentan en algún número pero no salen en ninguna lista ==`);
log("");

// ── Mesas: asignaciones vivas y lo que ve la pantalla de mesas ─────────────────────
log("== MESAS ==");
for (const { m } of await q("mesas", `SELECT to_jsonb(m) AS m FROM mesas m WHERE m.deleted_at IS NULL ORDER BY m.numero`))
  log(`  mesa ${m.numero}  estado=${m.estado}  id=${m.id}`);
log("-- tickets_mesas vivas (fecha_liberacion NULL):");
for (const r of await q("tickets_mesas", `
  SELECT m.numero, tm.ticket_id, tm.fecha_asignacion, t.estado_fiscal, t.deleted_at
  FROM tickets_mesas tm LEFT JOIN mesas m ON m.id = tm.mesa_id LEFT JOIN tickets t ON t.id = tm.ticket_id
  WHERE tm.fecha_liberacion IS NULL ORDER BY tm.fecha_asignacion`))
  log(`  mesa ${r.numero} → ticket ${r.ticket_id} (${r.estado_fiscal ?? "NO EXISTE"}${r.deleted_at ? ", borrado" : ""}) desde ${r.fecha_asignacion?.toISOString?.() ?? r.fecha_asignacion}`);
log("-- vw_mesas_estado_actual:");
for (const { v } of await q("vista", `SELECT to_jsonb(v) AS v FROM vw_mesas_estado_actual v`)) log(`  ${JSON.stringify(v)}`);
log("");

// ── Migraciones aplicadas en esta caja (¿trae la 0115?) ────────────────────────────
const migs = await q("migraciones", `SELECT to_jsonb(x) AS x FROM _vim_migraciones x`);
const nombres = migs.map(({ x }) => x.nombre ?? x.name ?? x.version ?? JSON.stringify(x)).sort();
log(`== MIGRACIONES: ${nombres.length} aplicadas; últimas: ${nombres.slice(-5).join(", ")} ==`);
log("");

// ── Cola del log de la app ─────────────────────────────────────────────────────────
const LOG_APP = path.join(DATA, "vim-pos.log");
if (existsSync(LOG_APP)) {
  const cola = readFileSync(LOG_APP, "utf8").split(/\r?\n/).slice(-60);
  log("== ÚLTIMAS 60 LÍNEAS DE vim-pos.log ==");
  for (const l of cola) log(`  ${l}`);
}

await db.end();
guardar();
console.log(`\nListo. Resultado guardado en: ${SALIDA}`);
