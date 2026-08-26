# Publicar vimpos.com.mx

> **Qué es esto:** los pasos para llevar `sitio-web/` de la carpeta local a `vimpos.com.mx` en
> Hostinger. Es la fase 7 del plan del sitio.
>
> El sitio es HTML estático: no hay build, ni Node, ni PHP. Se copian archivos y ya. Lo que sí
> tiene truco es lo de alrededor — el CORS, el `.htaccess` que el FTP esconde, y el DNS.

---

## 0. Antes de subir nada

Estas cuatro cosas se hacen **primero**. Las tres primeras están rotas hoy y el sitio publicado
con ellas rotas se ve bien y no funciona, que es la peor combinación.

### 0.1 — El CORS de producción no incluye el apex ⚠️ **bloqueante**

Hoy `VIM_CORS_ORIGINS` en Supabase vale, según `docs/RUNBOOK-GOLIVE.md`:

```
https://pos.vimpos.com.mx,https://admin.vimpos.com.mx,https://platform.vimpos.com.mx
```

`https://vimpos.com.mx` **no está**. Y `_shared/cors.ts` es fail-closed: si el origen no está en
la lista, devuelve el primero de la lista en vez del origen real, y el navegador bloquea la
lectura. Resultado: el formulario de demo falla en producción con un error de CORS en consola y
**el visitante solo ve «no se pudo enviar»**.

```bash
supabase secrets set VIM_CORS_ORIGINS="https://vimpos.com.mx,https://www.vimpos.com.mx,https://pos.vimpos.com.mx,https://admin.vimpos.com.mx,https://platform.vimpos.com.mx"
```

Va `www` también aunque el `.htaccess` redirija: la redirección ocurre en el navegador, pero si
alguien llega por `www` y el JS se ejecuta antes del salto, la petición sale con ese origen.

### 0.2 — Falta el anon key en `vim.js` ⚠️ **bloqueante**

En `sitio-web/assets/js/vim.js`, arriba del todo:

```js
var ANON = "";   // ← pegar aquí
```

Se saca de **Supabase → Project Settings → API → anon public**. Es la misma que ya está en Vercel
como `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Es pública por diseño —viaja en el bundle de cualquier app
de Supabase—, así que no hay problema en que esté en un archivo servido.

Lo que **nunca** va aquí es la `service_role`.

Mientras esté vacía el formulario no se rompe: cae a WhatsApp con los datos ya escritos. Pero
entonces el prospecto no queda en la tabla, que era el punto.

### 0.3 — La Edge Function no está desplegada

```bash
supabase functions deploy solicitar-demo
```

`supabase/config.toml` ya la declara con `verify_jwt = false`.

**No se ha ejecutado ni una vez**: se escribió con Docker Desktop caído, así que está revisada a
ojo y nada más. El paso 6.3 de abajo es su primera prueba real — hazlo antes de mandarle el enlace
a nadie.

### 0.4 — Los correos de aviso (opcional, pero decide algo)

Sin `RESEND_API_KEY` los prospectos **solo llegan a la tabla** y hay que ir a mirarlos. El sitio
promete «te contestamos el mismo día hábil», así que o pones la llave o te acostumbras a revisar.

```bash
supabase secrets set RESEND_API_KEY="re_..." VIM_AVISOS_A="hola@vimpos.com.mx" VIM_AVISOS_DE="VIM POS <hola@vimpos.com.mx>"
```

El dominio de `VIM_AVISOS_DE` tiene que estar verificado en Resend o los correos salen a spam.

### 0.5 — Las capturas siguen pendientes

Hay **12 huecos** repartidos por el sitio que dicen «Captura: … Pendiente» — son **9 capturas
distintas**, porque tres se usan en dos páginas. Se ven como lo que son
—un hueco a rayas—, no como producto borroso, así que publicar sin ellas no engaña a nadie. Pero
se nota.

Para generarlas: `sitio-web/_capturas/render.mjs` (necesita Supabase local arriba, la semilla del
negocio de demostración, los dos servidores de desarrollo y Playwright). Decide si publicas sin
ellas o esperas.

---

## 1. Qué se sube y qué no

**Se sube el contenido de `sitio-web/` a `public_html/`** — el contenido, no la carpeta. Son 18
archivos, unos 304 KB en total:

```
.htaccess          404.html           aviso-privacidad.html
index.html         precios.html       sin-internet.html
demo.html          terminos.html      robots.txt
sitemap.xml        site.webmanifest
assets/css/vim.css
assets/js/vim.js
assets/img/  (logo.svg, logo-horizontal.svg, logo-vertical.svg,
              arquitectura.svg, apple-touch-icon-1024.png)
