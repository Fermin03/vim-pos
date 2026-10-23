// Pasa cada folleto HTML a PDF de dos caras (para imprenta, con rebase) y a un PNG por cara.
// Uso: node render.mjs   (si playwright es global: NODE_PATH=$(npm root -g) node render.mjs)
import { createRequire } from "node:module";
import { readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const aqui = dirname(fileURLToPath(import.meta.url));
const salida = join(aqui, "salida");
mkdirSync(salida, { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage({
  // 285.4 x 221.9 mm a 96 ppp
  viewport: { width: 1079, height: 839 },
  deviceScaleFactor: 3,
});

for (const archivo of readdirSync(aqui).filter((f) => f.endsWith(".html"))) {
  const nombre = archivo.replace(/\.html$/, "");
  await pagina.goto("file://" + join(aqui, archivo));
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.pdf({
    path: join(salida, `${nombre}.pdf`),
    width: "285.4mm",
    height: "221.9mm",
    printBackground: true,
    preferCSSPageSize: true,
  });
  for (const cara of ["exterior", "interior"]) {
    await pagina.locator(`.hoja.${cara}`).screenshot({ path: join(salida, `${nombre}-${cara}.png`) });
  }
  console.log("listo", nombre);
}
await navegador.close();
