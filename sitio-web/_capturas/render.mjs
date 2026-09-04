/* ============================================================================
   Capturas del producto real para el sitio.

   POR QUÉ ESTO EXISTE Y NO SE USAN LOS MOCKUPS

   Hay 231 mockups de alta fidelidad archivados en respaldos/mockups-2026-08-hasta-aqui-mandaron (ya no mandan) y sería
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
  /* El hero del sitio. Antes era el concentrador vacío con el logotipo en
     medio; ahora es la caja en plena venta: catálogo abierto y un ticket con
     tres productos. Es la primera imagen que ve un prospecto, y tiene que
     enseñar el producto haciendo lo suyo. */
  { id: "pos-home",            app: "pos",   ruta: "/",             titulo: "Caja con un ticket en curso",  accion: "armarTicket", limpiar: "descartarTicket", espera: /^Cobrar/i },  // index, demo
  { id: "pos-catalogo",        app: "pos",   ruta: "/",             titulo: "Catálogo con modificadores", accion: "abrirModificadores", espera: "Término de la carne" }, // index
  { id: "pos-pago",            app: "pos",   ruta: "/",             titulo: "Método de pago",             accion: "abrirCobro", limpiar: "descartarTicket", espera: /efectivo/i },          // index
  { id: "pos-mesas",           app: "pos",   ruta: "/",             titulo: "Mapa de mesas",              accion: "abrirMesas",         espera: /mesa/i },              // index
  { id: "pos-sin-conexion",    app: "pos",   ruta: "/",             titulo: "Banner de sin conexión",     accion: "cortarRed",          espera: /sin conexión|sin internet/i }, // sin-internet
  /* El monitor del turno. Se conserva con su nombre de siempre porque tres
     páginas lo enlazan; el arqueo de verdad es la toma "pos-cierre". */
  { id: "pos-monitor",         app: "pos",   ruta: "/",             titulo: "Monitor del turno",          accion: "abrirCorteX", espera: /efectivo esperado/i },
  /* La espera es un producto del menú, no la palabra "cocina": la pantalla
     de vinculación también dice "cocina", y así fue como la primera versión
     publicó un formulario de credenciales como si fuera la pantalla de
     comandas. */
  { id: "kds",                 app: "kds",   ruta: "/",             titulo: "Pantalla de cocina",         espera: /Crazy Clásica|Doble Queso/ },                       // index, funciones
  { id: "admin-dashboard",     app: "admin", ruta: "/dashboard",            titulo: "Dashboard del panel",           espera: /ventas|hoy|resumen/i },      // precios, index
  { id: "admin-resultados",    app: "admin", ruta: "/reportes/consolidado", titulo: "Estado de resultados del día",  espera: /resultados|consolidado/i },  // index
  { id: "admin-inventario",    app: "admin", ruta: "/inventario",           titulo: "Inventario",                    espera: /inventario|insumo/i },       // precios
  { id: "admin-conciliacion",  app: "admin", ruta: "/conciliacion",         titulo: "Conciliación de apps",          accion: "abrirLiquidacion", espera: /RP-884/ },  // funciones
  { id: "admin-importador",    app: "admin", ruta: "/catalogo/importar",    titulo: "Importador de menú",            accion: "revisarEjemplo", espera: /Hamburguesas/ },  // index, funciones
  { id: "ticket-venta",        app: "pos",   ruta: "/", papel: true, titulo: "Ticket de venta",  accion: "vistaPreviaTicket", espera: /Crazy Burgers/i },  // precios, facturacion
  /* El arqueo: la pantalla de cierre con el efectivo contado y la diferencia
     a la vista. Va casi al final porque entra al flujo de cerrar el turno;
     no lo cierra (no pulsa "Generar corte"), pero deja la caja en esa
     pantalla. Las cuentas abiertas de la semilla cuelgan de Caja 02 a
     propósito: si fueran de este turno, el cierre se bloquearía. */
  { id: "pos-arqueo",          app: "pos",   ruta: "/",   titulo: "Arqueo del cierre de turno", accion: "abrirArqueo", espera: /Arqueo/ },  // index, funciones, sin-internet
  /* corte-z ES LA ÚNICA QUE NO SALE, y se deja documentado en vez de borrarla.
  
     Cierra el turno de verdad, así que va de última — pero además exige que no
     haya NINGUNA cuenta abierta, y el propio recorrido de capturas dejaba una
     (ver `descartarTicket`). Aun con eso limpio, "Generar corte" sigue
     deshabilitado por algo que no se identificó.
  
     NO BLOQUEA NADA: ninguna página del sitio la usa. Estaba prevista para la
     segunda ola. Cuando haga falta, el camino ya está escrito aquí y solo queda
     entender qué más valida ese botón.
  
     Si la prisa aprieta, se toma a mano: cerrar turno desde la caja, declarar
     el efectivo y fotografiar el papel. Son dos minutos. */
  { id: "corte-z",             app: "pos",   ruta: "/",   papel: true, titulo: "Corte de caja", accion: "vistaPreviaCorte", espera: /corte|turno/i },  // — segunda ola
];

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

  /* El hero: un ticket con tres productos a la vista. La hamburguesa pasa por
     el modal del término; las papas y el refresco no tienen modificadores y
     entran al ticket con un clic. */
  async armarTicket(page) {
    await ACCIONES.ponerUnProducto(page);
    /* Cada producto vive en la pestaña de su categoría. */
    await page.getByRole("button", { name: /para acompañar/i }).first().click();
    await page.getByText("Papas gajo").first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Bebidas$/i }).first().click();
    await page.getByText("Refresco 600 ml").first().click();
    await page.waitForTimeout(500);
    /* De vuelta a las hamburguesas, que es la pestaña que se ve en la captura. */
    await page.getByRole("button", { name: /^Hamburguesas$/i }).first().click();
    await page.waitForTimeout(700);
  },

  /* Cerrar turno → confirmar → teclear el efectivo contado. Se lee lo esperado
     de la propia pantalla y se declara 40 pesos menos: un arqueo que cuadra
     exacto no enseña para qué sirve el arqueo. */
  async abrirArqueo(page) {
    await page.getByRole("button", { name: /cerrar turno/i }).first().click();
    await page.getByRole("button", { name: /^S[ií], cerrar turno/i }).first().waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: /^S[ií], cerrar turno/i }).first().click();
    await page.getByText(/Arqueo/).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    const esperado = await page.evaluate(() => {
      const fila = [...document.querySelectorAll("tr")].find((tr) => /Efectivo/.test(tr.textContent || ""));
      const m = (fila?.textContent || "").match(/\$\s?([\d,]+\.\d{2})/);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    });
    const contado = esperado != null ? Math.max(0, Math.round(esperado - 40)) : 3260;
    const efectivo = page.locator("input").first();
    await efectivo.click();
    await page.keyboard.type(String(contado), { delay: 40 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);
  },

  /* La conciliación se ve por liquidación: la lista solo tiene totales, el
     cruce renglón por renglón está en el detalle. */
  async abrirLiquidacion(page) {
    await page.locator("tr", { hasText: /Rappi/i }).first().click();
    await page.getByText(/RP-884/).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(400);
  },

  /* El importador con la vista previa puesta: pega el ejemplo y pulsa Revisar.
     Vacío, la captura enseñaba un cuadro de texto y nada más. */
  async revisarEjemplo(page) {
    await page.getByRole("button", { name: /usar ejemplo/i }).click();
    await page.getByRole("button", { name: /^Revisar$/i }).click();
    await page.getByText(/Hamburguesas/).first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(400);
  },

  async abrirModificadores(page) {
    await ACCIONES.entrarAlCatalogo(page);
    await page.getByText("Crazy Clásica").first().click();
    await page.getByText("Término de la carne").waitFor({ timeout: 8000 });
  },

  /* Deja un producto en el ticket. Lo usan las dos acciones de cobro. */
  async ponerUnProducto(page) {
    await ACCIONES.entrarAlCatalogo(page);
    await page.getByText("Crazy Clásica").first().click();
    /* El término es obligatorio: sin elegirlo, "Agregar al ticket" no procede.
       Viene uno preseleccionado, así que esto solo asegura el estado. */
    await page.getByText("Término medio").first().click().catch(() => {});
    await page.getByRole("button", { name: /agregar al ticket/i }).first().click();
    await page.waitForTimeout(800);
  },

  /* EL COBRO SON TRES PASOS, no uno.
  
     La primera versión pulsaba "Cobrar" y esperaba ver "efectivo". Nunca
     aparecía, y el diagnóstico decía "la página no muestra /efectivo/i" — lo
     cual era cierto y engañoso a la vez: el modal SÍ se abría, pero su primera
     pantalla es la propina. Los métodos de pago están dos pasos más adentro.
  
       Cobrar  ->  propina  ->  Confirmar  ->  métodos de pago
  
     "Sin propina" es una selección, no un avance: quien avanza es "Confirmar".
     Costó tres diagnósticos entenderlo, así que queda escrito. */
  async abrirCobro(page) {
    await ACCIONES.ponerUnProducto(page);
    await page.getByRole("button", { name: /^Cobrar/i }).first().click();
    await page.getByRole("button", { name: /sin propina/i }).first().waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: /sin propina/i }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /^Confirmar/i }).first().click();
    await page.getByText(/efectivo/i).first().waitFor({ timeout: 8000 });
  },

  /* Para el ticket impreso hace falta una venta cobrada DE VERDAD: la vista
     previa sale del cobro que se acaba de hacer, no de las ventas sembradas.

     OJO CON EL SEGUNDO "Cobrar". Cuando el modal está abierto hay DOS botones
     con ese nombre: el del panel del ticket, detrás, y el del modal. `.first()`
     agarraba el de detrás —que el modal tapa— y Playwright reintentaba el clic
     durante treinta segundos hasta rendirse. Por eso se acota al `dialog`. */
  async vistaPreviaTicket(page) {
    await ACCIONES.abrirCobro(page);
    await page.getByRole("button", { name: /^Efectivo/i }).first().click();
    await page.getByRole("button", { name: /pago exacto/i }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /^Cobrar/i }).first().click();

    /* NO se pulsa "Ver / Imprimir": al cerrar la venta, la caja ABRE SOLA la
       vista previa del ticket. Intentar pulsarlo era la causa del último fallo
       —el propio overlay tapa ese botón, así que Playwright reintentaba el clic
       treinta segundos y se rendía—. Solo hay que esperar a que aparezca.

       Se espera por `data-overlay-imprimible` y no por un texto del ticket: el
       atributo no cambia si mañana cambia la copia. */
    await page.locator("[data-overlay-imprimible]").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
  },

  async abrirCorteX(page) {
    /* El corte del turno se abre desde el concentrador, no por URL:
       `/turno/cierre` no existe como ruta. */
    await page.getByRole("button", { name: /corte caja X/i }).first().click();
    await page.getByText(/efectivo esperado/i).waitFor({ timeout: 8000 });
  },

  /* Cierra el modal de cobro y vacía el ticket, para no dejar una cuenta
     abierta que después impida cerrar el turno. */
  async descartarTicket(page) {
    await page.getByRole("button", { name: /volver al ticket/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^Limpiar$/i }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    /* Algunas versiones piden confirmar el vaciado. */
    await page.getByRole("button", { name: /s[ií]|vaciar|confirmar/i }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  },

  async abrirMesas(page) {
    await page.getByText(/comedor/i).first().click();
    /* Con una cuenta elegida, el panel derecho enseña lo que la mesa lleva
       consumido; vacío, la mitad de la captura es un letrero. */
    await page.getByText(/^Mesa 4$/).first().click().catch(() => {});
    await page.waitForTimeout(800);
  },

  async cortarRed(page) {
    /* El banner de sin conexión es el argumento entero del producto, así que la
       captura tiene que salir de cortar la red de verdad, no de un CSS. */
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);
  },

  /* EL CORTE Z ES LO ÚLTIMO QUE SE CAPTURA, Y NO ES CASUALIDAD: cierra el
     turno de verdad. Después de esto la caja se queda sin turno abierto y
     cualquier otra toma del POS fallaría. Va de última en TOMAS.

     El camino: concentrador -> Cerrar turno -> confirmar -> pantalla de arqueo
     -> Generar corte. La declaración se deja en blanco a propósito: así el
     recibo enseña la diferencia contra lo esperado, que es justo lo que hace
     útil un arqueo. */
  async vistaPreviaCorte(page) {
    await page.getByRole("button", { name: /cerrar turno/i }).first().click();
    await page.getByRole("button", { name: /cerrar turno$/i }).last().waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: /^S[ií], cerrar turno/i }).first().click();

    /* "Generar corte" nace DESHABILITADO: hay que declarar el efectivo contado.
       Los demás métodos vienen prellenados con lo esperado; el efectivo no,
       porque es el único que de verdad se cuenta a mano. Se teclea en vez de
       usar `fill` para que React reciba los eventos que espera. */
    const efectivo = page.locator("input").first();
    await efectivo.click();
    await page.keyboard.type("3260", { delay: 50 });
    await page.keyboard.press("Tab");

    const generar = page.getByRole("button", { name: /generar corte/i });
    await generar.waitFor({ timeout: 15000 });
    await generar.click();

    await page.locator("[data-overlay-imprimible]").waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
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

