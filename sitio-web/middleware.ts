// ════════════════════════════════════════════════════════════════════════════
// El 404, para agentes.
//
// Es lo ÚNICO que hace este archivo, y el `matcher` es la mitad importante:
// solo se ejecuta en direcciones que no existen. Una petición a /precios, a
// /precios.md o a cualquier cosa bajo /assets ni siquiera lo despierta.
//
// Por qué hace falta código para esto: Vercel sirve `404.html` para toda ruta
// desconocida, con estatus 404 y sin mirar la cabecera `Accept`. No hay forma
// declarativa de devolver un cuerpo en Markdown conservando el 404 — un
// `rewrite` a /404.md respondería 200, que es exactamente lo que no se quiere:
// un 200 en una ruta inexistente le hace creer al agente que todas existen.
//
// Por qué NO usa `@vercel/functions`: porque nunca necesita dejar pasar una
// petición. Como el matcher solo lo despierta en rutas muertas, siempre
// devuelve una respuesta propia, y así este sitio sigue sin una sola
// dependencia de npm y sin paso de instalación (ver DESPLIEGUE.md).
//
// Está en TypeScript por una razón tonta y real: sin `package.json` no hay
// `"type": "module"`, así que un `.js` con `export default` se leería como
// CommonJS y fallaría. Vercel solo reconoce `.js` y `.ts` como punto de
// entrada. No hay tipos aquí que TypeScript aporte; es la extensión, nada más.
// ════════════════════════════════════════════════════════════════════════════

export const config = {
  // Prefijos que NO despiertan al middleware. Se comparan como prefijo, no
  // como ruta exacta, y eso es deliberado: equivocarse de más deja alguna ruta
  // muerta sin su 404 en Markdown —molesto—, mientras que equivocarse de menos
  // se traga una página de verdad —grave—. El error barato es el de más.
  //
  // `.+` en vez de `.*` al final excluye la portada: «/» a secas no entra.
  //
  // La prueba `el matcher del middleware no toca ninguna ruta real` comprueba
  // esta expresión contra TODOS los archivos que hay en la carpeta. Si se añade
  // una página y se olvida este renglón, falla ahí y no en producción.
  // La SEGUNDA condición es la del 30-ago-2026, y arregla una trampa que no se
  // veía: la lista de arriba protege las páginas que existen HOY, así que
  // cualquier archivo nuevo en la raíz caía al middleware y devolvía 404 aunque
  // estuviera en su sitio. Comprobado antes de arreglarlo:
  //
  //     /indexnow-913…txt   200   se salvaba SOLO por empezar con «index»
  //     /google1a2b3c.html  404   verificación de Search Console por archivo
  //     /BingSiteAuth.xml   404
  //     /ads.txt            404
  //
  // Que IndexNow funcionara era una casualidad. Y explica por qué verificar
  // Search Console con el método de «sube este archivo HTML» habría fallado sin
  // decir por qué.
  //
  // La regla: si el ÚLTIMO segmento tiene extensión, no es una página — es un
  // archivo, y el sistema de archivos sabe qué hacer con él. Se exceptúa `.md`
  // porque los gemelos para agentes sí son páginas, y una ruta muerta acabada
  // en `.md` merece el 404 en Markdown igual que una sin extensión.
  //
  // `[.]` en vez de `\.` NO es manía: esto es un string literal, y en JS `'\.'`
  // se convierte en `'.'` sin avisar. Con la barra perdida el patrón casa con
  // cualquier cosa, el lookahead falla siempre y el middleware deja de correr
  // en TODAS las rutas muertas. Se descubrió escribiendo esta misma línea.
  //
  // `[^/]*` y no `.*` para que solo mire el último segmento: en `/foo.bar/baz`
  // lo que cuenta es `baz`, que no tiene extensión y sí es una ruta muerta.
  //
  // Y la excepción de la excepción: `vercel.json` y `middleware.ts` TIENEN que
  // seguir cubiertos. No pueden ir en `.vercelignore` —Vercel lee el primero
  // para enrutar y construye el segundo— así que esto es lo único que los tapa.
  // La primera versión de esta regla los destapaba, y lo cazó la prueba «el
  // matcher del middleware no toca NINGUNA ruta real» antes de llegar a
  // producción. Habría reabierto justo el agujero que se cerró el 30 de agosto.
  // ⚠️ MANTENIMIENTO — este matcher NO es el de siempre.
  //
  // `/(.*)` es todo: la portada, las páginas, los .md, /assets, el sitemap y el
  // favicon. Nada llega al contenido estático mientras esto esté aquí. Es lo
  // que apaga el sitio desde el código, y lo que hay que deshacer para
  // encenderlo (ver MANTENIMIENTO, más abajo).
  matcher: ['/(.*)'],
};

