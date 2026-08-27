// Prueba de carga · paso 2 — ¿Cuántos tenants aguanta la nube antes de dar errores?
//
// QUÉ MIDE Y POR QUÉ ASÍ.
//
// El POS vende contra el Postgres de la caja: dos restaurantes cobrando a la vez no compiten por
// nada. Lo único compartido es la nube, y a la nube solo le llegan cuatro cosas: `sync-push`
// (cada 10 min por dispositivo), `sync-pull` (1 de cada 6 ciclos ≈ 1 h), el timbrado de CFDI y
// las lecturas del panel. Este script ataca las dos primeras, que son las que escalan con el
// número de clientes y las únicas que corren una RPC pesada (`sync_push_snapshot` aplica todo el
// snapshot en UNA transacción, en modo réplica).
//
// El resultado no es un número inventado: se sube la concurrencia por escalones hasta que la
// latencia p95 o la tasa de error cruzan un umbral, y de la capacidad medida se despeja cuántos
// tenants caben — contando el pico de las 20:00 h, no el promedio del día.
//
// CONTRA QUÉ SE CORRE.
//
// Contra un proyecto de STAGING, nunca contra producción: el push ESCRIBE ventas. El script se
// niega a apuntar al ref de producción salvo que se le fuerce con VIM_CARGA_PERMITIR_PROD=1, y
// aun así sella todo con un día contable falso (2099-01-01 por defecto) para que la basura no
// aparezca en ningún reporte y se pueda borrar con una sola consulta. Al terminar deja escrito
// el SQL de limpieza.
//
// USO
//   # 1) capturar la plantilla desde una caja real (ver capturar-plantilla.mjs)
//   node scripts/capturar-plantilla.mjs --dia 2026-08-19
//
//   # 2) credenciales: un dispositivo por tenant simulado, en un JSON
//   #    [{ "etiqueta": "tenant-01", "email": "caja-…@dispositivos.vimpos.mx", "pass": "…" }]
//   VIM_CLOUD_URL=https://<staging>.supabase.co VIM_CLOUD_ANON=<anon> \
//     node scripts/carga-nube.mjs --plantilla plantillas/plantilla-2026-08-19.json \
//                                 --dispositivos dispositivos.json
//
//   # o con un solo dispositivo, tomándolo del env como verify:cloud
//   VIM_CLOUD_URL=… VIM_CLOUD_ANON=… VIM_DEVICE_EMAIL=… VIM_DEVICE_PASS=… \
//     node scripts/carga-nube.mjs --plantilla plantillas/plantilla-2026-08-19.json
//
// MODOS
//   --modo rampa        (default) escalones 1,2,4,8,16… hasta que se degrada. Halla el techo.
//   --modo sostenido    concurrencia fija; sirve para dejarlo corriendo y ver si se cae solo.
//   --modo realista     N tenants con su ritmo real de 10 min, acelerado por --acelerar.
//
// OPCIONES ÚTILES
//   --endpoint push|pull|mixto   qué se ataca (default push; `pull` NO escribe nada)
//   --ventas N                   ventas por push (default: las que traiga la plantilla)
//   --concurrencia N             (sostenido) peticiones en vuelo
//   --duracion S                 segundos por escalón / del sostenido (default 30)
//   --tenants N                  (realista) tenants simulados
//   --dispositivos-por-tenant N  (realista) cajas + KDS por tenant (default 1)
//   --acelerar F                 (realista) F=60 → una hora de operación en un minuto
//   --umbral-p95 MS              corta la rampa al cruzarlo (default 3000)
//   --umbral-error PCT           corta la rampa al cruzarlo (default 2)
//   --dia-contable YYYY-MM-DD    sello de la basura de prueba (default 2099-01-01)
//   --salida ruta                JSON con los resultados crudos
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  const sig = process.argv[i + 1];
  return !sig || sig.startsWith("--") ? true : sig;
}
const num = (nombre, pd) => Number(arg(nombre, pd));

