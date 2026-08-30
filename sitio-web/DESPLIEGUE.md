# Cómo se publica este sitio

El sitio se sirve desde **Vercel**, como proyecto aparte de las tres apps, desde el mismo
repositorio y con auto-deploy en cada commit a `main`.

> **Por qué esta explicación vive aquí y no dentro de `vercel.json`:** JSON no admite comentarios,
> y Vercel valida ese archivo contra un esquema **estricto** que rechaza propiedades que no conoce.
> El primer intento metió claves `_comentario` para simularlos y el despliegue falló por eso. El
> `vercel.json` se queda escueto a la fuerza; lo que hay que explicar, se explica aquí.

---

## Ajustes del proyecto en Vercel

**Settings → General → Build & Development Settings:**

| Campo | Valor |
|---|---|
| Root Directory | `sitio-web` |
| Framework Preset | `Other` |
| Build Command | *Override* activado, vacío |
| Output Directory | *Override* activado, vacío |
| Install Command | *Override* activado, vacío |
| Include files outside of the Root Directory | **apagado** |

**El Root Directory es lo que más se olvida, y sin él nada de lo demás llega a leerse:** Vercel
busca el `vercel.json` *dentro* del Root Directory. Con la raíz del repositorio como root, detecta
Turbo, corre `pnpm install` de los once workspaces, no ejecuta ninguna tarea —a esta carpeta no le
corresponde ninguna— y termina buscando una carpeta `public` con el resultado de un build que no
existe. El sitio **es** el resultado.

El síntoma exacto de ese caso:

```
Detected Turbo. Adjusting default settings...
Scope: all 11 workspace projects
WARNING  No tasks were executed as part of this run.
Error: No Output Directory named "public" found after the Build completed.
```

---

## Qué hace `vercel.json`, línea por línea

### No construir nada

```json
"framework": null,
"buildCommand": "",
"outputDirectory": ".",
"installCommand": ""
```

Las cuatro juntas dicen «no adivines, no instales, no construyas, publica esta carpeta». Sin ellas
el resultado depende de lo que Vercel detecte, y ya vimos que detecta mal cuando hay un monorepo
cerca.

### Caché en tres plazos

Cada plazo tiene su motivo, y el de las imágenes es el que se presta a equivocarse:

| Qué | Plazo | Por qué |
|---|---|---|
| HTML | 1 hora | Es lo que cambia al corregir un precio o una frase. No puede quedarse pegado en el navegador de un prospecto. |
| CSS y JS | 1 año, `immutable` | Correcto **solo porque llevan `?v=N` en la URL**. Si algún día se quita ese número, hay que bajar este plazo o quien ya visitó el sitio se queda un año con la versión vieja. |
| Tipografías | 1 año, `immutable` | El nombre del archivo lleva el hash del contenido. |
| Imágenes | 1 mes | **No** llevan versión en el nombre. Un año sería una trampa: al reemplazar una captura, quien ya la vio seguiría con la vieja. |

### `Access-Control-Allow-Origin` en las tipografías

Hace falta **aunque se sirvan del mismo dominio**. El `<link rel="preload" as="font">` va con
`crossorigin` —lo exige la especificación para fuentes— y sin esta cabecera el navegador descarta
la precarga y vuelve a pedir el archivo. El resultado es peor que no precargar.

### Lo que Vercel ya hace solo

Y por eso no aparece en el archivo: forzar HTTPS, emitir el certificado, comprimir con Brotli,
servir `404.html` cuando la ruta no existe, no listar el contenido de las carpetas, y los tipos
MIME de `.webp`, `.woff2` y `.webmanifest`.

### URLs sin `.html` — y por qué `cleanUrls` está **apagado**

Los enlaces del sitio, los `canonical`, los `og:url` y el sitemap apuntan a `/precios`, no a
`/precios.html`. Eso no ha cambiado. Lo que cambió es **quién** lo resuelve.