// ── El apagado temporal ─────────────────────────────────────────────────────
//
// Puesto el 6 de septiembre de 2026, a petición del dueño, por seguridad. El
// sitio contesta 503 a todo mientras esto valga `true`.
//
// POR QUÉ 503 Y NO 404 NI 200:
// un 503 con `Retry-After` es la única respuesta que le dice a un buscador
// «esto vuelve»; ante un 404 desindexa las páginas y ante un 200 se guarda
// como contenido la propia página de apagado. Si el sitio vuelve, vuelve con
// su posicionamiento intacto.
//
// PARA ENCENDER EL SITIO, dos cambios y ninguno más:
//   1. `MANTENIMIENTO = false`
//   2. `matcher: MATCHER_404` (la constante de aquí abajo, tal cual)
// Las pruebas de `_agentes/pruebas.test.mjs` siguen comprobando MATCHER_404 en
// los dos estados, así que el matcher del 404 no se pudre mientras espera.
export const MANTENIMIENTO = true;

// El matcher del 404, el de siempre, intacto. No se usa mientras el sitio esté
// apagado; existe para poder devolverlo a `config.matcher` sin reconstruirlo de
// memoria, y para que las pruebas lo sigan vigilando.
export const MATCHER_404 = [
  '/((?!assets|_|404|about|agents|AGENTS|apple-touch|aviso-privacidad|como-elegir-sistema-restaurante|cuanto-cuesta-un-sistema-para-restaurante|contact|demo|facturacion-cfdi|favicon|funciones|index|llms|nosotros|precios|privacy|robots|sin-internet|site|terminos|terms)(?!(?!vercel[.]json$|middleware[.]ts$)[^/]*[.](?!md$)[A-Za-z0-9]+$).+)',
];

// Las cinco de siempre. Van a mano porque una respuesta creada aquí se salta
// la fase `headers` de vercel.json: el middleware corre antes que todo.
const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://pbiaxzvmssjsxdwqrumb.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://tagassistant.google.com; form-action 'self'",
  // La misma dirección devuelve HTML o Markdown según lo que pidan. Sin esto,
  // una caché compartida guarda la primera de las dos y se la da a todos.
  Vary: 'Accept, Accept-Encoding',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  // Para quien reciba el HTML y no sepa que hay otra versión. Es la misma
  // cabecera que llevan las páginas normales apuntando a su gemelo.
  Link: '<https://vimpos.com.mx/404.md>; rel="alternate"; type="text/markdown"',
};

// ¿Este cliente ha pedido HTML de forma EXPLÍCITA?
//
// La respuesta decide qué cuerpo lleva el 404, y el matiz está en «explícita».
// La primera versión servía HTML salvo que pidieran Markdown por su nombre, y
// eso dejaba el punto a medias en la auditoría: su comprobación es un `curl`
// pelado, y curl manda `Accept: */*`, así que recibía la página en HTML. Un
// comodín no es una preferencia — es «lo que tengas». Y lo que un agente
// perdido necesita es un mapa que pueda leer, no una página maquetada.
//
// Así que en un 404 el HTML solo gana si alguien lo nombró:
//
//   (sin cabecera)                          → Markdown
//   `*/*`                                   → Markdown
//   `text/markdown`                         → Markdown
//   `application/json`                      → Markdown
//   `text/html,...,*/*;q=0.8` (navegador)   → HTML
//   `text/markdown;q=0.1, text/html;q=0.9`  → HTML
//   `text/html;q=0.9, text/markdown`        → Markdown
//
// Los factores de calidad se miran de verdad, que es donde falla casi todo el
// mundo. Y ojo: esto vale SOLO para el 404. Las páginas de verdad las negocia
// `vercel.json`, y ahí sigue haciendo falta nombrar `text/markdown`: la
// representación canónica de una página es su HTML.
export function prefiereHtml(accept: string | null): boolean {
  if (!accept) return false;

  let markdown = 0;
  let html = 0;

  for (const parte of accept.split(',')) {
    const [tipoCrudo, ...parametros] = parte.trim().split(';');
    const tipo = tipoCrudo.trim().toLowerCase();
    const q = parametros
      .map((p) => p.trim())
      .filter((p) => p.startsWith('q='))
      .map((p) => Number(p.slice(2)))
      .find((n) => Number.isFinite(n));
    const calidad = q === undefined ? 1 : q;

    if (tipo === 'text/markdown' || tipo === 'text/x-markdown') {
      markdown = Math.max(markdown, calidad);
    } else if (tipo === 'text/html' || tipo === 'application/xhtml+xml') {
      // `*/*` y `text/*` NO cuentan: son comodines, no una petición de HTML.
      html = Math.max(html, calidad);
    }
  }

  return html > markdown;
}

