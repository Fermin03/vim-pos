// Revisión de las dependencias de la app al empaquetar (la usa scripts/dist.mjs).
//
// Qué salió mal (0.4.109, 2 oct 2026): el primer intento se construyó desde un worktree con
// `desktop/node_modules` como junction al checkout principal. electron-builder no siguió el enlace:
// `resources/app` quedó en 2 MB, sin `pg`, `jsonwebtoken` ni `embedded-postgres`, y el instalador
// salió de 134 MB en vez de ~161. Una caja con ese instalador no arranca. El guardarraíl de los
// extraResources no lo vio porque esas dependencias no son extraResources: viajan en `app/`.
// Lo atrapó solo la regla de no publicar un .exe de menos de ~155 MB.
//
// Por eso se revisan las `dependencies` de package.json en los dos lados: que estén instaladas
// (y no detrás de un enlace) antes de empaquetar, y que hayan llegado a `resources/app` después.
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";

/**
 * Las dependencias de `pkg` que no están instaladas bajo `base/node_modules`. Una carpeta sin su
 * package.json no cuenta: así queda un paquete a medio copiar.
 * @returns {string[]}
 */
export function dependenciasFaltantes(pkg, base) {
  return Object.keys(pkg?.dependencies ?? {}).filter(
    (nombre) => !existsSync(path.join(base, "node_modules", ...nombre.split("/"), "package.json")),
  );
}

/** ¿`base/node_modules` es un enlace (symlink o junction)? electron-builder no lo sigue. */
export function nodeModulesEsEnlace(base) {
  try {
    return lstatSync(path.join(base, "node_modules")).isSymbolicLink();
  } catch {
    return false; // no existe: eso lo reporta dependenciasFaltantes
  }
}
