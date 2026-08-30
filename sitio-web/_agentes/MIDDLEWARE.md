# El middleware del 404

**Archivo:** `sitio-web/middleware.ts`. **Puesto el 30 de agosto de 2026**, después de un primer
intento descartado. Aquí está por qué existe, por qué es como es, y qué se rompe si se toca mal.

## Qué hace, y nada más

Devuelve el 404 con **cuerpo en Markdown** cuando quien pregunta manda
`Accept: text/markdown`, y con la página de siempre cuando es un navegador. En los dos casos con
estatus **404 de verdad**.

Eso no se puede hacer de forma declarativa: Vercel sirve `404.html` para toda ruta desconocida sin
mirar la cabecera `Accept`, y una reescritura a `/404.md` respondería **200** — que es justo lo
que la auditoría marca como el error grave, porque le hace creer al agente que todas las
direcciones existen.

## El `matcher` es la mitad importante

```
/((?!assets|_|404|about|agents|AGENTS|apple-touch|aviso-privacidad|contact|demo|favicon|funciones|index|llms|nosotros|precios|privacy|robots|sin-internet|site|terminos|terms).+)
```

El middleware corre **antes que todo**: antes de las redirecciones, antes del sistema de archivos.
Si esta expresión cubriera una página de verdad, esa página serviría el 404. De ahí tres
decisiones:

- **Los prefijos se comparan como prefijo, no como ruta exacta.** `precios` tapa `/precios`,
  `/precios.md`, `/precios.html` y `/precios/`. También tapa `/precios-2024`, que no existe y se
  queda sin su 404 en Markdown. Ése es el error barato; el caro es el contrario.
- **Termina en `.+` y no en `.*`**, para que la portada —`/` a secas— no entre.
- **`contact` cubre `contacto`; `site` cubre `sitemap.xml` y `site.webmanifest`.**

La prueba `el matcher del middleware no toca NINGUNA ruta real` recorre **todos los archivos de la
carpeta** y falla si alguno cae dentro. No hay una lista escrita a mano que se pueda quedar corta:
si mañana se añade una página y se olvida este renglón, falla la prueba, no producción.

## Por qué no usa `@vercel/functions`

Porque nunca necesita dejar pasar una petición. Como el matcher solo lo despierta en rutas
muertas, siempre devuelve una respuesta propia — y así no hace falta `next()`, que es lo único que
habría obligado a meter un `package.json`, un `installCommand` y una dependencia de npm en un
sitio que a propósito no tiene ninguna de las tres.

## El cuerpo en Markdown va escrito dentro, y eso lo enseñó el preview

La primera versión pedía `/404.md` a su propio origen con `fetch`. El despliegue de preview lo
tumbó de inmediato: como está detrás del SSO de Vercel, esa petición interna no lleva sesión y
volvía **200 con la pantalla de inicio de sesión** — 340 KB de HTML servidos como
`text/markdown`. En producción habría funcionado y nadie se habría enterado.

Ahora el Markdown es una constante del propio archivo: corto, sin depender de que el servidor
pueda hablar consigo mismo, y es lo que se pide («a short markdown body»). La versión larga —el
gemelo de la página de error— sigue en `/404.md` para quien la quiera.

Para el caso HTML sí se pide `/404.html`, porque esa página está diseñada y no tiene sentido
duplicarla. Pero se comprueba que lo que vuelve **empiece por `<!doctype html>`**; si no, se sirve
una versión mínima escrita aquí. Servir cualquier cosa con estatus 404 es peor que servir algo
feo.

## Por qué está en TypeScript

Por nada relacionado con los tipos: sin `package.json` no hay `"type": "module"`, así que un `.js`
con `export default` se leería como CommonJS y fallaría. Vercel solo admite `.js` o `.ts` como
punto de entrada. Node lo importa en las pruebas quitándole los tipos al vuelo.

## El efecto colateral que se aceptó a sabiendas

`/vercel.json`, `/DESPLIEGUE.md`, `/.htaccess` y `/middleware.ts` **quedan tapados con un 404**.
Hoy Vercel los sirve con 200 —comprobado— y `DESPLIEGUE.md` publica la IP del servidor viejo y el
reparto de subdominios.

Que dejen de verse es una mejora, pero **no es un control de seguridad**: si el middleware
desaparece, vuelven a ser públicos. El arreglo de verdad es un `.vercelignore` que no los suba, y
eso es una decisión aparte que no se tomó aquí. `_patron.html` y `_agentes/` siguen siendo
públicos: el prefijo `_` está excluido del matcher.

## Lo que sigue sin hacer

De las cuatro comprobaciones de [acceptmarkdown.com](https://acceptmarkdown.com):

| Comprobación | Estado |
|---|---|
| Sirve Markdown con `Accept: text/markdown` | ✅ |
| Manda `Vary: Accept` | ✅ |
| Respeta los factores de calidad (`q=`) | ✅ en el 404, ⚠️ parcial en las páginas |
| Devuelve `406` a un tipo que no sabe servir | ❌ y a propósito |

Las páginas normales negocian con una reescritura de `vercel.json`, que solo sabe mirar si el
`Accept` contiene `text/markdown` — no sus factores de calidad. El middleware sí los mira, pero
solo se ejecuta en rutas muertas. Igualarlo obligaría a poner el middleware delante de todo el
tráfico, y eso ya se descartó.

El `406` es discutible como objetivo: un cliente con un `Accept` raro —y los hay— prefiere recibir
la página antes que un error. Servir HTML por defecto es la conducta segura.

## Si algo sale mal

Se borra `sitio-web/middleware.ts` y se publica. El sitio vuelve al estado anterior: 404 correcto,
pero con cuerpo en HTML para todo el mundo. Ninguna otra pieza depende de este archivo.