// El 404 en Markdown va escrito aquí y no se pide al origen. Se probó de la
// otra forma —un `fetch` a /404.md— y el despliegue de preview lo dejó al
// descubierto: como está detrás del SSO de Vercel, esa petición interna no
// lleva sesión y volvía con la página de inicio de sesión, 340 KB de HTML
// servidos como `text/markdown`. En producción habría funcionado, pero un 404
// que depende de que el servidor pueda hablar consigo mismo es un 404 frágil.
//
// Y encaja con lo que se pide: un cuerpo CORTO que diga a dónde ir. La versión
// larga —el gemelo de la página de error— sigue existiendo en /404.md.
export const CUERPO_MARKDOWN = [
  '# 404 — esta dirección no existe',
  '',
  '> VIM POS · punto de venta para restaurantes en México. La dirección que pediste no',
  '> existe o cambió de sitio. Aquí está por dónde seguir.',
  '',
  '## Por dónde seguir',
  '',
  '- [Instrucciones para agentes](https://vimpos.com.mx/agents.md): cuándo usar VIM POS, cuándo no, y qué hacer después.',
  '- [Índice del sitio para agentes](https://vimpos.com.mx/llms.txt): todo lo que hay y dónde está.',
  '- [El sitio entero en un archivo](https://vimpos.com.mx/llms-full.txt).',
  '- [Índice de direcciones](https://vimpos.com.mx/sitemap.xml): el sitemap en XML.',
  '',
  '## Las páginas, en Markdown',
  '',
  '- [Inicio](https://vimpos.com.mx/index.md)',
  '- [Funciones](https://vimpos.com.mx/funciones.md)',
  '- [Sin internet](https://vimpos.com.mx/sin-internet.md)',
  '- [Precios](https://vimpos.com.mx/precios.md)',
  '- [Pide una demo](https://vimpos.com.mx/demo.md)',
  '- [Nosotros](https://vimpos.com.mx/nosotros.md)',
  '- [Contacto](https://vimpos.com.mx/contacto.md)',
  '',
  'Contacto: hola@vimpos.com.mx · hola@vimpos.com.mx',
  '',
].join('\n');

