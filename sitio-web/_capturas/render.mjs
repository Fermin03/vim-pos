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
     3. Las Edge Functions sirviendo:     supabase functions serve                                             --env-file supabase/functions/.env                                             --no-verify-jwt
        `supabase start` NO las levanta. Sin esto el login con PIN devuelve 503
        y la caja se queda en el selector de empleados — que fue exactamente lo
        que pasó la primera vez que se corrió esto.
     4. Las apps sirviendo:               pnpm --filter @vim/pos dev     (3000)
                                          pnpm --filter @vim/admin dev   (3001)
     5. Aquí dentro:                      npm install && npm run capturar

   Genera PNG a 2× y, si hay `sharp`, también WebP. El PNG se queda como
   respaldo: pesa más pero lo abre cualquier cosa.
   ========================================================================== */

import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const SALIDA = path.resolve(import.meta.dirname, "../assets/img/capturas");

const POS = process.env.VIM_POS_URL ?? "http://localhost:3000";
const ADMIN = process.env.VIM_ADMIN_URL ?? "http://localhost:3001";
const KDS = process.env.VIM_KDS_URL ?? "http://localhost:3003";

/* Credenciales del negocio de demostración. Salen de semilla-demo.sql y solo
   existen en el Supabase local; no abren nada en producción.

   El identificador de la caja NO es un correo cualquiera: el POS le saca el
   `caja_id` con una expresión regular (`caja-{uuid}@…`, ver
   apps/pos/app/lib/supabase.ts). Un correo con otra forma se acepta en el
   formulario y falla al vincular. */
const CAJA = {
  email: "caja-9c3a71e0-0000-4000-8000-000000000003@dispositivos.vimpos.mx",
  password: "demo-dispositivo",
};
const PIN = "1234";           // Ana Ruiz
const DUENA = { email: "duena@crazyburgers.demo", password: "demo1234" };

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
  { id: "pos-home",            app: "pos",   ruta: "/",             titulo: "Home del POS",               espera: /para llevar/i },                                   // index, demo
  { id: "pos-catalogo",        app: "pos",   ruta: "/",             titulo: "Catálogo con modificadores", accion: "abrirModificadores", espera: "Término de la carne" }, // index
  { id: "pos-pago",            app: "pos",   ruta: "/",             titulo: "Método de pago",             accion: "abrirCobro",         espera: /efectivo/i },          // index
  { id: "pos-mesas",           app: "pos",   ruta: "/",             titulo: "Mapa de mesas",              accion: "abrirMesas",         espera: /mesa/i },              // index
  { id: "pos-sin-conexion",    app: "pos",   ruta: "/",             titulo: "Banner de sin conexión",     accion: "cortarRed",          espera: /sin conexión|sin internet/i }, // sin-internet
  { id: "pos-arqueo",          app: "pos",   ruta: "/turno/cierre", titulo: "Arqueo y corte",             espera: /arqueo|cierre|corte/i },                            // sin-internet
  { id: "kds",                 app: "kds",   ruta: "/",             titulo: "Pantalla de cocina",         espera: /cocina|comanda|pedido|sin pedidos/i },              // index
  { id: "admin-dashboard",     app: "admin", ruta: "/dashboard",            titulo: "Dashboard del panel",           espera: /ventas|hoy|resumen/i },      // precios, index
  { id: "admin-resultados",    app: "admin", ruta: "/reportes/consolidado", titulo: "Estado de resultados del día",  espera: /resultados|consolidado/i },  // index
  { id: "admin-inventario",    app: "admin", ruta: "/inventario",           titulo: "Inventario",                    espera: /inventario|insumo/i },       // precios
  { id: "admin-conciliacion",  app: "admin", ruta: "/conciliacion",         titulo: "Conciliación de apps",          espera: /conciliaci/i },              // — segunda ola
  { id: "admin-importador",    app: "admin", ruta: "/catalogo/importar",    titulo: "Importador de menú",            espera: /importar|pegar/i },          // index
  { id: "ticket-venta",        app: "pos",   ruta: "/", papel: true, titulo: "Ticket de venta",  accion: "vistaPreviaTicket", espera: /Crazy Burgers/i },  // precios
  { id: "corte-z",             app: "pos",   ruta: "/turno/cierre", papel: true, titulo: "Corte de caja", accion: "vistaPreviaCorte", espera: /corte/i },  // — segunda ola
];