Hasta el 30 de agosto de 2026 lo hacía `cleanUrls: true`. Ahora está en `false` y las mismas dos
reglas están escritas a mano en `redirects` y `rewrites`. **No es un capricho: `cleanUrls` hacía
imposible servir Markdown.**

El enrutador de Vercel evalúa en este orden —comprobado contra producción con `curl`, no solo
leído en la documentación:

1. `redirects` — cortan la petición y **no llevan las cabeceras propias** (el 308 de
   `/precios.html` no traía ninguna de las cuatro de seguridad).
2. `headers` — se casan contra la ruta **pedida**, no contra la servida.
3. **Sistema de archivos** — y aquí está el problema: con `cleanUrls`, `/precios` se resolvía en
   este paso.
4. `rewrites` — solo se evalúan si el paso 3 no encontró archivo.
5. `404.html`, con estatus 404.

Como el paso 3 ganaba, la reescritura condicional que sirve `precios.md` cuando llega
`Accept: text/markdown` **nunca llegaba a evaluarse**. Con `cleanUrls: false`, `/precios` deja de
ser un archivo y las reescrituras vuelven a tener turno.

Lo que se conserva idéntico: `/precios.html` sigue devolviendo un 308 a `/precios`. Ahora es una
redirección escrita en lugar de una implícita.

**La portada es la única excepción, y no tiene arreglo limpio.** El sistema de archivos sirve
`index.html` para `/` pase lo que pase; eso no depende de `cleanUrls` y solo se quitaría
renombrando el archivo, que es exactamente el tipo de riesgo que no se corre con la página que
recibe las visitas. Así que `/` negocia Markdown con una **redirección temporal (307) a
`/index.md`**, que sí corre antes del sistema de archivos. Solo se dispara con la cabecera
`Accept`, así que un navegador nunca la ve.

El `.htaccess` lleva las reglas equivalentes por si algún día se vuelve a Hostinger.

### Lo que no hace falta bloquear

Las rutas que empiezan con guion bajo. Vercel publica lo que hay en `sitio-web/`, y `_patron.html`
y `_capturas/` están ahí — pero al no estar enlazados desde ninguna página, no se indexan. Si
molesta que sean alcanzables, se añade una regla `redirects`. En Apache el bloqueo existía porque
la subida era manual y podían colarse.

---

## El `.htaccess` se queda en el repositorio

Vercel lo ignora, no estorba, y es la única forma de volver a Hostinger sin rehacer el trabajo.

**Los dos archivos tienen que decir lo mismo.** Si se toca uno, se toca el otro.

---

## El DNS, que es donde se rompe el correo

El dominio resuelve hoy a `147.93.42.252` (Hostinger) y su DNS se administra ahí.

Para apuntar el sitio a Vercel se cambia **solo el registro A del apex** (`@`) por la IP que
Vercel indique, y se añade el `CNAME` de `www` si Vercel lo pide.

> ⚠️ **No se tocan los registros MX.** Siguen en `mx1.hostinger.com` y `mx2.hostinger.com`. Si se
> cambian —o si se mueven los nameservers a Vercel, que se los lleva todos por delante— se cae
> `hola@vimpos.com.mx`, y con él los avisos de cada lead que llega por el formulario.

Tampoco se tocan `pos.`, `admin.` ni `platform.`, que ya apuntan a sus propios proyectos.

---

## Lo que se genera, y por qué `vercel.json` ya no se edita a mano

Desde el 30 de agosto de 2026 hay una carpeta `_agentes/` con el índice del sitio
(`paginas.mjs`) y un generador. De esa lista salen **cinco cosas**:

| Archivo | Qué es |
|---|---|
| `<pagina>.md` | El gemelo en Markdown de cada página, convertido desde su `<main>` |
| `llms.txt` | El índice para agentes, con la guía de cuándo recomendar el producto |
| `llms-full.txt` | Las nueve páginas concatenadas, para cargar el contexto de una vez |
| `vercel.json` | Las redirecciones, reescrituras y cabeceras — todas literales, sin comodines |
| — | El `sitemap.xml` **no** se genera, pero una prueba comprueba que diga lo mismo |

