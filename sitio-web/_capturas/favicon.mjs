// Genera /favicon.ico a partir del logo. Google pide para el icono de los
// resultados un archivo rastreable y múltiplo de 48 px, y muchos clientes piden
// /favicon.ico a ciegas sin leer el <link rel="icon"> — recibían el 404.
//
//     node _capturas/favicon.mjs
//
// Un .ico es un contenedor: aquí lleva dos PNG (48 y 32 px), que es lo que
// entienden todos los navegadores desde hace años.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = fs.readFileSync(path.join(RAIZ, "assets/img/logo.svg"));
const lados = [48, 32];
const pngs = await Promise.all(lados.map((l) => sharp(svg, { density: 300 }).resize(l, l).png().toBuffer()));

const cabecera = Buffer.alloc(6);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(pngs.length, 4);
let desplazamiento = 6 + 16 * pngs.length;
const entradas = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(lados[i], 0);
  e.writeUInt8(lados[i], 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(desplazamiento, 12);
  desplazamiento += png.length;
  return e;
});
fs.writeFileSync(path.join(RAIZ, "favicon.ico"), Buffer.concat([cabecera, ...entradas, ...pngs]));
fs.writeFileSync(path.join(RAIZ, "assets/img/favicon-48.png"), pngs[0]);
console.log("favicon.ico", desplazamiento, "bytes");
