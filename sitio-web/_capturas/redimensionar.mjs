/* Las capturas salen a 2× de 1440×900 = 2880 px de ancho. El sitio nunca las
   enseña a más de ~1130 px CSS, así que a 2× bastan 2264 — y en el hero y en
   los bloques alternos, la mitad de eso.
   
   1600 px es el punto donde deja de notarse la diferencia en cualquier pantalla
   real y se recorta más de la mitad del peso. Lighthouse marcaba estas imágenes
   como el mayor gasto evitable de la página. */
import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../assets/img/capturas");
const ANCHO = 1600;

const archivos = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
let antes = 0, despues = 0;

for (const f of archivos) {
  const origen = path.join(DIR, f);
  const destino = origen.replace(/\.png$/, ".webp");
  const meta = await sharp(origen).metadata();

  const previo = await stat(destino).then((s) => s.size).catch(() => 0);
  antes += previo;

  await sharp(origen)
    .resize({ width: Math.min(ANCHO, meta.width), withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destino + ".tmp");

  const { rename } = await import("node:fs/promises");
  await rename(destino + ".tmp", destino);

  const ahora = (await stat(destino)).size;
  despues += ahora;
  console.log(`  ${f.replace(".png", "").padEnd(20)} ${meta.width}px → ${Math.min(ANCHO, meta.width)}px   ${Math.round(previo/1024)} KB → ${Math.round(ahora/1024)} KB`);
}
console.log(`\nTotal: ${Math.round(antes/1024)} KB → ${Math.round(despues/1024)} KB`);
