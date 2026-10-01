/* ============================================================================
   La imagen con los datos del responsable, para el Aviso de privacidad.

   POR QUÉ ES UNA IMAGEN

   La ley pide que el aviso identifique al responsable con nombre y domicilio.
   Pero esos mismos datos se purgaron del sitio y de TODO el historial del
   repositorio en septiembre de 2026: son los datos de una persona, el
   repositorio es público, y un rastreador o un modelo de lenguaje que los lea
   como texto los repite para siempre.

   Así que se publican como píxeles: quien abre el aviso los lee; quien indexa
   texto no encuentra nada que copiar.

   POR QUÉ ESTE ARCHIVO NO TRAE LOS DATOS

   Se le pasan AL CORRERLO, por variables de entorno. Aquí no hay ni un nombre
   ni una calle, y no debe haberlos nunca: ni en este archivo, ni en un
   comentario, ni en un commit, ni en una prueba. La prueba «ningún dato
   personal vuelve al sitio» busca por FORMA y no conoce los valores, a
   propósito.

   CORRER (PowerShell):

     $env:VIM_RESPONSABLE_NOMBRE    = "<nombre completo>"
     $env:VIM_RESPONSABLE_DOMICILIO = "<renglón 1>|<renglón 2>|<renglón 3>"
     node sitio-web/_capturas/responsable.mjs

   El domicilio va partido en renglones con «|»: en un celular de 360 px no cabe
   en uno, y partirlo a mano queda mejor que donde caiga.

   Al terminar el propio script revisa los BYTES del PNG: que no lleve metadatos
   (EXIF, XMP, texto) y que ninguna de las cadenas aparezca legible. Si algo
   aparece, borra el archivo y falla.

   La tipografía y los colores son los del sitio (assets/fonts y los tokens de
   vim.css), para que se lea como parte de la página. Va sobre una pastilla
   clara con borde: se lee sobre el fondo blanco de hoy y se seguiría leyendo
   si el sitio tuviera algún día un tema oscuro.
   ========================================================================== */

import { chromium } from "playwright";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(RAIZ, "assets/img/aviso/responsable.png");
/** Ancho en píxeles CSS. 328 = un celular de 360 con sus dos márgenes de 16. */
const ANCHO = 328;

const nombre = (process.env.VIM_RESPONSABLE_NOMBRE ?? "").trim();
const domicilio = (process.env.VIM_RESPONSABLE_DOMICILIO ?? "").split("|").map((r) => r.trim()).filter(Boolean);
if (!nombre || domicilio.length === 0) {
  console.error("Faltan VIM_RESPONSABLE_NOMBRE y VIM_RESPONSABLE_DOMICILIO (renglones separados por «|»).");
  console.error("Este script no trae los datos: se le pasan al correrlo. Ver la cabecera del archivo.");
  process.exit(1);
}

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** La tipografía del sitio, incrustada en memoria: la página no tiene origen del que cargarla. */
const fuente = async (archivo) => (await readFile(path.join(RAIZ, "assets/fonts", archivo))).toString("base64");

const html = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><style>
  @font-face { font-family: "Inter Tight"; src: url(data:font/woff2;base64,${await fuente("inter-tight-var-latin.woff2")}) format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  html, body { background: transparent; }
  #tarjeta {
    width: ${ANCHO}px; padding: 14px 16px;
    background: #FBFBFA; border: 1px solid #DDDDD9; border-radius: 8px;
    font-family: "Inter Tight", system-ui, sans-serif; color: #16161A;
    -webkit-font-smoothing: antialiased;
  }
  .rotulo { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #5A5A60; }
  .nombre { margin-top: 4px; font-size: 16px; font-weight: 600; line-height: 1.3; }
  .dom { margin-top: 10px; }
  .renglon { margin-top: 3px; font-size: 14px; line-height: 1.4; color: #16161A; }
</style></head><body><div id="tarjeta">
  <div class="rotulo">Responsable</div>
  <div class="nombre">${esc(nombre)}</div>
  <div class="rotulo dom">Domicilio</div>
  ${domicilio.map((r) => `<div class="renglon">${esc(r)}</div>`).join("\n  ")}
</div></body></html>`;

const navegador = await chromium.launch();
let png;
let alto;
try {
  const pagina = await navegador.newPage({ viewport: { width: ANCHO + 40, height: 400 }, deviceScaleFactor: 2 });
  await pagina.setContent(html, { waitUntil: "load" });
  await pagina.evaluate(() => document.fonts.ready);
  const tarjeta = pagina.locator("#tarjeta");
  alto = Math.round((await tarjeta.boundingBox()).height);
  png = await tarjeta.screenshot({ type: "png", omitBackground: true });
} finally {
  await navegador.close();
}

/* Se vuelve a codificar con sharp cuando está: por omisión NO copia metadatos, y de paso comprime.
   Sin sharp se queda el PNG de Playwright, que tampoco los lleva — la revisión de abajo lo confirma. */
try {
  const { default: sharp } = await import("sharp");
  png = await sharp(png).png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer();
} catch { /* sharp es opcional */ }

/* ── Revisión de bytes ───────────────────────────────────────────────────── */
const problemas = [];
// Trozos de PNG que pueden llevar texto o metadatos.
for (let i = 8; i + 8 <= png.length;) {
  const largo = png.readUInt32BE(i);
  const tipo = png.toString("latin1", i + 4, i + 8);
  if (["tEXt", "zTXt", "iTXt", "eXIf", "tIME"].includes(tipo)) problemas.push(`el PNG lleva un trozo ${tipo}`);
  i += 12 + largo;
}
// Las propias cadenas (y cada palabra larga), en las codificaciones en que podrían colarse.
const crudo = { latin1: png.toString("latin1").toLowerCase(), utf16: png.toString("utf16le").toLowerCase() };
const fragmentos = [nombre, ...domicilio, ...[nombre, ...domicilio].flatMap((t) => t.split(/[\s,.]+/).filter((p) => p.length >= 5))];
for (const f of fragmentos) {
  const b = f.toLowerCase();
  const enLatin1 = Buffer.from(b, "utf8").toString("latin1");
  if (crudo.latin1.includes(b) || crudo.latin1.includes(enLatin1) || crudo.utf16.includes(b)) {
    problemas.push("una de las cadenas aparece legible en los bytes");
    break;
  }
}

if (problemas.length) {
  await rm(SALIDA, { force: true });
  console.error("❌ La imagen NO se guardó:", [...new Set(problemas)].join("; "));
  process.exit(1);
}

await mkdir(path.dirname(SALIDA), { recursive: true });
await writeFile(SALIDA, png);
console.log(`✅ ${path.relative(RAIZ, SALIDA)} · ${png.length} bytes · sin metadatos y sin texto legible`);
console.log(`   En aviso-privacidad.html: width="${ANCHO}" height="${alto}" (y sube el ?v= de la imagen).`);
