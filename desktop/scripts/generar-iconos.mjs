// Genera los iconos de la app a partir de un logo maestro (SVG o PNG).
//
// Salidas:
//   build/icon.png (1024) → icono de la ventana y de la barra de tareas
//   build/icon.ico        → icono del instalador y del desinstalador (Windows)
//   build/tray.png (32)   → icono de la bandeja del sistema
//
// Uso:  npm run iconos
//       VIM_ICONO=ruta/al/logo.svg npm run iconos     ← para el logo definitivo
//
// Se intentó primero rasterizar con el propio Electron para no sumar dependencias, pero en esta
// máquina `app.whenReady()` no resuelve sin sesión gráfica y el script se colgaba. `sharp` trae
// binarios precompilados y hace el trabajo sin depender de una pantalla.
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
// -- .ico para Windows -----------------------------------------------------
// Un ICO puede llevar PNGs dentro tal cual (Vista en adelante), asi que se arma el contenedor a
// mano en vez de sumar otra dependencia solo por el formato. Se incluyen los tamanos que Windows
// pide segun el contexto: 16 en la barra de titulo, 32 en listas, 256 en el escritorio.
const LADOS = [16, 32, 48, 64, 128, 256];
const imgs = await Promise.all(LADOS.map((l) => png(l)));
const CABECERA = 6, ENTRADA = 16;
const dir = Buffer.alloc(CABECERA + ENTRADA * LADOS.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(LADOS.length, 4);
let offset = dir.length;
LADOS.forEach((lado, i) => {
  const e = CABECERA + ENTRADA * i;
  dir.writeUInt8(lado === 256 ? 0 : lado, e);
  dir.writeUInt8(lado === 256 ? 0 : lado, e + 1);
  dir.writeUInt8(0, e + 2);
  dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(imgs[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
const ico = Buffer.concat([dir, ...imgs]);
writeFileSync(path.join(raiz, "build", "icon.ico"), ico);
console.log("· build/icon.ico   " + LADOS.join("/") + "  " + ico.length + " bytes");

console.log(`\nMaestro: ${path.relative(path.join(raiz, ".."), MAESTRO)}`);
