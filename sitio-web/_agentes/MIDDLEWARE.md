# El middleware que no se puso (y qué haría falta para ponerlo)

**Fecha:** 30 de agosto de 2026.
**Estado:** no implementado. Se documenta porque la decisión se tomó con información que
resultó estar mal, y el siguiente que lo intente merece saber dónde está la trampa.

## Qué falta sin él

Con la solución estática que sí está puesta, la negociación de Markdown funciona en las nueve
páginas. Lo que **no** se puede hacer sin un componente que ejecute código:

| Comprobación de acceptmarkdown.com | Estado |
|---|---|
| Sirve Markdown con `Accept: text/markdown` | ✅ (la portada, con un 307) |
| Manda `Vary: Accept` | ✅ |
| Devuelve `406` a un tipo que no sabe servir | ❌ |
| Respeta los factores de calidad (`q=`) | ⚠️ parcial |
| Cuerpo en Markdown en la respuesta 404 | ❌ |

De los factores `q`: `Accept: text/html;q=0.9, text/markdown` recibe Markdown, que es correcto.
`Accept: text/markdown;q=0.1, text/html;q=0.9` también recibe Markdown, y no debería. Es el caso
raro: un cliente que menciona Markdown solo para decir que casi no lo quiere.

El `406` es discutible incluso como objetivo. Un cliente con una cabecera `Accept` rara —y los
hay— preferiría recibir la página antes que un error. Servir HTML por defecto es la conducta
segura.

## La trampa

La idea original era un `middleware.js` con un `matcher` que solo se activara con la cabecera
`Accept: text/markdown`. Así un navegador nunca lo invocaría: cero latencia y cero costo para el
tráfico humano.

**Eso no se puede.** La documentación de Vercel para proyectos sin framework dice que
`config.matcher` y `proxy.matcher` aceptan *rutas*, no condiciones sobre cabeceras:

> `matcher` (optional): A path matcher starting with `/`, or an array of path matchers starting
> with `/`, that defines which requests run your Routing Middleware.

Los objetos con `has` / `missing` son de Next.js. Aquí no hay Next.js.

Consecuencia: el middleware se ejecutaría **delante de todo el tráfico humano** de las rutas que
cubriera. Y para dejar pasar una petición que no quiere interceptar necesita `next()`, que viene
de `@vercel/functions` — un paquete de npm. Es decir:

- `sitio-web/package.json`, que hoy no existe;
- `installCommand` dejando de estar vacío, que es justo lo que este documento explica por qué
  está vacío;
- una dependencia de terceros en un sitio que no tiene ninguna a propósito (tipografías
  autoalojadas, sin scripts externos, con una CSP pendiente que sería trivial de escribir gracias
  a eso).

La alternativa a la dependencia es devolver a mano `new Response(null, { headers: {
'x-middleware-next': '1' } })`, que es exactamente lo que hace `next()` por dentro. Es un
protocolo interno, no documentado. Si Vercel lo cambia, **todas las páginas devuelven una
respuesta vacía**. En el sitio que genera los leads, no.

## Qué haría falta para ponerlo

Si algún día compensa —por ejemplo, si el tráfico de agentes crece hasta importar más que estos
inconvenientes— el camino es éste, y **se prueba primero en una rama con su URL de preview**,
nunca directo a `main`:

```js
// sitio-web/middleware.js
import { next } from '@vercel/functions';

const GEMELOS = new Map([
  ['/', '/index.md'],
  ['/funciones', '/funciones.md'],
  ['/sin-internet', '/sin-internet.md'],
  ['/precios', '/precios.md'],
  ['/demo', '/demo.md'],
  ['/nosotros', '/nosotros.md'],
  ['/about', '/nosotros.md'],
  ['/contacto', '/contacto.md'],
  ['/contact', '/contacto.md'],
  ['/aviso-privacidad', '/aviso-privacidad.md'],
  ['/privacy', '/aviso-privacidad.md'],
  ['/terminos', '/terminos.md'],
  ['/terms', '/terminos.md'],
]);

// Analiza el Accept de verdad, con factores de calidad.
function prefiere(accept = '') {
  let md = 0;
  let html = 0;
  for (const parte of accept.split(',')) {
    const [tipo, ...params] = parte.trim().split(';');
    const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
    if (/^text\/(x-)?markdown$/.test(tipo.trim())) md = Math.max(md, q);
    if (/^(text\/html|application\/xhtml\+xml|\*\/\*|text\/\*)$/.test(tipo.trim())) {
      html = Math.max(html, q);
    }
  }
  return { md, html };
}

export default async function middleware(peticion) {
  try {
    const url = new URL(peticion.url);
    const { md, html } = prefiere(peticion.headers.get('accept'));

    if (md === 0 || md <= html) return next();

    const gemelo = GEMELOS.get(url.pathname);
    const destino = new URL(gemelo ?? '/404.md', url);
    const respuesta = await fetch(destino);

    return new Response(respuesta.body, {
      status: gemelo ? 200 : 404,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        Vary: 'Accept, Accept-Encoding',
        'Cache-Control': 'public, max-age=3600, must-revalidate',
      },
    });
  } catch {
    // Ante cualquier fallo, la petición sigue su camino. Un sitio que responde
    // vale más que una cabecera correcta.
    return next();
  }
}
```

Y en `vercel.json`, `"proxy": { "entrypoint": "middleware.js" }` — o dejar que Vercel lo detecte
por el nombre.

Con eso puesto, sobran del `vercel.json` las doce reescrituras condicionales y la redirección 307
de la portada: las haría el middleware, y la portada devolvería 200 en lugar de 307.

**Antes de fusionar, contra la URL de preview:**

```bash
P=https://<preview>.vercel.app
curl -sI $P/                         | head -2   # 200 y HTML
curl -sI -H 'Accept: text/markdown' $P/          # 200 y text/markdown, sin redirección
curl -sI -H 'Accept: text/markdown' $P/no-existe # 404 y text/markdown
for r in / /funciones /precios /demo /nosotros /contacto; do
  curl -s -o /dev/null -w "$r %{http_code}\n" $P$r
done
```

Si alguna de las páginas normales deja de dar 200, el middleware está tragándose tráfico humano:
se borra el archivo y se vuelve al estado de hoy.
