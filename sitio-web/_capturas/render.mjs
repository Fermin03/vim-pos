/* ============================================================================
   Capturas del producto real para el sitio.

   POR QUÉ ESTO EXISTE Y NO SE USAN LOS MOCKUPS

   Hay 231 mockups de alta fidelidad en RECURSOS PARA DESARROLLO/MOCKUPS y sería
   mucho más rápido renderizarlos. Son bocetos, no el producto, y ya se
   separaron de él: la página de Reportes se reescribió entera, cambió el título
   de Inventario, y varios mockups dibujan funciones que el sitio admite que no
   existen. Si el prospecto ve el sitio y luego la demo, ve dos productos
   distintos — y lo nota justo cuando estás cerrando.

   Al estar guionizado, esto se puede volver a correr entero cuando la interfaz
   cambie. Ésa es la otra razón para no depender de los mockups: no se
   actualizan solos.

   ANTES DE CORRER

     1. Supabase local arriba:            npx supabase start
     2. El negocio de demostración:       docker exec -i supabase_db_vim-pos \
                                            psql -U postgres -d postgres < semilla-demo.sql
     3. Las apps sirviendo:               pnpm --filter @vim/pos dev     (3000)
                                          pnpm --filter @vim/admin dev   (3001)
     4. Aquí dentro:                      npm install && npm run capturar

   Genera PNG a 2× y, si hay `sharp`, también WebP. El PNG se queda como
   respaldo: pesa más pero lo abre cualquier cosa.
   ========================================================================== */

import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const SALIDA = path.resolve(import.meta.dirname, "../assets/img/capturas");

const POS = process.env.VIM_POS_URL ?? "http://localhost:3000";
const ADMIN = process.env.VIM_ADMIN_URL ?? "http://localhost:3001";

/* Credenciales del negocio de demostración. Salen de semilla-demo.sql y solo
   existen en el Supabase local; no abren nada en producción. */
const CAJA = { email: "caja01@crazyburgers.demo", password: "demo-dispositivo" };
const PIN = "1234"; // Ana Ruiz

/* 1440×900 es el portátil con el que un restaurantero mira el sitio. Los
   formatos de papel van estrechos y largos, como el rollo térmico real. */
const PANTALLA = { width: 1440, height: 900 };
const PAPEL = { width: 640, height: 1400 };

/* Las catorce tomas del plan (§3.1). El orden importa: las del POS comparten
   sesión, así que van seguidas para no volver a entrar en cada una.

   `usadaEn` dice qué página del sitio la espera. No es documentación de
   adorno: el hueco del sitio lleva `data-captura="<id>"`, así que los dos
   extremos se pueden cruzar con un grep y saber si falta alguna o si sobra
   una toma que ya nadie usa. */
const TOMAS = [
  { id: "pos-home",            app: "pos",   ruta: "/",                        titulo: "Home del POS" },  // index, demo
  { id: "pos-catalogo",        app: "pos",   ruta: "/",                        titulo: "Catálogo con modificadores", accion: "abrirModificadores" },  // index
  { id: "pos-pago",            app: "pos",   ruta: "/",                        titulo: "Método de pago",             accion: "abrirCobro" },  // index
  { id: "pos-mesas",           app: "pos",   ruta: "/mesas",                   titulo: "Mapa de mesas" },  // index
  { id: "pos-sin-conexion",    app: "pos",   ruta: "/",                        titulo: "Banner de sin conexión",     accion: "cortarRed" },  // sin-internet
  { id: "pos-arqueo",          app: "pos",   ruta: "/turno/cierre",            titulo: "Arqueo y corte" },  // sin-internet
  { id: "kds",                 app: "pos",   ruta: "/kds",                     titulo: "Pantalla de cocina" },  // index
  { id: "admin-dashboard",     app: "admin", ruta: "/dashboard",               titulo: "Dashboard del panel" },  // precios
  { id: "admin-resultados",    app: "admin", ruta: "/reportes/consolidado",    titulo: "Estado de resultados del día" },  // index
  { id: "admin-inventario",    app: "admin", ruta: "/inventario",              titulo: "Inventario" },  // precios
  /* Estas cinco todavía no tienen hueco en ninguna página: van a producto.html,
     giros.html y facturacion.html, que son de la segunda ola (§7 del plan, fase
     8). Se capturan igual — cuestan lo mismo dentro del mismo recorrido y estar
     ya listas es lo que evita volver a montar todo el entorno dentro de dos
     meses. Cruce sitio ↔ herramienta: grep de `data-captura` en sitio-web/. */
  { id: "admin-conciliacion",  app: "admin", ruta: "/conciliacion",            titulo: "Conciliación de apps" },  // — sin usar todavía
  { id: "admin-importador",    app: "admin", ruta: "/catalogo/importar",       titulo: "Importador de menú" },  // index
  { id: "ticket-venta",        app: "pos",   ruta: "/",   papel: true,         titulo: "Ticket de venta",  accion: "vistaPreviaTicket" },  // precios
  { id: "corte-z",             app: "pos",   ruta: "/turno/cierre", papel: true, titulo: "Corte de caja",  accion: "vistaPreviaCorte" },  // — sin usar todavía
];