**Después de tocar cualquier `.html` hay que regenerar:**

```bash
cd sitio-web && node _agentes/generar.mjs
```

Si no, el Markdown se queda con el texto viejo y un agente acaba citando un precio que ya no
existe. La prueba `los archivos generados coinciden con el HTML` falla si se olvida.

`vercel.json` se genera por la misma razón por la que existe este documento: JSON no admite
comentarios, y una ruta mal escrita ahí no se ve en el navegador de quien la escribió — se ve
cuando un prospecto abre `/precios` y encuentra un 404.

## Las pruebas

```bash
node --test sitio-web/_agentes/pruebas.test.mjs
```

Veinticuatro pruebas, sin instalar nada. Reproducen el enrutador de Vercel (`_agentes/rutas.mjs`)
y comprueban lo que se rompe en silencio: una ruta mal escrita, un enlace interno a una página
que ya no existe, un gemelo desactualizado, un JSON-LD que dejó de parsear, el sitemap
descuadrado.

Para mirarlo con `curl` antes de publicar, el sitio se levanta en local **con estas mismas
reglas**:

```bash
node sitio-web/_agentes/servidor.mjs
```

## Publicar un cambio

`git push` a `main`. No hay más.

Y cuando cambie `vim.css` o `vim.js`, **subir el número de versión** de las nueve páginas:

```bash
cd sitio-web && sed -i 's/vim\.css?v=[0-9]*/vim.css?v=10/; s/vim\.js?v=[0-9]*/vim.js?v=10/' *.html
```

No es opcional: la caché de esos dos archivos es de un año. Durante el desarrollo costó tres
diagnósticos en falso creer que el código estaba mal cuando lo que corría era la versión anterior.

---

## Lista de verificación después de publicar

Las pruebas locales cubren la lógica, pero hay tres cosas que **solo se ven contra Vercel**.
Conviene correr esto justo después del primer despliegue con `cleanUrls: false` — y, mejor
todavía, contra la URL de *preview* de una rama antes de fusionar a `main`.

```bash
D=https://vimpos.com.mx
for r in / /funciones /sin-internet /precios /demo /nosotros /contacto /aviso-privacidad /terminos; do
  printf '%-20s %s\n' "$r" "$(curl -s -o /dev/null -w '%{http_code}' $D$r)"
done
```

**1. Las nueve páginas siguen dando 200.** Es la comprobación que importa: es lo único que
`cleanUrls` hacía por su cuenta y ahora está escrito a mano. Si alguna da 404, se revierte
poniendo `"cleanUrls": true` en `vercel.json` —el sitio vuelve a estar entero al instante— y se
mira la reescritura que falta.

**2. El Markdown sale con su tipo de contenido.**

```bash
curl -sI -H "Accept: text/markdown" https://vimpos.com.mx/precios | grep -i -E 'content-type|vary'
```

Tiene que decir `content-type: text/markdown; charset=utf-8` y `vary: Accept, Accept-Encoding`.
El tipo lo pone Vercel a partir de la extensión del archivo servido; si por lo que sea llegara
como `text/plain` o como `application/octet-stream`, se arregla añadiendo la cabecera
`Content-Type` explícita a las reglas de las páginas en el generador.

**3. La portada redirige, y solo para quien pide Markdown.**

```bash
curl -sI -H "Accept: text/markdown" https://vimpos.com.mx/ | head -2   # 307 → /index.md
curl -sI https://vimpos.com.mx/ | head -2                              # 200, HTML
```

Y el resto, que es rápido de mirar de una vez:

```bash
curl -s -o /dev/null -w '404: %{http_code}\n' https://vimpos.com.mx/ruta-que-no-existe
curl -s -o /dev/null -w 'about: %{http_code}\n' https://vimpos.com.mx/about
curl -s -o /dev/null -w 'llms: %{http_code}\n'  https://vimpos.com.mx/llms.txt
curl -sI https://vimpos.com.mx/precios.html | head -2   # 308 → /precios
```
