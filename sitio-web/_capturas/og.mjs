/* ============================================================================
   La imagen de compartir (Open Graph), una por página.

   POR QUÉ SE GENERA Y NO SE DIBUJA A MANO

   Son seis imágenes que repiten la misma plantilla cambiando dos líneas de
   texto. Hechas a mano, la séptima página nace sin la suya y nadie se entera
   hasta que alguien comparte el enlace y sale una tarjeta en blanco.

   Y ES LA TARJETA EN BLANCO EL PROBLEMA REAL: el canal principal de este
   negocio es WhatsApp. Un enlace sin `og:image` ahí se ve como texto pelado
   junto a enlaces de la competencia que sí traen imagen.

   1200×630 es la medida que piden Facebook, WhatsApp, LinkedIn y X. A 2× para
   que no se vea borrosa en pantallas densas.

   Correr:  node og.mjs      (necesita el sitio servido en :4173 — no, no lo
                              necesita: la plantilla es autónoma)
   ========================================================================== */

import { chromium } from "playwright";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const SALIDA = path.resolve(import.meta.dirname, "../assets/img/og");

/* Una por página. El texto NO se copia del `<title>`: un title está escrito
   para caber en una pestaña y en el resultado de Google, y aquí hay sitio para
   una frase de verdad. */
const TARJETAS = [
  { id: "home",         eyebrow: "Punto de venta para restaurantes", titulo: "Todo lo que tu restaurante necesita, sin letra chica." },
  { id: "funciones",    eyebrow: "Funciones",     titulo: "Qué hace, sección por sección." },
  { id: "sin-internet", eyebrow: "El diferenciador", titulo: "Se cae el internet y tú sigues cobrando." },
  { id: "precios",      eyebrow: "Precios",       titulo: "Precio de lista, publicado. Desde $699 al mes." },
  { id: "demo",         eyebrow: "Pide una demo", titulo: "Te lo enseñamos funcionando, con tus productos." },
  { id: "legal",        eyebrow: "VIM POS",       titulo: "Punto de venta para restaurantes en México." },
  { id: "facturacion-cfdi", eyebrow: "Facturación",   titulo: "Facturación CFDI 4.0, sin parar la fila." },
  { id: "como-elegir",  eyebrow: "Guía de compra", titulo: "Cómo elegir el sistema para tu restaurante." },
  { id: "cuanto-cuesta", eyebrow: "Guía de compra", titulo: "Cuánto cuesta de verdad un sistema para restaurante." },
];

/* El logotipo va incrustado como SVG y no como archivo: así la plantilla no
   depende de rutas relativas ni de que haya un servidor sirviendo la carpeta. */
const LOGO = `<svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 3h24v20l-6-4-6 6-6-6-6 4V3z" fill="#0078C9"/>
  <path d="M11 9l5 9 5-9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function plantilla({ eyebrow, titulo }) {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&family=Sora:wght@600;700&family=JetBrains+Mono:wght@600&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px;
    background: #FFFFFF;
    font-family: 'Inter Tight', system-ui, sans-serif;
    /* Una banda de acento a la izquierda en vez de un degradado de fondo: se
       ve igual de bien recortada por el marco cuadrado que usa WhatsApp. */
    border-left: 16px solid #0078C9;
  }
  .marca { display: flex; align-items: center; gap: 20px; }
  .marca span { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 34px; letter-spacing: -.02em; color: #16161A; }
  .eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 20px; font-weight: 600; letter-spacing: .14em;
    text-transform: uppercase; color: #0063A8;
  }
  h1 {
    font-family: 'Sora', sans-serif; font-weight: 700;
    font-size: 66px; line-height: 1.08; letter-spacing: -.03em;
    color: #16161A; max-width: 20ch; text-wrap: balance;
  }
  .pie { display: flex; align-items: center; gap: 14px; font-size: 22px; color: #5A5A60; }
  .punto { width: 9px; height: 9px; border-radius: 50%; background: #2E7D52; }
</style></head><body>
  <div class="marca">${LOGO}<span>VIM POS</span></div>
  <div style="display:flex;flex-direction:column;gap:22px">
    <p class="eyebrow">${eyebrow}</p>
    <h1>${titulo}</h1>
  </div>
  <div class="pie"><span class="punto"></span>vimpos.com.mx · León, Guanajuato</div>
</body></html>`;
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ deviceScaleFactor: 2, locale: "es-MX" });
const page = await contexto.newPage();
await page.setViewportSize({ width: 1200, height: 630 });

await mkdir(SALIDA, { recursive: true });
console.log(`Generando en ${SALIDA}\n`);

for (const t of TARJETAS) {
  await page.setContent(plantilla(t), { waitUntil: "networkidle" });
  /* Las tipografías web tardan un instante más que el `networkidle`; sin esta
     espera la tarjeta sale con la letra del sistema y se nota. */
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const destino = path.join(SALIDA, `${t.id}.png`);
  await page.screenshot({ path: destino });
  const { size } = await stat(destino);
  console.log(`  ✓ ${t.id.padEnd(14)} ${Math.round(size / 1024)} KB`);
}

await navegador.close();

/* A JPG no: el PNG de una tarjeta con dos colores planos y texto pesa menos que
   su JPG y no le mete artefactos a la tipografía. Y a WebP tampoco, porque hay
   clientes de correo y previsualizadores que todavía no lo entienden — que es
   justo donde esta imagen tiene que verse. */
console.log("\nListo. Se referencian con una og:image ABSOLUTA (https://vimpos.com.mx/...).");
