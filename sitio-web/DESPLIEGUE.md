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

## Publicar un cambio

`git push` a `main`. No hay más.

Y cuando cambie `vim.css` o `vim.js`, **subir el número de versión** de las nueve páginas:

```bash
cd sitio-web && sed -i 's/vim\.css?v=[0-9]*/vim.css?v=10/; s/vim\.js?v=[0-9]*/vim.js?v=10/' *.html
```

No es opcional: la caché de esos dos archivos es de un año. Durante el desarrollo costó tres
diagnósticos en falso creer que el código estaba mal cuando lo que corría era la versión anterior.