// Ritmo real de la caja, copiado de sync-ciclo.mjs. Si allá cambia, aquí también: de estos dos
// números sale la conversión de "peticiones por segundo" a "tenants".
const SYNC_CADA_MS = 10 * 60 * 1000;
const SYNC_PULL_CADA = 6;

const REF_PRODUCCION = "pbiaxzvmssjsxdwqrumb";

// ─────────────────────────────────────────────────────────────────────────────
// Configuración y guardas
// ─────────────────────────────────────────────────────────────────────────────

const cloudUrl = (process.env.VIM_CLOUD_URL ?? "").replace(/\/$/, "");
const anonKey = process.env.VIM_CLOUD_ANON ?? "";
if (!cloudUrl || !anonKey) {
  console.error("Falta VIM_CLOUD_URL y/o VIM_CLOUD_ANON.");
  process.exit(2);
}
if (cloudUrl.includes(REF_PRODUCCION) && process.env.VIM_CARGA_PERMITIR_PROD !== "1") {
  console.error(`\n⛔ Ese es el proyecto de PRODUCCIÓN (${REF_PRODUCCION}).`);
  console.error("   Esta prueba INSERTA ventas falsas. Apúntala a un proyecto de staging.");
  console.error("   Si de verdad es lo que quieres: VIM_CARGA_PERMITIR_PROD=1 (y lee la limpieza).\n");
  process.exit(2);
}

const modo = String(arg("modo", "rampa"));
const endpoint = String(arg("endpoint", "push"));
const duracionSeg = num("duracion", 30);
const umbralP95 = num("umbral-p95", 3000);
const umbralError = num("umbral-error", 2);
const diaContable = String(arg("dia-contable", "2099-01-01"));

// ─────────────────────────────────────────────────────────────────────────────
// Plantilla
// ─────────────────────────────────────────────────────────────────────────────

const rutaPlantilla = arg("plantilla");
if (!rutaPlantilla && endpoint !== "pull") {
  console.error("Falta --plantilla (córrelo con capturar-plantilla.mjs). Solo --endpoint pull no la necesita.");
  process.exit(2);
}
const plantilla = rutaPlantilla
  ? JSON.parse(readFileSync(path.resolve(raiz, String(rutaPlantilla)), "utf8"))
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// Clonado del snapshot
//
// Las ventas se regeneran con ids nuevos; los TURNOS y los MOVIMIENTOS DE CAJA viajan verbatim.
// No es descuido: en la vida real el turno se reenvía cada ciclo por su huella (ver el comentario
// de construirSnapshotPush), así que reenviarlo tal cual es exactamente lo que pasa — un upsert
// idempotente sobre una fila que ya existe. Y como no crea filas nuevas, no hay nada que limpiar.
// ─────────────────────────────────────────────────────────────────────────────

