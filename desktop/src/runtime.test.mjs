import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { comprobarBinarioPostgrest, explicarFalloDeSpawn } from "./runtime.mjs";

// Contexto: las 0.4.60–0.4.62 salieron sin resources/bin/postgrest.exe. La caja hacía spawn de un
// archivo inexistente (pid undefined), esperaba los 60 s del readiness y moría con "PostgREST no
// respondió", que señalaba a PostgREST y no al paquete. Estas pruebas fijan que el error diga qué
// archivo falta, dónde, y qué hacer — al instante.

test("comprobarBinarioPostgrest: si el .exe no existe, lanza diciendo la ruta y que se reinstale", () => {
  const ruta = path.join(tmpdir(), "no-existe", "postgrest.exe");
  assert.throws(() => comprobarBinarioPostgrest(ruta), (e) => {
    assert.ok(e instanceof Error);
    assert.match(e.message, /Falta el binario de PostgREST en /);
    assert.ok(e.message.includes(ruta), "la ruta exacta va en el mensaje");
    assert.match(e.message, /instalador quedó incompleto/);
    assert.match(e.message, /Reinstala VIM POS/);
    return true;
  });
});

test("comprobarBinarioPostgrest: si el .exe existe, no hace nada", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vim-postgrest-"));
  const ruta = path.join(dir, "postgrest.exe");
  writeFileSync(ruta, "MZ");
  try {
    assert.doesNotThrow(() => comprobarBinarioPostgrest(ruta));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("explicarFalloDeSpawn: ENOENT dice que el archivo no existe, con la ruta", () => {
  const msg = explicarFalloDeSpawn({ code: "ENOENT", message: "spawn x ENOENT" }, "C:\\app\\bin\\postgrest.exe");
  assert.match(msg, /no existe/);
  assert.ok(msg.includes("C:\\app\\bin\\postgrest.exe"));
});

test("explicarFalloDeSpawn: EACCES/EPERM apunta a permisos o antivirus, y cualquier otro código conserva el mensaje original", () => {
  assert.match(explicarFalloDeSpawn({ code: "EACCES", message: "spawn x EACCES" }, "x"), /permisos|antivirus/);
  assert.match(explicarFalloDeSpawn({ code: "EPERM", message: "spawn x EPERM" }, "x"), /permisos|antivirus/);
  const otro = explicarFalloDeSpawn({ code: "EBUSY", message: "spawn x EBUSY" }, "x");
  assert.match(otro, /EBUSY/);
});

// En Windows un segundo servidor puede enlazar un puerto que ya tiene dueño (Warp pone
// SO_REUSEADDR) y no recibe nada: las peticiones se las queda el primero. Por eso el arranque
// pregunta antes si el puerto de PostgREST está tomado.
test("puertoOcupado: sí cuando alguien escucha ahí, no cuando está libre", async () => {
  const { puertoLibre, puertoOcupado } = await import("./puerto-libre.mjs");
  const net = await import("node:net");
  const puerto = await puertoLibre();
  assert.equal(await puertoOcupado(puerto), false);
  const servidor = net.createServer();
  await new Promise((r) => servidor.listen(puerto, "127.0.0.1", r));
  try {
    assert.equal(await puertoOcupado(puerto), true);
  } finally {
    await new Promise((r) => servidor.close(r));
  }
  assert.equal(await puertoOcupado(puerto), false, "y lo suelta: preguntar no deja el puerto tomado");
});