/* La pantalla de cocina se vincula como dispositivo, con las credenciales de
   la caja de la semilla. En desarrollo el formulario viene prellenado con la
   caja del fixture de Knock-Out; se sobreescribe, que si no la cocina enseña
   las comandas del negocio equivocado — o ninguna. */
async function entrarAlKds(page) {
  await page.goto(KDS, { waitUntil: "networkidle" });
  const id = page.getByLabel(/identificador del dispositivo/i);
  if (await id.isVisible().catch(() => false)) {
    await id.fill(CAJA.email);
    await page.getByLabel(/clave del dispositivo/i).fill(CAJA.password);
    await page.getByRole("button", { name: /vincular pantalla/i }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
  }
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
  if (toma.app === "kds") await entrarAlKds(page);
  if (toma.app === "pos") {
    await entrarAlPos(page);
    /* `entrarAlPos` empieza yendo a "/", así que si la toma pedía otra ruta hay
       que volver a ella. Sin esto la captura sale del concentrador con el
       nombre de otra pantalla — y como el concentrador tiene botones con
       palabras como "corte", la verificación la daba por buena. */
    if (toma.ruta !== "/") await page.goto(base + toma.ruta, { waitUntil: "networkidle" });
  }

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

  /* Las tomas de papel fotografían EL PAPEL, no la pantalla.
  
     La primera versión capturaba el viewport entero y salía el ticket flotando
     en medio del POS, con botones de la interfaz encima. Un ticket impreso no
     tiene una caja registradora de fondo: lo que se publica es el papel.
  
     El selector va por el ancho —`w-[302px]`, que es el ancho del rollo de
     80 mm— dentro del overlay. Los corchetes de Tailwind hay que escaparlos en
     CSS. Si un día cambia esa clase, la toma falla ruidosamente en vez de
     publicar una captura con medio POS dentro. */
  if (toma.papel) {
    const papel = page.locator('[data-overlay-imprimible] .w-\\[302px\\]').first();
    await papel.screenshot({ path: destino });
  } else {
    await page.screenshot({ path: destino, fullPage: false });
  }
  /* LIMPIAR DESPUÉS DE CAPTURAR.
  
     `abrirCobro` deja un ticket abierto con un producto dentro, y eso hizo
     fallar el corte Z: el turno NO se puede cerrar con cuentas pendientes.
     Tras varias corridas había trece tickets ABIERTO acumulados, todos hijos de
     esta misma herramienta.
  
     Una herramienta que ensucia el entorno que necesita es una herramienta que
     funciona una vez. Cada toma que abre un ticket lo cierra. */
  if (toma.limpiar) {
    try {
      await ACCIONES[toma.limpiar](page);
    } catch (e) {
      console.warn(`  · ${toma.id}: no se pudo limpiar (${String(e.message).slice(0, 70)})`);
    }
  }

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

/* La pantalla de cocina es un cliente del hub: en producción el escritorio le
   inyecta la dirección del gateway de la caja por `window.__VIM_SUPABASE_URL`.
   Aquí no hay escritorio, así que se inyecta la del Supabase local, que es
   donde vive el negocio de la semilla. El POS lee la misma variable y ya
   apunta ahí por su .env.local, así que no le cambia nada. */
const ANON_LOCAL = process.env.VIM_ANON_LOCAL
  ?? (await readFile(path.resolve(import.meta.dirname, "../../apps/pos/.env.local"), "utf8")).match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)?.[1];
await contexto.addInitScript(({ url, anon }) => {
  window.__VIM_SUPABASE_URL = url;
  window.__VIM_SUPABASE_ANON = anon;
}, { url: process.env.VIM_SUPABASE_LOCAL ?? "http://127.0.0.1:54321", anon: ANON_LOCAL });
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
/* `node render.mjs pos-arqueo kds` captura solo esas tomas. Sirve para repetir
   una sin rehacer las quince, o para tomar el arqueo después de limpiar la
   caja. */
const SOLO = process.argv.slice(2);
for (const toma of TOMAS.filter((t) => !SOLO.length || SOLO.includes(t.id))) {
  const hoja = toma.app === "admin" ? paginaPanel : page;
  if (await capturar(hoja, toma)) hechas++;
  if (toma.accion === "cortarRed") await hoja.context().setOffline(false);
}

await navegador.close();
console.log(`\n${hechas} de ${TOMAS.length} tomas.`);
if (hechas < TOMAS.length) console.log("Las que faltan salen arriba con el motivo.");

console.log("\nConvirtiendo a WebP:");
await aWebp();
