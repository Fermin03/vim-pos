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
  matcher: [
    '/((?!assets|_|404|about|agents|AGENTS|apple-touch|aviso-privacidad|contact|demo|favicon|funciones|index|llms|nosotros|precios|privacy|robots|sin-internet|site|terminos|terms).+)',
  ],
};

// Las cuatro de siempre. Van a mano porque una respuesta creada aquí se salta
// la fase `headers` de vercel.json: el middleware corre antes que todo.
const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  // La misma dirección devuelve HTML o Markdown según lo que pidan. Sin esto,
  // una caché compartida guarda la primera de las dos y se la da a todos.
  Vary: 'Accept, Accept-Encoding',
  'Cache-Control': 'public, max-age=0, must-revalidate',
};

// ¿Este cliente prefiere Markdown a HTML?
//
// Mira los factores de calidad de verdad, que es donde fallan casi todas las
// implementaciones: `text/html;q=0.9, text/markdown` pide Markdown, mientras
// que `text/markdown;q=0.1, text/html` NO lo pide aunque lo nombre. Y el
// comodín de «acepto cualquier cosa» tampoco cuenta como pedir Markdown: un
// cliente que acepta todo se queda con el HTML, que es lo que espera.
export function prefiereMarkdown(accept: string | null): boolean {
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
    } else if (
      tipo === 'text/html' ||
      tipo === 'application/xhtml+xml' ||
      tipo === 'text/*' ||
      tipo === '*/*'
    ) {
      html = Math.max(html, calidad);
    }
  }

  return markdown > 0 && markdown >= html;
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
  'Contacto: hola@vimpos.com.mx · WhatsApp +52 476 127 3020',
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

export default async function middleware(peticion: Request): Promise<Response> {
  if (prefiereMarkdown(peticion.headers.get('accept'))) {
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
    // Se comprueba que sea la página y no otra cosa —una pantalla de acceso,
    // un error del origen—: servir cualquier cosa con estatus 404 es peor que
    // servir la versión mínima de aquí abajo.
    if (respuesta.ok && /^\s*<!doctype html>/i.test(texto)) html = texto;
  } catch {
    // Se queda la mínima.
  }

  return new Response(html, {
    status: 404,
    headers: { ...SEGURIDAD, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
