// Copia MapLibre GL JS (la versión fijada en packages/ui/package.json; ahí está solo por sus tipos) a `public/mapa/<versión>/` de
// esas dos apps. Se corre a mano al cambiar de versión:  node packages/ui/copiar-mapa.mjs
//
// Por qué copiado y no empaquetado: MapLibre 6 arranca su web worker como MÓDULO desde una dirección
// del mismo origen (`maplibre-gl-worker.mjs`, que importa `maplibre-gl-shared.mjs` a su lado). Si el
// empaquetador de Next metiera la librería en sus trozos, esa dirección no existiría y habría que
// abrir la CSP a `worker-src blob:`. Servidos tal cual desde `public/`, el mapa y su worker salen del
// mismo origen (la CSP no cambia para ellos), se descargan solo cuando se abre un mapa y el
// navegador guarda una sola copia de la parte compartida. La prueba `mapa-copia.test.ts` (tienda)
// falla si la copia y la versión instalada no son la misma.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ARCHIVOS = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"];

const req = createRequire(path.join(raiz, "packages", "ui", "package.json"));
const dist = path.dirname(req.resolve("maplibre-gl/dist/maplibre-gl.css"));
const { version } = JSON.parse(readFileSync(path.join(dist, "..", "package.json"), "utf8"));
for (const app of ["tienda", "admin"]) {
  const destino = path.join(raiz, "apps", app, "public", "mapa", version);
  mkdirSync(destino, { recursive: true });
  for (const a of ARCHIVOS) copyFileSync(path.join(dist, a), path.join(destino, a));
  console.log(`${app}: maplibre-gl ${version} → ${path.relative(raiz, destino)}`);
}