// Tablas cuyas filas son ventas nuevas en cada push (se les cambia el id).
const TABLAS_VENTA = ["tickets", "ticket_items", "ticket_item_modificadores", "pagos", "delivery_asignaciones"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

let contadorFolio = 0;

/**
 * Clona el snapshot con identidad nueva.
 *
 * El remapeo de ids es genérico: se construye el mapa viejo→nuevo de todas las filas que se
 * regeneran y después se sustituye CUALQUIER valor que sea una de esas llaves, sin listar
 * columnas a mano (`ticket_id`, `ticket_item_id`, …). Una columna nueva en el esquema queda
 * cubierta sola; una lista escrita a mano se habría quedado atrás.
 */
function clonarSnapshot(fuente, { ventasObjetivo, prefijoCorrida }) {
  const mapa = new Map();
  const salida = {};

  // Repetir la plantilla hasta llegar a las ventas pedidas: así se simula "la caja estuvo
  // desconectada tres días" sin necesidad de capturar tres días.
  const ticketsBase = fuente.tickets ?? [];
  const repeticiones = ventasObjetivo && ticketsBase.length
    ? Math.max(1, Math.ceil(ventasObjetivo / ticketsBase.length))
    : 1;

  for (let r = 0; r < repeticiones; r++) {
    for (const tabla of TABLAS_VENTA) {
      for (const fila of fuente[tabla] ?? []) {
        if (fila?.id) mapa.set(`${r}|${fila.id}`, randomUUID());
      }
    }
  }

  const rehacer = (valor, r) => {
    if (typeof valor === "string") {
      const nuevo = mapa.get(`${r}|${valor}`);
      return nuevo ?? valor;
    }
    return valor;
  };

  for (const tabla of TABLAS_VENTA) {
    const filas = fuente[tabla];
    if (!filas?.length) continue;
    const acumulado = [];
    for (let r = 0; r < repeticiones; r++) {
      for (const fila of filas) {
        const copia = {};
        for (const [col, val] of Object.entries(fila)) copia[col] = rehacer(val, r);

        if (tabla === "tickets") {
          // Folio único por sucursal: si se reenviara el de la plantilla, la segunda petición
          // chocaría contra `ticket_folio_unico_por_sucursal` y se estaría midiendo el camino
          // fila-por-fila de la 0074 en vez del normal.
          contadorFolio++;
          copia.folio_completo = `${prefijoCorrida}-${String(contadorFolio).padStart(6, "0")}`;
          copia.folio_consecutivo = 900000000 + contadorFolio;
          copia.client_id_local = randomUUID().slice(0, 32);
          // Sello de basura de prueba: un día contable que ningún reporte real mira y que hace
          // trivial el borrado posterior.
          copia.dia_contable = diaContable;
        }
        acumulado.push(copia);
        if (tabla === "tickets" && ventasObjetivo && acumulado.length >= ventasObjetivo) break;
      }
      if (tabla === "tickets" && ventasObjetivo && acumulado.length >= ventasObjetivo) break;
    }
    salida[tabla] = acumulado;
  }

  // Los hijos sobran si se recortaron los tickets: quedarse con los que sí tienen padre.
  const idsTicket = new Set((salida.tickets ?? []).map((t) => t.id));
  for (const tabla of ["ticket_items", "pagos", "delivery_asignaciones"]) {
    if (salida[tabla]) salida[tabla] = salida[tabla].filter((f) => idsTicket.has(f.ticket_id));
  }
  const idsItem = new Set((salida.ticket_items ?? []).map((i) => i.id));
  if (salida.ticket_item_modificadores) {
    salida.ticket_item_modificadores = salida.ticket_item_modificadores.filter((m) => idsItem.has(m.ticket_item_id));
  }

  // Verbatim, sin tocar (ver el porqué arriba).
  for (const tabla of ["turnos", "movimientos_caja"]) {
    if (fuente[tabla]?.length) salida[tabla] = fuente[tabla];
  }

  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispositivos (un device sign-in = un tenant simulado)
// ─────────────────────────────────────────────────────────────────────────────

function leerDispositivos() {
  const ruta = arg("dispositivos");
  if (ruta) {
    const lista = JSON.parse(readFileSync(path.resolve(raiz, String(ruta)), "utf8"));
    if (!Array.isArray(lista) || !lista.length) throw new Error("El archivo de dispositivos debe ser un arreglo no vacío.");
    return lista;
  }
  const { VIM_DEVICE_EMAIL: email, VIM_DEVICE_PASS: pass } = process.env;
  if (!email || !pass) {
    throw new Error("Falta --dispositivos <archivo.json> o VIM_DEVICE_EMAIL + VIM_DEVICE_PASS.");
  }
  return [{ etiqueta: "device-env", email, pass }];
}

/** Device sign-in contra el GoTrue de la nube — el mismo camino que la caja real. */
async function firmar(disp) {
  const res = await fetch(`${cloudUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: disp.email, password: disp.pass }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!cuerpo.access_token) {
    throw new Error(`login de ${disp.etiqueta ?? disp.email} falló: ${JSON.stringify(cuerpo).slice(0, 160)}`);
  }
  const claims = JSON.parse(atob(cuerpo.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  if (claims.tipo_identidad !== "DISPOSITIVO") {
    throw new Error(`${disp.etiqueta ?? disp.email} no es una cuenta de DISPOSITIVO (sync-push la rechazaría con 403).`);
  }
  return { ...disp, token: cuerpo.access_token, tenant: claims.tenant_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Una petición
// ─────────────────────────────────────────────────────────────────────────────

const ventasPorPush = arg("ventas") ? num("ventas") : null;
const idsCreados = new Set();

async function pedir(disp, cual) {
  const esPush = cual === "push";
  let cuerpoEnviado = "{}";
  if (esPush) {
    const snapshot = clonarSnapshot(plantilla.snapshot, {
      ventasObjetivo: ventasPorPush,
      prefijoCorrida: disp.prefijo,
    });
    for (const t of snapshot.tickets ?? []) idsCreados.add(t.id);
    cuerpoEnviado = JSON.stringify({ snapshot });
  }

  const t0 = performance.now();
  let estado = 0;
  let filasRechazadas = 0;
  let error = null;
  try {
    const res = await fetch(`${cloudUrl}/functions/v1/sync-${cual}`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${disp.token}`, "Content-Type": "application/json" },
      body: cuerpoEnviado,
    });
    estado = res.status;
    const cuerpo = await res.json().catch(() => ({}));
    if (esPush) filasRechazadas = (cuerpo?.resultado?._errores ?? []).length;
    if (!res.ok) error = `HTTP ${res.status}: ${JSON.stringify(cuerpo).slice(0, 140)}`;
    // Una fila rechazada no es un fallo de capacidad, pero si son TODAS, la prueba está
    // midiendo el camino de error y el número resultante no vale nada. Se avisa fuerte.
    else if (esPush && filasRechazadas > 0) error = `${filasRechazadas} fila(s) rechazadas`;
  } catch (e) {
    error = e.message;
  }
  return {
    ms: performance.now() - t0,
    estado,
    bytes: Buffer.byteLength(cuerpoEnviado),
    filasRechazadas,
    error,
    ok: estado >= 200 && estado < 300 && filasRechazadas === 0,
  };
}