/* Acciones que hacen falta para que una pantalla enseñe algo. Se declaran aquí
   y no dentro del bucle para que añadir una toma nueva sea una línea de datos,
   no una rama más en el código. */
/* Acciones que hacen falta para que una pantalla enseñe algo. Se declaran aquí
   y no dentro del bucle para que añadir una toma nueva sea una línea de datos,
   no una rama más en el código.

   Casi todas empiezan por entrar a un modo de servicio: el "home" del POS es un
   concentrador (Comedor / Para llevar / Pick-up / Domicilio) y el catálogo está
   detrás de elegir uno. Eso no se sabía al escribir la primera versión de este
   archivo, que asumía que la caja abría directamente en el catálogo. */
const ACCIONES = {
  async entrarAlCatalogo(page) {
    await page.getByText(/para llevar/i).first().click();
    await page.getByText("Crazy Clásica").first().waitFor({ timeout: 8000 });
  },

  async abrirModificadores(page) {
    await ACCIONES.entrarAlCatalogo(page);
    await page.getByText("Crazy Clásica").first().click();
    await page.getByText("Término de la carne").waitFor({ timeout: 8000 });
  },

  async abrirCobro(page) {
    await ACCIONES.entrarAlCatalogo(page);
    await page.getByText("Crazy Clásica").first().click();
    /* El producto tiene un grupo obligatorio, así que hay que elegir término
       antes de que se pueda agregar al ticket. */
    await page.getByText("Término medio").first().click().catch(() => {});
    await page.getByRole("button", { name: /agregar|añadir/i }).first().click().catch(() => {});
    await page.getByRole("button", { name: /cobrar/i }).first().click();
  },

  async abrirMesas(page) {
    await page.getByText(/comedor/i).first().click();
  },

  async cortarRed(page) {
    /* El banner de sin conexión es el argumento entero del producto, así que la
       captura tiene que salir de cortar la red de verdad, no de un CSS. */
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);
  },

  async vistaPreviaTicket(page) {
    await page.getByRole("button", { name: /reimprimir|ticket/i }).first().click();
  },

  async vistaPreviaCorte(page) {
    await page.getByRole("button", { name: /vista previa|imprimir/i }).first().click();
  },
};


/* Vincular la caja y entrar con el PIN.

   Son DOS sesiones distintas y hay que pasar por las dos: el dispositivo se
   vincula una vez (identificador + clave) y después cada empleado entra con su
   PIN. La versión anterior buscaba una etiqueta «correo» que no existe en esta
   pantalla — se llama «Identificador del dispositivo». */
