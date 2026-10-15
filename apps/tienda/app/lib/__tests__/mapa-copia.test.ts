// La copia de MapLibre en `public/mapa/<versión>/` (tienda y admin) es, byte por byte, la del paquete
// instalado, y `VERSION_DEL_MAPA` dice esa versión. Si alguien sube la versión y no vuelve a correr
// `node packages/ui/copiar-mapa.mjs`, el mapa cargaría una librería y un worker de versiones
// distintas (o ninguno): esto lo detiene antes.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const raiz = path.resolve(__dirname, "../../../../..");
const req = createRequire(path.join(raiz, "packages", "ui", "package.json"));
const dist = path.dirname(req.resolve("maplibre-gl/dist/maplibre-gl.css"));
const instalada = (JSON.parse(readFileSync(path.join(dist, "..", "package.json"), "utf8")) as { version: string }).version;
const ARCHIVOS = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl.css"];

describe("la copia de MapLibre", () => {
  it("VERSION_DEL_MAPA es la instalada", () => {
    const fuente = readFileSync(path.join(raiz, "packages", "ui", "src", "mapa.tsx"), "utf8");
    expect(/VERSION_DEL_MAPA = "([^"]+)"/.exec(fuente)?.[1]).toBe(instalada);
  });
  for (const app of ["tienda", "admin"]) {
    for (const a of ARCHIVOS) {
      it(`${app}: ${a} es idéntico al del paquete`, () => {
        const copia = readFileSync(path.join(raiz, "apps", app, "public", "mapa", instalada, a));
        expect(copia.equals(readFileSync(path.join(dist, a)))).toBe(true);
      });
    }
  }
});