function cualEndpoint() {
  if (endpoint === "mixto") return Math.random() < 1 / SYNC_PULL_CADA ? "pull" : "push";
  return endpoint;
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas
// ─────────────────────────────────────────────────────────────────────────────

function percentil(ordenados, p) {
  if (!ordenados.length) return 0;
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[i];
}

function resumir(muestras, segundos) {
  const ms = muestras.map((m) => m.ms).sort((a, b) => a - b);
  const fallidas = muestras.filter((m) => !m.ok);
  const estados = {};
  for (const m of muestras) estados[m.estado || "red"] = (estados[m.estado || "red"] ?? 0) + 1;
  return {
    peticiones: muestras.length,
    rps: +(muestras.length / segundos).toFixed(2),
    p50: Math.round(percentil(ms, 50)),
    p90: Math.round(percentil(ms, 90)),
    p95: Math.round(percentil(ms, 95)),
    p99: Math.round(percentil(ms, 99)),
    max: Math.round(ms.at(-1) ?? 0),
    errorPct: +((fallidas.length / Math.max(1, muestras.length)) * 100).toFixed(2),
    filasRechazadas: muestras.reduce((a, m) => a + m.filasRechazadas, 0),
    kbPorPeticion: +(muestras.reduce((a, m) => a + m.bytes, 0) / Math.max(1, muestras.length) / 1024).toFixed(1),
    estados,
    primerError: fallidas[0]?.error ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Motores de carga
// ─────────────────────────────────────────────────────────────────────────────

/** Mantiene `concurrencia` peticiones en vuelo durante `segundos`. */
async function escalon(dispositivos, concurrencia, segundos) {
  const muestras = [];
  const hasta = Date.now() + segundos * 1000;
  let siguiente = 0;
  const t0 = performance.now();

  const trabajador = async () => {
    while (Date.now() < hasta) {
      const disp = dispositivos[siguiente++ % dispositivos.length];
      muestras.push(await pedir(disp, cualEndpoint()));
    }
  };
  await Promise.all(Array.from({ length: concurrencia }, trabajador));
  return resumir(muestras, (performance.now() - t0) / 1000);
}

/**
 * Rampa: sube la concurrencia hasta que se degrada. Es lo que contesta la pregunta original —
 * el techo no es un número que se elija, es donde la p95 o los errores se disparan.
 */
async function correrRampa(dispositivos) {
  const escalones = [];
  console.log(`\nRampa · ${duracionSeg}s por escalón · corta si p95 > ${umbralP95}ms o errores > ${umbralError}%\n`);
  console.log("  conc   req/s     p50     p95     p99     max   error%   KB/req");
  console.log("  ────────────────────────────────────────────────────────────────");

  for (const conc of [1, 2, 4, 8, 16, 32, 64, 128]) {
    const r = await escalon(dispositivos, conc, duracionSeg);
    escalones.push({ concurrencia: conc, ...r });
    console.log(
      `  ${String(conc).padStart(4)}  ${String(r.rps).padStart(6)}  ${String(r.p50).padStart(6)}  ` +
      `${String(r.p95).padStart(6)}  ${String(r.p99).padStart(6)}  ${String(r.max).padStart(6)}  ` +
      `${String(r.errorPct).padStart(6)}   ${String(r.kbPorPeticion).padStart(6)}`);

    if (r.errorPct > umbralError || r.p95 > umbralP95) {
      console.log(`\n  ↑ se degradó en concurrencia ${conc}` +
        (r.primerError ? ` — primer error: ${r.primerError}` : ""));
      break;
    }
  }
  return escalones;
}

/**
 * Realista: N tenants con su ritmo de verdad (un push cada 10 min por dispositivo, pull 1 de
 * cada 6), acelerado. Sirve para lo que la rampa no ve: si el sistema aguanta el goteo de
 * muchos clientes durante un rato largo, no solo una ráfaga corta.
 */
async function correrRealista(dispositivos) {
  const tenants = num("tenants", dispositivos.length);
  const porTenant = num("dispositivos-por-tenant", 1);
  const acelerar = num("acelerar", 60);
  const periodoMs = SYNC_CADA_MS / acelerar;
  const total = tenants * porTenant;

  console.log(`\nRealista · ${tenants} tenants × ${porTenant} dispositivo(s) = ${total} cajas`);
  console.log(`  ciclo real 10 min → ${(periodoMs / 1000).toFixed(1)}s aquí (×${acelerar}) · ${duracionSeg}s de reloj`);
  console.log(`  ≈ ${((duracionSeg * 1000 / periodoMs)).toFixed(1)} ciclos por caja\n`);

  // Un dispositivo = un tenant real en la base. Si se simulan más tenants que credenciales hay,
  // TODAS las ventas caen en el mismo tenant: los índices de ese tenant sufren más de lo que
  // sufrirían repartidas, y el número sale pesimista. Sirve para una primera lectura, pero el
  // dato bueno pide una credencial de dispositivo por tenant simulado.
  if (tenants > dispositivos.length) {
    console.log(`  ⚠ ${tenants} tenants simulados con solo ${dispositivos.length} credencial(es): todo cae en el mismo`);
    console.log(`    tenant. Para el número definitivo, provisiona un dispositivo por tenant en staging.\n`);
  }

  const muestras = [];
  const hasta = Date.now() + duracionSeg * 1000;
  const t0 = performance.now();

  // Cada caja arranca desfasada al azar dentro del periodo: es lo que pasa de verdad, porque el
  // reloj del ciclo empieza cuando la caja se enciende, no en punto. Sin este desfase la prueba
  // inventaría un pico simultáneo que la realidad no tiene.
  const caja = async (i) => {
    await new Promise((r) => setTimeout(r, Math.random() * periodoMs));
    let ciclo = 0;
    while (Date.now() < hasta) {
      const disp = dispositivos[i % dispositivos.length];
      const cual = endpoint === "mixto"
        ? (ciclo % SYNC_PULL_CADA === 0 ? "pull" : "push")
        : endpoint;
      muestras.push(await pedir(disp, cual));
      ciclo++;
      await new Promise((r) => setTimeout(r, periodoMs));
    }
  };
  await Promise.all(Array.from({ length: total }, (_, i) => caja(i)));

  const r = resumir(muestras, (performance.now() - t0) / 1000);
  console.log(`  ${r.peticiones} peticiones · ${r.rps} req/s · p50 ${r.p50}ms · p95 ${r.p95}ms · errores ${r.errorPct}%`);
  return [{ concurrencia: `realista:${tenants}×${porTenant}`, ...r }];
}

// ─────────────────────────────────────────────────────────────────────────────
// De req/s medidos a tenants soportados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La traducción que interesa. Un dispositivo genera 6 push/h y 1 pull/h. Pero los clientes no
 * están repartidos parejo: los restaurantes pican a la misma hora, así que la capacidad se
 * divide entre un factor de pico. 3 es una regla conservadora para comida (comida + cena).
 */
function estimarTenants(mejor, { dispositivosPorTenant = 1, factorPico = 3 } = {}) {
  const porHoraPorDispositivo = (60 / 10) + (60 / 10 / SYNC_PULL_CADA); // 6 push + 1 pull
  const rpsPorTenant = (porHoraPorDispositivo * dispositivosPorTenant) / 3600;
  return {
    rpsSostenible: mejor.rps,
    rpsPorTenant: +rpsPorTenant.toFixed(5),
    tenantsPlano: Math.floor(mejor.rps / rpsPorTenant),
    tenantsConPico: Math.floor(mejor.rps / rpsPorTenant / factorPico),
    factorPico,
    dispositivosPorTenant,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Limpieza
// ─────────────────────────────────────────────────────────────────────────────

function escribirLimpieza(tenant, ruta) {
  const sql = `-- Limpieza de la prueba de carga (${new Date().toISOString()})
-- Borra SOLO las ventas sintéticas: las marca el día contable ${diaContable}, que ningún
-- reporte real usa. Córrelo con psql o el SQL editor del proyecto de STAGING.
--
-- Revisa primero cuánto vas a borrar:
--   SELECT count(*) FROM tickets WHERE tenant_id = '${tenant}' AND dia_contable = '${diaContable}';

BEGIN;

CREATE TEMP TABLE _basura AS
  SELECT id FROM tickets WHERE tenant_id = '${tenant}' AND dia_contable = '${diaContable}';

DELETE FROM ticket_item_modificadores
 WHERE ticket_item_id IN (SELECT id FROM ticket_items WHERE ticket_id IN (SELECT id FROM _basura));
DELETE FROM ticket_items          WHERE ticket_id IN (SELECT id FROM _basura);
DELETE FROM pagos                 WHERE ticket_id IN (SELECT id FROM _basura);
DELETE FROM delivery_asignaciones WHERE ticket_id IN (SELECT id FROM _basura);
DELETE FROM tickets_cfdi          WHERE ticket_id IN (SELECT id FROM _basura);
DELETE FROM tickets               WHERE id IN (SELECT id FROM _basura);

COMMIT;
`;
  writeFileSync(ruta, sql, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

try {
  const dispositivos = [];
  for (const [i, d] of leerDispositivos().entries()) {
    const firmado = await firmar(d);
    // Prefijo de folio por dispositivo: dos tenants simulados no pueden pisarse el folio.
    firmado.prefijo = `CG${randomUUID().slice(0, 4).toUpperCase()}${String(i).padStart(2, "0")}`;
    dispositivos.push(firmado);
  }
  console.log(`· ${dispositivos.length} dispositivo(s) autenticado(s) contra ${cloudUrl}`);

  const tenants = new Set(dispositivos.map((d) => d.tenant));
  console.log(`· ${tenants.size} tenant(s) distinto(s): ${[...tenants].map((t) => t.slice(0, 8)).join(", ")}`);

  if (plantilla) {
    // `_vim_apply_rows` filtra con `WHERE tenant_id = <tenant del JWT>`: si la plantilla es de
    // otro tenant, TODAS las filas se descartan en silencio y la prueba mediría una RPC vacía.
    const ajenos = [...tenants].filter((t) => t !== plantilla.tenant_id);
    if (ajenos.length) {
      console.error(`\n❌ La plantilla es del tenant ${plantilla.tenant_id} pero hay dispositivos de otro(s): ${ajenos.join(", ")}.`);
      console.error("   sync_push_snapshot filtra por el tenant del JWT → se descartaría todo y el número saldría falso.");
      console.error("   Captura una plantilla del mismo tenant, o usa dispositivos de ese tenant.\n");
      process.exit(1);
    }
    const kb = (plantilla.bytes / 1024).toFixed(1);
    console.log(`· plantilla: ${plantilla.resumen.tickets ?? 0} ventas · ${kb} KB` +
      (ventasPorPush ? ` → se escalará a ${ventasPorPush} ventas por push` : ""));
  }
  if (endpoint !== "pull") console.log(`· las ventas de prueba se sellan con dia_contable = ${diaContable}`);

  const escalones = modo === "realista"
    ? await correrRealista(dispositivos)
    : modo === "sostenido"
      ? [{ concurrencia: num("concurrencia", 8), ...(await escalon(dispositivos, num("concurrencia", 8), duracionSeg)) }]
      : await correrRampa(dispositivos);

  // El mejor escalón: el de más throughput que aún cumplía los umbrales.
  const sanos = escalones.filter((e) => e.errorPct <= umbralError && e.p95 <= umbralP95);
  const mejor = sanos.sort((a, b) => b.rps - a.rps)[0] ?? escalones[0];
  const est = estimarTenants(mejor, { dispositivosPorTenant: num("dispositivos-por-tenant", 1) });

  console.log("\n─── Lectura ────────────────────────────────────────────────────");
  if (!sanos.length) {
    console.log("  Ningún escalón cumplió los umbrales: la nube ya va justa con 1 petición a la vez.");
  } else {
    console.log(`  Capacidad sostenible medida:   ${est.rpsSostenible} peticiones/s (${endpoint})`);
    console.log(`  Consumo de un tenant:          ${est.rpsPorTenant} req/s (${est.dispositivosPorTenant} disp. × 6 push + 1 pull por hora)`);
    console.log(`  Tenants si el tráfico fuera plano:  ~${est.tenantsPlano}`);
    console.log(`  Tenants contando el pico (÷${est.factorPico}):     ~${est.tenantsConPico}   ← el número que sirve`);
  }
  console.log("\n  Ojo: esto mide SOLO el sync. Falta sumarle el timbrado de CFDI, las lecturas");
  console.log("  del panel y los límites que no son de CPU (conexiones, IOPS, egress).");
  console.log("────────────────────────────────────────────────────────────────\n");

  const salida = path.resolve(raiz, String(arg("salida", path.join("resultados", `carga-${Date.now()}.json`))));
  if (!existsSync(path.dirname(salida))) mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, JSON.stringify({
    corrida: new Date().toISOString(),
    destino: cloudUrl,
    modo, endpoint, duracionSeg, diaContable,
    plantilla: plantilla ? { origen: plantilla.origen, resumen: plantilla.resumen, bytes: plantilla.bytes } : null,
    ventasPorPush,
    escalones,
    estimacion: est,
  }, null, 2), "utf8");
  console.log(`Resultados → ${path.relative(raiz, salida)}`);

  if (idsCreados.size) {
    const limpieza = salida.replace(/\.json$/, "-limpieza.sql");
    escribirLimpieza([...tenants][0], limpieza);
    console.log(`Limpieza  → ${path.relative(raiz, limpieza)}  (${idsCreados.size} ventas falsas que BORRAR)`);
  }
} catch (e) {
  console.error("\n❌ La prueba de carga falló:", e.message);
  process.exitCode = 1;
}