async function entrarAlPos(page) {
  await page.goto(POS, { waitUntil: "networkidle" });

  const idCaja = page.getByLabel(/identificador del dispositivo/i);
  if (await idCaja.isVisible().catch(() => false)) {
    await idCaja.fill(CAJA.email);
    await page.getByLabel(/clave del dispositivo/i).fill(CAJA.password);
    await page.getByRole("button", { name: /vincular dispositivo/i }).click();
    await page.waitForLoadState("networkidle");
  }

  /* Después, el empleado. El PIN se pulsa en el numpad de la pantalla.
     `PinKeypad` también escucha el teclado físico, pero por aquí no llega: el
     manejador ignora el evento si el foco está en un input, y tras abrir el
     modal ahí acaba. Pulsar los botones es lo que hace un cajero de todos
     modos. */
  const ana = page.getByText("Ana Ruiz").first();
  if (await ana.isVisible().catch(() => false)) {
    await ana.click();
    for (const d of PIN) {
      await page.getByRole("button", { name: d, exact: true }).click();
      await page.waitForTimeout(150);
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(800);
}

/* El panel es una sesión aparte: correo y contraseña de la dueña. Sin esto las
   cinco tomas de /admin salen siendo la pantalla de inicio de sesión. */
async function entrarAlPanel(page) {
  await page.goto(ADMIN, { waitUntil: "networkidle" });

  const correo = page.getByLabel(/correo/i);
  if (await correo.isVisible().catch(() => false)) {
    await correo.fill(DUENA.email);
    /* Anclado: sin `^…$` esto agarra también el botón «Mostrar contraseña»,
       que lleva esa palabra en su aria-label. */
    await page.getByLabel(/^contraseña$/i).fill(DUENA.password);
    await page.getByRole("button", { name: /^entrar$/i }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
  }
}

async function capturar(page, toma) {
  const base = toma.app === "pos" ? POS : toma.app === "kds" ? KDS : ADMIN;
  await page.setViewportSize(toma.papel ? PAPEL : PANTALLA);
  await page.goto(base + toma.ruta, { waitUntil: "networkidle" });

  /* La sesión del EMPLEADO no sobrevive a una recarga: el token vive en el
     estado de React de page.tsx, no en disco (a propósito — el sync-pull baja
     los pin_hash del tenant entero, así que guardarlos en la caja sería peor).
     El dispositivo sí queda vinculado en localStorage.

     Conclusión práctica: cada `goto` al POS devuelve al selector de empleados,
     así que hay que volver a entrar. `entrarAlPos` comprueba antes de actuar,
     de modo que llamarla de más no cuesta nada. */
  if (toma.app === "pos") await entrarAlPos(page);

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

  /* ¿De verdad estamos donde creemos?

     La primera versión de esto no lo comprobaba y diez tomas salieron marcadas
     con ✓ siendo la pantalla de inicio de sesión. Nadie se dio cuenta hasta
     abrir los PNG uno por uno — y si esas capturas llegan a publicarse, el
     sitio enseña un formulario de login como si fuera el producto.

     Un ✓ que no significa nada es peor que un ✗: el ✗ al menos se lee. */
  if (toma.espera) {
    try {
      await page.getByText(toma.espera).first().waitFor({ timeout: 8000 });
    } catch {
      console.warn(`  ✗ ${toma.id}: la página no muestra ${toma.espera} — ¿sesión caída o ruta cambiada?`);
      return false;
    }
  }

  /* Fuera el indicador de desarrollo de Next.js — ese círculo negro con la "N"
     en la esquina. Sale en TODAS las capturas y es exactamente la clase de
     detalle que delata que la imagen no es del producto sino de un entorno de
     desarrollo. Se oculta al vuelo en vez de tocar next.config: aquí es donde
     estorba, y apagarlo en la configuración se lo quitaría también a quien
     desarrolla, que sí lo quiere. */
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }",
  }).catch(() => { /* si el selector cambia, la captura sigue saliendo */ });
  await page.waitForTimeout(120);

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

/* Dos pestañas, una por app. El panel y el POS son orígenes distintos y cada
   uno tiene su sesión; compartir una sola pestaña obligaba a re-entrar en la
   otra app cada vez que se cambiaba de una a la otra. */
const paginaPanel = await contexto.newPage();
await entrarAlPos(page);
await entrarAlPanel(paginaPanel);

let hechas = 0;
for (const toma of TOMAS) {
  const hoja = toma.app === "admin" ? paginaPanel : page;
  if (await capturar(hoja, toma)) hechas++;
  if (toma.accion === "cortarRed") await hoja.context().setOffline(false);
}

await navegador.close();
console.log(`\n${hechas} de ${TOMAS.length} tomas.`);
if (hechas < TOMAS.length) console.log("Las que faltan salen arriba con el motivo.");

console.log("\nConvirtiendo a WebP:");
await aWebp();
