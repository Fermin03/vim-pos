// Borra los despliegues viejos de un proyecto de Vercel, en lote y con red de seguridad.
//
// Existe porque en Vercel **cada despliegue sigue vivo en su propia URL**, sirviendo el sitio tal
// como estaba ese día. Cuando algo tiene que dejar de publicarse —el caso real: el nombre legal, el
// RFC, el domicilio particular y el móvil del dueño, que salieron del código el 6 de septiembre de
// 2026— quitarlo de `main` no toca ninguno de los anteriores. Había 107 del sitio, y el panel de
// Vercel no borra en lote: es de uno en uno, a mano.
//
// Uso:  node scripts/borrar-despliegues-vercel.mjs --proyecto=sitio-web              (solo LISTA)
//       node scripts/borrar-despliegues-vercel.mjs --proyecto=sitio-web --borrar     (borra)
//       node scripts/borrar-despliegues-vercel.mjs --proyecto=pos --antes-de=2026-08-01
//
// Sin `--borrar` no borra nada: imprime cuántos son, los cinco más nuevos y el más viejo, para
// comprobar que el corte cae donde se cree antes de hacer algo irreversible.
//
// Autenticación: se lee de la sesión que deja `vercel login` en disco, o de VERCEL_TOKEN. No se
// escribe ningún token aquí ni se pide por ningún lado.
//
// LO QUE NUNCA TOCA:
//   · el despliegue que sirve producción ahora mismo — se le PREGUNTA a la API cuál es, no se
//     deduce por fecha, porque equivocarse ahí tumba el sitio;
//   · nada posterior al corte, para que sigan existiendo destinos de «Instant Rollback».
//
// Limitaciones honestas: borrar un despliegue es irreversible y se lleva la posibilidad de hacer
// rollback a ese punto — de ahí que el corte por defecto respete todo lo reciente. No toca el
// historial de git, ni las cachés de terceros, ni nada fuera de Vercel. Y no distingue si un
// despliegue realmente contenía el dato: borra por fecha, que es lo único que la API ofrece barato.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// El corte por defecto: el merge que sacó los datos personales del sitio
// (80629de, 6 sep 2026 23:54:35 -0600). Todo lo desplegado ANTES los lleva dentro.
const CORTE_POR_DEFECTO = "2026-09-07T05:54:35Z";

const ARGS = process.argv.slice(2);
const opcion = (nombre) => ARGS.find((a) => a.startsWith(`--${nombre}=`))?.split("=")[1];

const BORRAR = ARGS.includes("--borrar");
const PROYECTO = opcion("proyecto");
const CORTE = new Date(opcion("antes-de") ?? CORTE_POR_DEFECTO).getTime();

if (Number.isNaN(CORTE)) {
  console.error(`--antes-de no es una fecha que pueda leer: "${opcion("antes-de")}"`);
  process.exit(1);
}