```

**NO se suben** los que empiezan con guion bajo:

| No subir | Por qué |
|---|---|
| `_patron.html` | Página de referencia de componentes. Publicada, es una URL rara indexable. |
| `_capturas/` | Herramienta de desarrollo con su `package.json`. **Además contiene `semilla-demo.sql` con contraseñas de desarrollo** — inofensivas (solo existen en el Supabase local) pero no hay razón para publicarlas. |

El `.htaccess` bloquea cualquier ruta que empiece con `_` como segundo cerrojo. El primero es no
subirlos.

---

## 2. Subirlo

**Por el Administrador de archivos de Hostinger** (hPanel → Archivos → Administrador de archivos):

1. Entra a `public_html/`.
2. Si hay un `index.html` de bienvenida de Hostinger, **bórralo**.
3. Arrastra los archivos y la carpeta `assets/`.

**Por FTP** (FileZilla o similar), las credenciales están en hPanel → Archivos → Cuentas FTP.

> ⚠️ **El `.htaccess` empieza con punto, así que la mayoría de los clientes de FTP lo ocultan.**
> En FileZilla: *Servidor → Forzar mostrar archivos ocultos*. En el Administrador de archivos de
> Hostinger: el icono de ajustes → *Mostrar archivos ocultos*.
>
> Es el fallo más común de esta clase de despliegue: el sitio se ve perfecto y no fuerza HTTPS, no
> tiene página de 404 y no manda ninguna cabecera de seguridad. Si algo de eso pasa, lo primero
> que hay que comprobar es si el archivo llegó.

---

## 3. El dominio

Si `vimpos.com.mx` ya está en Hostinger y apunta al hosting, no hay nada que hacer aquí.

Si no, en hPanel → Dominios:

- **Registro A del apex** (`@`) → la IP que Hostinger indique para tu plan.
- **Registro A o CNAME de `www`** → lo mismo. El `.htaccess` lo redirige al apex, pero el DNS
  tiene que resolver primero: sin registro, `www.vimpos.com.mx` da error de DNS y nunca llega a
  la redirección.

Los cambios de DNS tardan. Lo normal es minutos; el peor caso son 48 horas.

**Ojo con los subdominios que ya existen:** `pos.`, `admin.` y `platform.` apuntan a Vercel. Al
tocar el DNS del apex no se tocan esos registros — pero si acabas moviendo los nameservers a
Hostinger, sí se van todos. Anota los registros de los subdominios antes de mover nada.

---

## 4. El certificado

hPanel → Seguridad → SSL. Hostinger emite Let's Encrypt gratis; suele tardar unos minutos tras
apuntar el dominio.

**Espera a que el certificado esté activo antes de probar el `.htaccess`.** La regla fuerza HTTPS,
así que sin certificado el navegador enseña una advertencia de sitio no seguro en un bucle de
redirección. No es que esté mal configurado: es que falta el certificado.

---

## 5. Lo que el `.htaccess` deliberadamente NO hace

Está escrito en el archivo, pero conviene repetirlo aquí porque son dos decisiones que alguien va
a querer "arreglar":

- **No hay HSTS.** Es la única cabecera de la lista que **no se puede deshacer**: el navegador la
  recuerda durante el `max-age` aunque la quites del servidor. Con el dominio recién apuntado, un
  certificado mal renovado dejaría el sitio inaccesible sin forma de arreglarlo desde el servidor.
  Se activa cuando lleve unos meses estable.
- **No hay Content-Security-Policy.** El sitio carga fuentes de Google y llama a Supabase; una CSP
  escrita a ciegas rompe una de las dos y el fallo se ve solo en producción. Merece su propia
  pasada con la consola abierta.

---

## 6. Verificar, ya publicado

### 6.1 — Que llegó todo

- [ ] `https://vimpos.com.mx` abre y se ve con sus tipografías (si se ve con la letra del sistema,
      falta conexión a Google Fonts o el `<link>` no llegó).
