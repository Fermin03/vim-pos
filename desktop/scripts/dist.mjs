// Construye el instalador NSIS con las cachés fuera de la zona cifrada.
//
// Por qué existe este wrapper: en esta máquina C:\Users\<user>\AppData está marcada con EFS
// (cifrado de Windows) y sus subcarpetas lo heredan, incluidas las cachés que electron-builder
// usa por defecto. Windows no puede copiar un archivo cifrado a una carpeta que no lo está, así
// que el build moría al copiar nsis/elevate.exe con un "UNKNOWN: copyfile" que no dice nada.
// Síntoma gemelo: renombrados que fallan con "cannot move to a different disk drive" entre rutas
// que están las dos en C:.
//
// Con las cachés en una ruta sin cifrar, los binarios se descargan/copian limpios y el build pasa.
// Si algún día cambias de máquina, VIM_BUILD_CACHE permite mover esta ruta sin tocar el script.

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dependenciasFaltantes, nodeModulesEsEnlace } from "../src/revisar-dependencias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const recursos = pkg.build?.extraResources ?? [];

// Guardarraíl (0.4.63) — comprobar los extraResources ANTES y DESPUÉS de empaquetar.
//
// Qué salió mal: `bin/postgrest.exe` pesa 69 MB y está en .gitignore, así que vive SOLO en el
// checkout donde se descargó a mano. Las versiones 0.4.60–0.4.62 se construyeron desde otro
// worktree (vim-pos-platform), donde ese archivo no existe — y electron-builder no protesta por
// un extraResources que falta: empaqueta sin él y termina con éxito. El resultado fueron tres
// instaladores sin PostgREST: la caja arrancaba Postgres, lanzaba un spawn de un .exe inexistente
// (pid undefined), esperaba 60 s y moría con "PostgREST no respondió", que apuntaba al sitio
// equivocado. Knock-Out se quedó sin caja y no podía ni auto-actualizarse (el updater corre
// DESPUÉS del backend, que nunca arrancaba).
//
// De todo lo que se empaqueta, ese binario es el único recurso que ni está versionado ni lo
// regenera ningún script: pos-ui/kds-ui los rehace `npm run dist` y pg-bin viene de npm install.
// Por eso fue el único que se perdió, y por eso el chequeo se hace sobre la lista completa: si
// mañana se añade otro recurso frágil, queda cubierto sin tocar nada.
function revisar(etapa, base, campo) {
  const faltan = recursos
    .map((r) => (typeof r === "string" ? { from: r, to: r } : r))
    .filter((r) => !existsSync(path.resolve(base, r[campo])));
  if (!faltan.length) return;
  console.error(`\n✖ ${etapa}: faltan recursos que el instalador necesita:\n`);
  for (const r of faltan) console.error(`   · ${r[campo]}`);
  console.error(
    "\nNo se publica un instalador incompleto. `bin/postgrest.exe` (69 MB) está en .gitignore:\n" +
    "cópialo desde un checkout que lo tenga, o vuelve a descargarlo, y repite el build.\n",
  );
  process.exit(1);
}

revisar("antes de empaquetar", root, "from");

// Guardarraíl (0.4.109) — las dependencias de la app (`pg`, `jsonwebtoken`, `embedded-postgres`)
// no son extraResources: viajan en `resources/app/node_modules`, y el chequeo de arriba no las ve.
// La 0.4.109 salió primero sin ellas porque `node_modules` era un junction que electron-builder
// no siguió. Ver src/revisar-dependencias.mjs.
function revisarDependencias(etapa, base, consejo) {
  const faltan = dependenciasFaltantes(pkg, base);
  if (!faltan.length) return;
  console.error(`\n✖ ${etapa}: faltan dependencias de la app:\n`);
  for (const d of faltan) console.error(`   · ${d}`);
  console.error(`\n${consejo}\n`);
  process.exit(1);
}

if (nodeModulesEsEnlace(root)) {
  console.error(
    "\n✖ antes de empaquetar: desktop/node_modules es un enlace (symlink o junction).\n" +
    "electron-builder no lo sigue y el instalador sale sin dependencias: la caja no arranca.\n" +
    "Copia la carpeta de verdad (robocopy <origen> desktop\\node_modules /E) o corre `npm install`.\n",
  );
  process.exit(1);
}
revisarDependencias("antes de empaquetar", root, "Corre `npm install` dentro de desktop/ y repite el build.");

const cache = process.env.VIM_BUILD_CACHE || "D:/vim-build-cache";
const builder = path.join(cache, "builder");
const electron = path.join(cache, "electron");
mkdirSync(builder, { recursive: true });
mkdirSync(electron, { recursive: true });

console.log(`Cachés de build (sin cifrar): ${cache}`);

const r = spawnSync("npx", ["electron-builder", "--win", "nsis"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ELECTRON_BUILDER_CACHE: builder, ELECTRON_CACHE: electron },
});
if (r.status !== 0) process.exit(r.status ?? 1);

// Y comprobar el resultado: que estuviera en el origen no prueba que llegara al paquete.
revisar("el paquete quedó incompleto", path.join(root, "dist", "win-unpacked", "resources"), "to");
console.log("✔ extraResources completos en dist/win-unpacked/resources");
revisarDependencias(
  "el paquete quedó sin dependencias",
  path.join(root, "dist", "win-unpacked", "resources", "app"),
  "No se publica este instalador: la caja no arrancaría. Revisa desktop/node_modules y repite el build.",
);
console.log("✔ dependencias de la app completas en dist/win-unpacked/resources/app");
