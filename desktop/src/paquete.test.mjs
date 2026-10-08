// Lo que el instalador deja fuera (las negaciones de `build.files`) no puede ser algo que la app
// cargue. Un import a un archivo excluido no falla en desarrollo ni en el resto del CI: falla en
// la caja del cliente, al arrancar, con "Cannot find module".
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
const fuera = pkg.build.files.filter((p) => p.startsWith("!")).map((p) => p.slice(1));

/** Todo lo que se alcanza desde `entrada` siguiendo imports relativos (estáticos y `import()`). */
function alcanzables(entrada) {
  const vistos = new Set();
  const andar = (archivo) => {
    if (vistos.has(archivo)) return;
    vistos.add(archivo);
    assert.ok(existsSync(archivo), `import roto: ${path.relative(raiz, archivo)}`);
    for (const m of readFileSync(archivo, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      andar(path.resolve(path.dirname(archivo), m[1]));
    }
  };
  andar(path.join(raiz, entrada));
  return [...vistos].map((f) => path.relative(raiz, f).replaceAll("\\", "/"));
}

test("el instalador no lleva las pruebas ni los verify", () => {
  for (const f of ["src/ui-server.test.mjs", "src/verify-e2e.mjs", "src/verify-sesion.mjs", "src/paquete.test.mjs"]) {
    assert.ok(fuera.some((p) => path.posix.matchesGlob(f, p)), `${f} debería quedar fuera del instalador`);
  }
});

test("nada de lo que la app carga queda fuera del instalador", () => {
  const cargados = alcanzables(pkg.main);
  assert.ok(cargados.length > 20 && cargados.includes("src/ui-server.mjs"), "el recorrido de imports no llegó a ningún lado");
  assert.deepEqual(cargados.filter((f) => fuera.some((p) => path.posix.matchesGlob(f, p))), []);
  // El preload no se importa: Electron lo carga por ruta.
  assert.ok(!fuera.some((p) => path.posix.matchesGlob("src/preload.cjs", p)));
});
