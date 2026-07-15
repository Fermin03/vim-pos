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
import { mkdirSync } from "node:fs";
import path from "node:path";

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
process.exit(r.status ?? 1);