// ── El token ────────────────────────────────────────────────────────────────
// Dónde deja la sesión el CLI, según versión y sistema. La primera es la buena en el Windows de
// esta máquina: el CLI mete un `xdg.data` dentro de %APPDATA%, imitando la convención de Linux, y
// NO está en `%APPDATA%\com.vercel.cli\` ni en `~/.vercel/`, que son las dos que todo el mundo
// documenta. Buscarla ahí cuesta un rato.
function token() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;

  const candidatos = [
    process.env.APPDATA && join(process.env.APPDATA, "xdg.data", "com.vercel.cli", "auth.json"),
    process.env.APPDATA && join(process.env.APPDATA, "com.vercel.cli", "auth.json"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "com.vercel.cli", "auth.json"),
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
    join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
    join(homedir(), ".vercel", "auth.json"),
  ].filter(Boolean);

  for (const f of candidatos) {
    try {
      const t = JSON.parse(readFileSync(f, "utf8")).token;
      if (t) return t;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

const TOKEN = token();
if (!TOKEN) {
  console.error(
    "No hay con qué autenticarse.\n\n" +
      "Haz una de las dos y vuelve a correr esto:\n" +
      "  npx vercel@latest login      (abre el navegador; deja la sesión en disco)\n" +
      "  set VERCEL_TOKEN=...         (token de vercel.com/account/tokens)\n",
  );
  process.exit(1);
}

// El equipo sale del enlace que ya vive en el repo, para no tener dos sitios donde mantenerlo.
const EQUIPO = JSON.parse(readFileSync(join(RAIZ, ".vercel", "project.json"), "utf8")).orgId;

// ── La API ──────────────────────────────────────────────────────────────────
async function api(ruta, opciones = {}) {
  const union = ruta.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${ruta}${union}teamId=${EQUIPO}`;

  for (let intento = 1; intento <= 5; intento++) {
    const r = await fetch(url, {
      ...opciones,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(opciones.headers ?? {}) },
    });

    // La API limita el ritmo, y con cientos de borrados chocar con el límite es lo normal, no la
    // excepción. Se espera lo que ella misma pide y se reintenta.
    if (r.status === 429) {
      const espera = Number(r.headers.get("retry-after") || 5);
      console.log(`   (límite de ritmo; esperando ${espera}s)`);
      await new Promise((s) => setTimeout(s, espera * 1000));
      continue;
    }
    if (!r.ok) {
      throw new Error(`${opciones.method ?? "GET"} ${ruta} → ${r.status} ${await r.text()}`);
    }
    return r.status === 204 ? null : r.json();
  }
  throw new Error(`${ruta}: cinco intentos y sigue limitando el ritmo`);
}

// ── Elegir proyecto ─────────────────────────────────────────────────────────
const { projects } = await api("/v9/projects?limit=100");
const proyecto = projects.find((p) => p.name === PROYECTO);

if (!proyecto) {
  console.error(
    (PROYECTO ? `No hay ningún proyecto llamado "${PROYECTO}".\n` : "Falta --proyecto=NOMBRE.\n") +
      `\nLos de esta cuenta: ${projects.map((p) => p.name).join(", ")}\n` +
      "\nEl del sitio público es `sitio-web` (Root Directory `sitio-web`, ver sitio-web/DESPLIEGUE.md).\n",
  );
  process.exit(1);
}

// El de producción se PREGUNTA, no se deduce: es el único que no se puede tocar.
const detalle = await api(`/v9/projects/${proyecto.id}`);
const enProduccion = detalle.targets?.production?.id ?? null;

console.log(`\nProyecto: ${proyecto.name}  (${proyecto.id})`);
console.log(`Sirviendo producción ahora: ${enProduccion ?? "—"}  ← intocable`);
console.log(`Corte: ${new Date(CORTE).toISOString()}\n`);

// ── Listar ──────────────────────────────────────────────────────────────────
const todos = [];
let hasta;
for (;;) {
  const ruta = `/v6/deployments?projectId=${proyecto.id}&limit=100${hasta ? `&until=${hasta}` : ""}`;
  const { deployments, pagination } = await api(ruta);
  todos.push(...deployments);
  if (!pagination?.next) break;
  hasta = pagination.next;
}

const viejos = todos.filter((d) => d.created < CORTE && d.uid !== enProduccion);

console.log(`Despliegues en total: ${todos.length}`);
console.log(`  · posteriores al corte, o el de producción — SE QUEDAN: ${todos.length - viejos.length}`);
console.log(`  · anteriores al corte — A BORRAR: ${viejos.length}\n`);

if (viejos.length === 0) {
  console.log("No queda ninguno anterior al corte. Nada que hacer.");
  process.exit(0);
}

const fecha = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
console.log("Los más nuevos de los que se van (para comprobar que el corte cae donde crees):");
for (const d of viejos.slice(0, 5)) {
  console.log(`  ${fecha(d.created)}  ${d.uid}  ${d.target ?? "preview"}  ${d.url}`);
}
const ultimo = viejos[viejos.length - 1];
console.log("Y el más viejo:");
console.log(`  ${fecha(ultimo.created)}  ${ultimo.uid}  ${ultimo.target ?? "preview"}  ${ultimo.url}\n`);

if (!BORRAR) {
  console.log("Esto ha sido solo la lista. Para borrarlos de verdad:");
  console.log(`  node scripts/borrar-despliegues-vercel.mjs --proyecto=${proyecto.name} --borrar\n`);
  process.exit(0);
}

// ── Borrar ──────────────────────────────────────────────────────────────────
console.log(`Borrando ${viejos.length}. Es irreversible.\n`);
let hechos = 0;
let fallos = 0;
for (const d of viejos) {
  try {
    await api(`/v13/deployments/${d.uid}`, { method: "DELETE" });
    hechos++;
    if (hechos % 25 === 0 || hechos === viejos.length) console.log(`  ${hechos}/${viejos.length}`);
  } catch (e) {
    fallos++;
    console.error(`  ✖ ${d.uid} (${fecha(d.created)}): ${e.message.slice(0, 120)}`);
  }
}

console.log(`\nBorrados: ${hechos}.  Fallidos: ${fallos}.`);
console.log("Comprueba que el sitio sigue en pie:  curl -I https://vimpos.com.mx/");