/* Acciones que hacen falta para que una pantalla enseñe algo. Se declaran aquí
   y no dentro del bucle para que añadir una toma nueva sea una línea de datos,
   no una rama más en el código. */
const ACCIONES = {
  async abrirModificadores(page) {
    await page.getByText("Crazy Clásica").first().click();
    await page.getByText("Término de la carne").waitFor({ timeout: 5000 });
  },
  async abrirCobro(page) {
    await page.getByText("Crazy Clásica").first().click();
    await page.getByRole("button", { name: /cobrar/i }).click();
  },
  async cortarRed(page) {
    /* El banner de sin conexión es el argumento entero del producto, así que la
       captura tiene que salir de cortar la red de verdad, no de un CSS. */
    await page.context().setOffline(true);
    await page.waitForTimeout(1500);
  },
  async vistaPreviaTicket(page) {
    await page.getByRole("button", { name: /reimprimir|ticket/i }).first().click();
  },
  async vistaPreviaCorte(page) {
    await page.getByRole("button", { name: /vista previa|imprimir/i }).first().click();
  },
};

async function entrarAlPos(page) {
  await page.goto(POS, { waitUntil: "networkidle" });
  /* La caja mantiene la sesión, así que esto solo corre la primera vez. */
  if (await page.getByLabel(/correo|email/i).isVisible().catch(() => false)) {
    await page.getByLabel(/correo|email/i).fill(CAJA.email);
    await page.getByLabel(/contraseña/i).fill(CAJA.password);
    await page.getByRole("button", { name: /entrar|iniciar/i }).click();
  }
  /* Y después el PIN del empleado, que es una sesión aparte. */
  const teclado = page.getByRole("button", { name: PIN[0] });
  if (await teclado.isVisible().catch(() => false)) {
    for (const d of PIN) await page.getByRole("button", { name: d, exact: true }).click();
  }
  await page.waitForLoadState("networkidle");
}

async function capturar(page, toma) {
  const base = toma.app === "pos" ? POS : ADMIN;
  await page.setViewportSize(toma.papel ? PAPEL : PANTALLA);
  await page.goto(base + toma.ruta, { waitUntil: "networkidle" });

  if (toma.accion) {
    try {
      await ACCIONES[toma.accion](page);
    } catch (e) {
      /* Que falle una toma no debe tumbar las trece restantes: se anota y sigue.
         Media hora de capturas perdidas por un selector que cambió es la razón
         por la que nadie vuelve a correr la herramienta. */
      console.warn(`  ⚠ ${toma.id}: la acción "${toma.accion}" falló — ${e.message}`);
      return false;
    }
  }

  /* Un respiro tras el "networkidle": las animaciones de entrada del propio
     producto todavía están corriendo y salen a medias en la captura. */
  await page.waitForTimeout(400);

  const destino = path.join(SALIDA, `${toma.id}.png`);
  await page.screenshot({ path: destino, fullPage: false });
  console.log(`  ✓ ${toma.id.padEnd(20)} ${toma.titulo}`);
  return true;
}

async function aWebp() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.log("\n· sharp no está instalado: se quedan los PNG. `npm i sharp` para generar WebP.");
    return;
  }
  const archivos = (await readdir(SALIDA)).filter((f) => f.endsWith(".png"));
  for (const f of archivos) {
    const origen = path.join(SALIDA, f);
    const destino = origen.replace(/\.png$/, ".webp");
    await sharp(origen).webp({ quality: 82 }).toFile(destino);
    const [a, b] = await Promise.all([stat(origen), stat(destino)]);
    console.log(`  ${f.replace(".png", "").padEnd(20)} ${Math.round(a.size / 1024)} KB → ${Math.round(b.size / 1024)} KB`);
  }
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ deviceScaleFactor: 2, locale: "es-MX" });
const page = await contexto.newPage();

await mkdir(SALIDA, { recursive: true });
console.log(`Capturando en ${SALIDA}\n`);

await entrarAlPos(page);

let hechas = 0;
for (const toma of TOMAS) {
  if (await capturar(page, toma)) hechas++;
  if (toma.accion === "cortarRed") await page.context().setOffline(false);
}

await navegador.close();
console.log(`\n${hechas} de ${TOMAS.length} tomas.`);
if (hechas < TOMAS.length) console.log("Las que faltan salen arriba con el motivo.");

console.log("\nConvirtiendo a WebP:");
await aWebp();
