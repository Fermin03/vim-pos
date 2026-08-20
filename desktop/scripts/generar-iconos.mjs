// Genera los iconos de la app a partir de un logo maestro (SVG o PNG).
//
// Salidas:
//   build/icon.png (1024) → icono de la ventana y de la barra de tareas
//   build/tray.png (32)   → icono de la bandeja del sistema
//
// Uso:  npm run iconos
//       VIM_ICONO=ruta/al/logo.svg npm run iconos     ← para el logo definitivo
//
// Se intentó primero rasterizar con el propio Electron para no sumar dependencias, pero en esta
// máquina `app.whenReady()` no resuelve sin sesión gráfica y el script se colgaba. `sharp` trae
// binarios precompilados y hace el trabajo sin depender de una pantalla.
// `sharp` NO está en las dependencias: se instala solo cuando hay que regenerar iconos, y
// SIEMPRE con npm —este proyecto usa npm, no pnpm—. Instalarlo con pnpm aquí contamina el
// workspace de la raíz, reordena sus dependencias y deja rutas por encima del límite de 260
// caracteres de Windows, que rompe el instalador con un error que no menciona nada de esto.
//
//     npm i -D sharp && npm run iconos && npm rm sharp
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAESTRO = process.env.VIM_ICONO ?? path.join(raiz, "..", "apps", "admin", "public", "icon.svg");
if (!existsSync(MAESTRO)) {
  console.error(`No encuentro el logo maestro: ${MAESTRO}`);
  process.exit(1);
}

mkdirSync(path.join(raiz, "build"), { recursive: true });
const fuente = readFileSync(MAESTRO);

// `density` alto antes de escalar: sin esto un SVG se rasteriza a 72 dpi y luego se amplía, y
// los bordes del logo salen dentados justo en el tamaño grande, que es el que se ve en el
// instalador y en el escritorio.
const png = async (lado) =>
  sharp(fuente, { density: 400 })
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

for (const [archivo, lado] of [["icon.png", 1024], ["tray.png", 32]]) {
  const buf = await png(lado);
  const destino = path.join(raiz, "build", archivo);
  writeFileSync(destino, buf);
  const meta = await sharp(buf).metadata();
  console.log(`· build/${archivo.padEnd(9)} ${meta.width}x${meta.height}  ${buf.length} bytes`);
}
// NO se genera .ico: electron-builder lo deriva solo de build/icon.png, y lo hace en el formato
// clásico que NSIS entiende. Un ICO armado a mano con PNGs dentro es válido para Windows pero
// una fuente de problemas para el instalador, y no vale la pena mantenerlo.


console.log(`\nMaestro: ${path.relative(path.join(raiz, ".."), MAESTRO)}`);
