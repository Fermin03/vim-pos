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

export default async function middleware(peticion: Request): Promise<Response> {
  const url = new URL(peticion.url);
  const enMarkdown = prefiereMarkdown(peticion.headers.get('accept'));
  const origen = new URL(enMarkdown ? '/404.md' : '/404.html', url);

  try {
    // Ninguno de los dos destinos despierta al middleware —«404» está en la
    // lista de exclusión—, así que esto no se llama a sí mismo.
    const respuesta = await fetch(origen);
    if (!respuesta.ok) throw new Error(`${origen.pathname} devolvió ${respuesta.status}`);

    return new Response(await respuesta.text(), {
      status: 404,
      headers: {
        ...SEGURIDAD,
        'Content-Type': enMarkdown
          ? 'text/markdown; charset=utf-8'
          : 'text/html; charset=utf-8',
      },
    });
  } catch {
    // Si la página de error no se puede leer, se contesta igual: un 404 con lo
    // mínimo para que quien preguntó sepa a dónde ir. Quedarse callado sería
    // peor que quedarse feo.
    return new Response(
      [
        '# 404 — esta dirección no existe',
        '',
        'VIM POS · punto de venta para restaurantes en México.',
        '',
        '- [Mapa para agentes](https://vimpos.com.mx/llms.txt)',
        '- [Instrucciones para agentes](https://vimpos.com.mx/agents.md)',
        '- [Índice de direcciones](https://vimpos.com.mx/sitemap.xml)',
        '- [Inicio](https://vimpos.com.mx/index.md)',
        '',
      ].join('\n'),
      {
        status: 404,
        headers: { ...SEGURIDAD, 'Content-Type': 'text/markdown; charset=utf-8' },
      },
    );
  }
}