- [ ] `http://vimpos.com.mx` salta a `https://` con un solo 301.
- [ ] `https://www.vimpos.com.mx` salta al apex.
- [ ] `https://vimpos.com.mx/loquesea` enseña la página 404 del sitio, no la de Hostinger.
- [ ] `https://vimpos.com.mx/_patron.html` da **403**.
- [ ] `https://vimpos.com.mx/robots.txt` y `/sitemap.xml` responden.
- [ ] Las seis páginas abren y sus enlaces internos funcionan.

Las cabeceras, de un tirón:

```bash
curl -sI https://vimpos.com.mx | grep -iE "x-content-type|x-frame|referrer|permissions|cache-control"
```

### 6.2 — La consola

Abre el sitio con las herramientas del navegador y revisa que no haya errores ni 404 de `assets/`.
Un `vim.css` con 404 se nota; un `vim.js` con 404 no — la página se ve idéntica y deja de
funcionar el menú móvil, el acordeón y el formulario.

### 6.3 — El formulario, de punta a punta ⚠️ **es la primera vez que corre**

- [ ] Llena `demo.html` con datos reales tuyos y envía.
- [ ] Aparece la pantalla de «Listo, ya nos llegó».
- [ ] La fila está en la tabla:
      ```sql
      SELECT nombre, whatsapp, negocio, cajas, sucursales, creado_en
        FROM prospectos ORDER BY creado_en DESC LIMIT 5;
      ```
- [ ] Si pusiste `RESEND_API_KEY`, llegó el correo a `hola@vimpos.com.mx`.
- [ ] **Recarga y manda otro** (al enviar, el formulario se oculta y sale el acuse, así que hay
      que recargar para volver a probar). El tope es de 5 por hora desde la misma IP: del sexto en
      adelante debe salir «Inténtalo más tarde». Tarda al menos 3 segundos en llenarlo — por debajo
      de eso el envío se descarta en silencio, que es la defensa contra guiones automáticos.
- [ ] Borra tus pruebas: `DELETE FROM prospectos WHERE negocio = '<lo que pusiste>';`

Si sale error de CORS en consola → es el paso 0.1.
Si sale «no se pudo enviar» sin error de CORS → mira los logs de la función en el dashboard de
Supabase.

### 6.4 — Teléfono de verdad

Ábrelo en tu celular, no solo en el simulador del navegador: el menú de hamburguesa, el
formulario y las tablas que se desplazan de lado. Es donde va a entrar la mitad de la gente.

### 6.5 — Google

- [ ] Alta en Google Search Console, propiedad de dominio.
- [ ] Enviar `https://vimpos.com.mx/sitemap.xml`.
- [ ] Pedir indexación del home.

---

## 7. Actualizarlo después

Se sobrescriben los archivos que cambiaron. No hay build ni caché de servidor que purgar.

**Lo único con trampa es la caché del navegador.** El `.htaccess` le pone un año a `vim.css` y a
`vim.js`, así que un visitante que ya estuvo aquí se queda con la versión vieja hasta que caduque.

- Si cambias **solo HTML**: nada que hacer, el HTML caduca en una hora.
- Si cambias **`vim.css` o `vim.js`**: renómbralos con una versión (`vim.2.css`) y actualiza el
  `<link>` y el `<script>` de las siete páginas. Es a mano y es feo, pero es lo que corresponde a
  un sitio que se despliega a mano. El día que esto se automatice, se pone la versión en el nombre
  del archivo y se olvida el asunto.

Cuando cambie una página de verdad, actualiza su `lastmod` en `sitemap.xml`. No en cada
despliegue: un `lastmod` que miente entrena al rastreador a no creerle.

---

## 8. Lo que queda pendiente después de publicar

- Las **9 capturas** que faltan (§0.5).
- El **sprite de iconos** y el `favicon.ico` — hoy el favicon es el SVG, que funciona en todo
  navegador moderno pero no en los viejos.
- **HSTS y CSP**, cuando lleve unos meses estable (§5).
- La **medición**, si la quieres: algo sin cookies (Plausible, Umami) para no tener que poner un
  banner de consentimiento. Con Google Analytics haría falta, y un banner en el primer scroll de un
  sitio que apenas recibe visitas cuesta más conversión de la que vale el dato.
- El **menú de Soluciones** y las páginas de la segunda ola, después de las primeras demos.