const CUERPO_HTML_MINIMO = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><title>Esta página no existe — VIM POS</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"></head>
<body><h1>Esta página no existe</h1>
<p>O la dirección está mal escrita, o algo se movió de sitio.</p>
<ul><li><a href="/">Inicio</a></li><li><a href="/precios">Precios</a></li>
<li><a href="/contacto">Contacto</a></li><li><a href="/sitemap.xml">Mapa del sitio</a></li></ul></body></html>
`;

// La página del apagado, en HTML y en Markdown. Va escrita aquí, como el 404 en
// Markdown y por el mismo motivo: una respuesta que depende de que el servidor
// pueda leer un archivo del propio sitio es una respuesta frágil, y con el
// matcher en `/(.*)` ese archivo tampoco se podría servir.
const MANTENIMIENTO_MD = [
  '# VIM POS — el sitio está apagado temporalmente',
  '',
  '> El sitio de VIM POS no está disponible en este momento. No es una avería:',
  '> se apagó a propósito y volverá.',
  '',
  'El producto sigue funcionando con normalidad: esto afecta solo a la página',
  'pública, no a las cajas ni al panel de los clientes.',
  '',
  'Para cualquier cosa: hola@vimpos.com.mx',
  '',
].join('\n');

const MANTENIMIENTO_HTML = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8">
<title>Volvemos pronto — VIM POS</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #0f1115; color: #e7e9ee; padding: 24px; }
  main { max-width: 34rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .75rem; letter-spacing: -.01em; }
  p { margin: 0 0 .75rem; color: #b6bcc9; }
  a { color: #e7e9ee; }
  .marca { font-weight: 700; letter-spacing: .04em; font-size: .8rem;
           text-transform: uppercase; color: #8b93a5; margin: 0 0 1.5rem; }
</style></head>
<body><main>
  <p class="marca">VIM POS</p>
  <h1>Volvemos pronto</h1>
  <p>El sitio está apagado temporalmente. No es una avería: lo apagamos a propósito y volverá.</p>
  <p>El producto sigue funcionando con normalidad. Esto afecta solo a esta página pública,
     no a las cajas ni al panel de los clientes.</p>
  <p>Para cualquier cosa: <a href="mailto:hola@vimpos.com.mx">hola@vimpos.com.mx</a></p>
</main></body></html>
`;

function respuestaMantenimiento(peticion: Request): Response {
  // Se reutiliza la misma negociación que el 404: quien no pida HTML por su
  // nombre —curl, un agente, un script— recibe Markdown, que puede leer.
  const html = prefiereHtml(peticion.headers.get('accept'));
  return new Response(html ? MANTENIMIENTO_HTML : MANTENIMIENTO_MD, {
    status: 503,
    headers: {
      ...SEGURIDAD,
      'Content-Type': html
        ? 'text/html; charset=utf-8'
        : 'text/markdown; charset=utf-8',
      // Una hora. No promete la vuelta: le dice al buscador que reintente y que
      // no dé las páginas por muertas.
      'Retry-After': '3600',
      // Que nadie —ni caché intermedia ni navegador— se guarde el apagado y lo
      // siga enseñando cuando el sitio vuelva.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default async function middleware(peticion: Request): Promise<Response> {
  // Lo primero de todo, antes que la negociación del 404: mientras el sitio esté
  // apagado no hay ninguna otra respuesta posible.
  if (MANTENIMIENTO) return respuestaMantenimiento(peticion);

  return respuesta404(peticion);
}

// El 404 de siempre, tal cual estaba, movido a su propia función exportada.
//
// El motivo es la prueba, no el código: mientras `MANTENIMIENTO` valga `true`,
// llamar al middleware devuelve 503 y las dos pruebas del 404 no podrían
// comprobar nada. Sacándolo aquí siguen cubriéndolo, y así el 404 no se pudre
// mientras el sitio está apagado — que es exactamente cuando nadie lo miraría.
export async function respuesta404(peticion: Request): Promise<Response> {
  if (!prefiereHtml(peticion.headers.get('accept'))) {
    return new Response(CUERPO_MARKDOWN, {
      status: 404,
      headers: { ...SEGURIDAD, 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  // Para un navegador sí se pide la página de error de verdad, que es la que
  // está diseñada. «404» está en la lista de exclusión del matcher, así que
  // esta petición no vuelve a despertar al middleware.
  let html = CUERPO_HTML_MINIMO;
  try {
    const respuesta = await fetch(new URL('/404.html', peticion.url));
    const texto = await respuesta.text();
    // Se comprueba que sea NUESTRA página y no otra cosa. «Que sea HTML» no
    // basta: en el despliegue de preview volvía la pantalla de acceso de
    // Vercel, que también empieza por `<!doctype html>` y se colaba entera con
    // estatus 404. Se busca además el ancla del salto al contenido, que está en
    // todas las páginas de este sitio y en ninguna ajena. Es una marca
    // estructural, así que sobrevive a que se reescriba el texto de la página.
    const esNuestra =
      /^\s*<!doctype html>/i.test(texto) && texto.includes('id="contenido"');
    if (respuesta.ok && esNuestra) html = texto;
  } catch {
    // Se queda la mínima.
  }

  return new Response(html, {
    status: 404,
    headers: { ...SEGURIDAD, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
