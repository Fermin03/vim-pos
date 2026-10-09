# Tienda en línea · Entrega 5: la tienda pública — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado:** ejecutándose por mandato de Fermín (8 oct 2026: «sigue con las demás entregas, toma las decisiones por mí y entrégame un reporte al final»). Las decisiones tomadas en su nombre están en «Decisiones» y van al reporte.

**Goal:** Que el cliente de un restaurante abra `pedidos.vimpos.com.mx/<negocio>` en su teléfono, vea el menú, arme su pedido para recoger o a domicilio, lo mande pagando al recibir y siga su estado en vivo.

**Architecture:** App Next nueva `apps/tienda`. El navegador nunca habla con Supabase: el menú y los datos del negocio se leen en componentes de servidor (con caché corta) y todo lo demás pasa por una única ruta `POST /api/tienda` de la app, que reenvía a la Edge Function `tienda` con el secreto `x-vim-tienda` y la IP real en `x-tienda-ip`. Carrito en `localStorage`. La lógica (carrito, reglas de modificadores y combos, textos, horario, color) vive en módulos puros con pruebas; las pantallas solo la pintan.

**Tech Stack:** Next 15 (App Router) + React 19 + Tailwind con el preset y los tokens de `@vim/ui`; vitest; PL/pgSQL + smokes para lo que cambia en la base.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` §4 (arquitectura), §9 (tienda pública), §12 (seguridad), §14 (despliegue).

**Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-09-tienda-5-hechos-de-la-tienda-publica.md` — el contrato exacto de la función `tienda` (acciones, cuerpos, respuestas, errores), cómo están hechas las apps del monorepo, la CSP compartida, el CI y Vercel. Las tareas lo citan como «Anexo §N». **El contrato de la función no se adivina: se lee ahí y en el código.**

Plan 5 de 7.

## Decisiones (tomadas por Claude en nombre de Fermín)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Los precios del menú se muestran como se van a cobrar** (con IVA cuando el producto lo lleva aparte). La base añade ese precio final al menú. | Un precio en el menú distinto al del carrito se siente como engaño. |
| 2 | **El menú es visible en buscadores; el seguimiento de un pedido no.** | El menú es la vitrina del restaurante; el enlace de seguimiento es privado. |
| 3 | **El color del negocio pinta los botones principales**, y el texto del botón se pone blanco o negro solo según el color elegido, para que siempre se lea. | El dueño puede elegir cualquier color. |
| 4 | **«Abre a las 1:00 p. m.» se calcula con la hora del centro de México.** | Todos los negocios están ahí; cuando haya uno en otra zona se ajusta. |
| 5 | **La zona de envío la elige el cliente de una lista** (nombre y costo); no se valida contra la dirección. | Es como ya trabaja el domicilio del POS. |
| 6 | **Con una sola sucursal no se pregunta sucursal; con un solo modo no se pregunta modo.** | Menos pasos. |
| 7 | **Sin analítica ni píxeles** en la tienda en esta entrega. | Privacidad primero; se decide en la salida. |
| 8 | **El pedido no se reintenta solo.** Si la red falla al enviar, se le dice al cliente que revise antes de volver a intentar. | Un reintento automático puede crear dos pedidos. |
| 9 | **La tienda se construye y se prueba, pero no se publica**: crear el proyecto en Vercel, el dominio `pedidos.vimpos.com.mx`, sus variables y añadir el dominio al antirobot lo hace Fermín con la guía que deja esta entrega. | Dominios, DNS y servicios externos no se tocan sin él. |
| 10 | **El aviso de privacidad y los términos** quedan como enlace a una página sencilla con texto provisional marcado como tal; el texto definitivo es de la entrega 7. | La página debe existir para no dejar enlaces rotos. |
| 11 | **Cuentas de clientes: no en esta entrega.** El cliente pide como invitado; el botón «Entrar» no aparece todavía. | Es la entrega 6. |

## Global Constraints

- **Cargar `ponytail` antes de escribir código**; para pantallas, además `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, y leer `docs/diseno/nucleo.md` y `docs/diseno/factura.md` (el pariente más cercano). Esta entrega estrena `docs/diseno/tienda.md`.
- **Móvil primero de verdad** (360–430 px de ancho es el caso principal; en escritorio, una columna centrada). Controles ≥ 44 px, campos a 16 px (iOS hace zoom por debajo), la acción principal al alcance del pulgar, estados de carga/vacío/error en cada pantalla, `prefers-reduced-motion`.
- **Tipografía solo de la escala** (`pnpm tipografia`). Tokens de `@vim/ui`; nada de colores sueltos salvo el del negocio, que entra por variables CSS.
- **Una sola puerta:** ningún código de navegador importa el módulo del secreto ni llama a Supabase. `VIM_TIENDA_SECRET` solo se lee en servidor (`import "server-only"`). La app **compila sin secretos** (el CI construye sin ellos): los lee al atender, no al importar.
- **El negocio sale del `slug` de la URL**; la ruta `/api/tienda` solo acepta las acciones `cotizar`, `pedir`, `seguimiento` (y `menu`/`negocio` si una pantalla de cliente las necesita para refrescar), valida forma y tamaño, y **no reenvía cabeceras ni campos que no conozca**.
- **IP real:** `x-vercel-forwarded-for` → `x-real-ip` → primer valor de `x-forwarded-for` (como `apps/platform/app/lib/server.ts`), siempre en `x-tienda-ip`.
- **Nada del cliente se pinta como HTML.** Las URL de imagen se usan solo si tienen la forma exacta del almacén público (`<SUPABASE_URL>/storage/v1/object/public/productos/<uuid>/<uuid>.(jpg|png|webp)`); si no, sin foto.
- **Dinero:** llega como texto con dos decimales; se suma en centavos enteros, nunca en flotante. El total que manda es el de `cotizar`.
- **Códigos de seguimiento:** nunca a registros, analítica ni `Referer` (`Referrer-Policy: no-referrer` en esa ruta).
- **Sin `any`. Español en el dominio. Textos para un comensal**, sin palabras internas ni códigos.
- **Migración:** número tentativo **0165**; confirmar contra `origin/main`. Funciones SQL se redefinen completas desde su definición vigente. Corre también en la caja.
- **Pruebas:** vitest en `apps/tienda` desde el primer commit; smokes para la base; `pnpm test:functions` si se toca la función. Nunca `next build`, CLI de `supabase` en local, ni `git stash`.
- Commits en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Estructura de `apps/tienda`

```
apps/tienda/
  package.json  next.config.mjs  tsconfig.json  tailwind.config.ts  postcss.config.mjs  vitest.config.ts
  app/
    layout.tsx  globals.css  icon.svg  not-found.tsx  robots.ts
    page.tsx                         raíz: página mínima «VIM POS · pedidos en línea» (noindex)
    api/tienda/route.ts              la única puerta del navegador
    [negocio]/
      layout.tsx                     marca del negocio (color, logo, nombre), pie con VIM discreto
      page.tsx                       menú (servidor) → <Tienda> (cliente)
      pedido/[codigo]/page.tsx       seguimiento (noindex, no-referrer)
      privacidad/page.tsx            aviso provisional
    components/                      pantallas y piezas de cliente
    lib/
      servidor/funcion.ts            cliente de la Edge Function (server-only): secreto, IP, caché
      servidor/ip.ts
      api.ts                         cliente del navegador hacia /api/tienda
      contrato.ts                    tipos del contrato + lectores que validan la forma (unknown → tipo)
      carrito.ts                     estado del carrito, reglas de modificadores y combos, a cuerpo de la función
      dinero.ts  horario.ts  color.ts  imagen.ts  textos.ts  telefono.ts
      __tests__/*.test.ts
```

## Formas compartidas

**`POST /api/tienda`** (navegador → app): cuerpo JSON `{ accion, negocio, … }` con la misma forma que la función (Anexo §1). Respuesta: el mismo estado HTTP y el mismo JSON que devuelve la función para 200, 4xx conocidos (`400`, `403`, `404`, `409`, `413`, `429`) y `503`; cualquier otra cosa (incluido un `401` de la función, que sería un secreto mal puesto) sale como `503 {"error":"SERVICIO_NO_DISPONIBLE"}` y se registra en el servidor **sin** el cuerpo. Tope de cuerpo 32 KB. Solo `POST`; mismo origen (se rechaza con `403` si `Origin` existe y no es el propio).

**Carrito en `localStorage`**, clave `vim.tienda.<slug>.carrito`, versión en el objeto; se descarta si no valida o tiene más de 24 h:

```ts
type RenglonCarrito = {
  id: string;                     // local, para React
  productoId: string; nombre: string; cantidad: number; nota: string;
  modificadores: { opcionId: string; nombre: string; cantidad: number }[];
  componentes: { grupoId: string; productoId: string; nombre: string; cantidad: number;
                 modificadores: { opcionId: string; nombre: string; cantidad: number }[] }[];
};
type Carrito = { v: 1; sucursalId: string; modo: "RECOGER" | "DOMICILIO"; zonaId: string | null;
                 renglones: RenglonCarrito[]; guardado: number };
```

Los nombres guardados son solo para pintar; **precios nunca se guardan**: salen del menú vigente y de `cotizar`. Al cargar el menú, los renglones cuyo producto u opciones ya no existen o están agotados se marcan y no dejan pedir hasta quitarlos.

**Datos del cliente recordados**, clave `vim.tienda.cliente` (nombre, teléfono, correo, última dirección): solo en su teléfono, con un enlace «Olvidar mis datos».

**Textos de estado del seguimiento** (decisión de Fermín; sin tiempo estimado):

| Código | Título | Línea de apoyo |
|---|---|---|
| `EN_PROCESO` | En proceso | Le avisamos al restaurante. En un momento confirma tu pedido. |
| `EN_PREPARACION` | En preparación | El restaurante ya está preparando tu pedido. |
| `EN_CAMINO` | En camino | Tu pedido va hacia ti. |
| `LISTO_PARA_RECOGER` | Listo para recoger | Ya puedes pasar por tu pedido. |
| `ENTREGADO` | Entregado | ¡Buen provecho! |
| `CANCELADO` | Cancelado | según el motivo ↓ |

Motivos: `SIN_RESPUESTA` → «El restaurante no confirmó tu pedido a tiempo. No se te cobró nada.»; `AGOTADO` → «Se agotó algo de tu pedido.»; `CERRADO` → «El restaurante ya cerró.»; `SATURADO` → «El restaurante tiene demasiados pedidos en este momento.»; `OTRO`/desconocido → «El restaurante no pudo tomar tu pedido.» Siempre con el teléfono de la sucursal para llamar.

**Textos de tienda cerrada** (motivo de `estado.<modo>`): `FUERA_DE_HORARIO` → «Cerrado ahora. Abre {día} a las {hora}.» (o «Abre hoy a las …»); `EN_PAUSA` → «No estamos tomando pedidos en este momento. Vuelve a intentar en unos minutos.»; `CAJA_NO_LISTA` → «Aún no abrimos. Vuelve a intentar en unos minutos.»; `MODO_NO_DISPONIBLE` → ese modo no se ofrece; los demás → «Esta tienda no está disponible por ahora.» El menú se ve completo siempre; lo que cambia es el botón de pedir.

---

### Task 1: la base — precio final en el menú y direcciones reservadas

**Files:**
- Create: `supabase/migrations/0165_tienda_publica.sql`
- Test: `supabase/scripts/smoke_tienda_menu_precio_final.sql`; ajustar `supabase/scripts/smoke_tienda_*.sql` solo si una aserción compara el JSON completo del menú
- Modify: `apps/admin/app/lib/tienda-reglas.ts` (+ su prueba) — la lista espejo de direcciones reservadas

**Interfaces — Produces:**
- `tienda_menu` devuelve **además** (los campos de hoy no cambian de valor ni de nombre, porque `tienda_cotizar` arma el menú por dentro y depende de ellos — Anexo §1.8):
  - en cada producto: `precio_final_mxn` (texto) = lo que `tienda_cotizar` cobraría por **una** unidad sin modificadores (o, en un combo, el precio base del combo sin extras de elecciones);
  - en cada opción de modificador y de slot: `precio_extra_final_mxn` (texto) = el extra tal como entra al total (con el IVA del producto al que pertenece, si va aparte).
  Deben salir **de la misma aritmética que usa `tienda_cotizar`** (extraer una función interna si hace falta, no duplicar la fórmula).
- `tienda_negocio`: sin cambios (el envío exacto lo da `cotizar`).
- CHECK de direcciones reservadas de `tienda_config.slug`: se añaden `seguimiento`, `carrito`, `entrar`, `registro`, `salir`, `icon`, `manifest`, `robots`, `sitemap`, `favicon`, `menu`, `inicio`, `app`, `legal`, `aviso`, `contacto`, `vim-pos`, `soporte-vim`, `pedidos`. Ninguna tienda existe aún en producción con esos nombres (comprobar en la Task 7 antes de aplicar; si existiera, detenerse).

- [ ] **Step 1: Smoke** — para cada producto del menú del fixture (incluido uno con IVA aparte, uno con modificador con extra, y un combo): cotizar 1 unidad sin extras da `total_mxn == precio_final_mxn`; cotizar con una opción con extra da `precio_final + precio_extra_final`; los campos viejos conservan su valor; `tienda_cotizar` da exactamente lo mismo que antes de la migración para los carritos de `smoke_tienda_pedido.sql`; cada dirección reservada nueva se rechaza y una normal se acepta.
- [ ] **Step 2: Rojo.** **Step 3: Migración** (leer 0162 y 0163 completas antes). **Step 4: Verde** con todos los `smoke_tienda_*.sql`, y la prueba del admin que compara las dos listas.
- [ ] **Step 5: Commit** — `feat(tienda): el menú trae el precio final y se reservan más direcciones`.

---

### Task 2: la app — cimientos, servidor y lógica

**Files:** todo `apps/tienda/` salvo `components/` y las páginas de `[negocio]` (que quedan como esqueleto mínimo que compile); `packages/config/cabeceras-seguridad.mjs` (+ prueba si existe) para admitir `imgSrc`; `packages/ui` para subir `Captcha`; `apps/admin` para usar el `Captcha` compartido; `turbo.json`, `.env.example`, `pnpm-lock.yaml`.

**Contenido:**
- **Andamiaje** como `apps/factura` (Anexo §2.1) más vitest como `apps/admin`; puerto de desarrollo 3005; scripts `dev`, `build`, `start`, `typecheck`, `test`.
- **Cabeceras:** `cabecerasSeguridad({ imgSrc: [<origen de Supabase>], scriptExtra y frameSrc de Turnstile })`. `imgSrc` es una opción nueva y aditiva: las demás apps no cambian (prueba). En `/[negocio]/pedido/*`: `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex`.
- **`Captcha`** sube a `@vim/ui` admitiendo la acción `tienda_pedido` (Anexo §2.3); el admin lo importa de ahí sin cambiar de comportamiento.
- **`lib/servidor/funcion.ts`** (`server-only`): `llamarTienda(cuerpo, ip)` → `{ estado, json }`; URL = `${SUPABASE_URL ?? NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tienda`; cabeceras `x-vim-tienda`, `x-tienda-ip`, `content-type`; tiempo límite 10 s; sin secreto o sin URL → `503` sin llamar. `leerNegocio(slug)` y `leerMenu(slug, sucursalId)` con caché de 30 s por clave (la de Next, `unstable_cache` o equivalente vigente en la versión instalada — comprobarlo en la documentación del paquete instalado, no de memoria), que **no** guarda en caché los errores salvo el 404 (30 s).
- **`app/api/tienda/route.ts`** según «Formas compartidas».
- **`lib/contrato.ts`**: tipos y lectores `unknown → tipo | null` para `negocio`, `menu` (con los campos nuevos de la Task 1), `cotizar`, `pedir`, `seguimiento`; un JSON que no cumple la forma se trata como servicio no disponible, nunca se pinta a medias.
- **`lib/carrito.ts`**: agregar, cambiar cantidad, quitar, vaciar; **validar selección** de un producto contra sus grupos (`minimo`/`maximo`, `maximo: null` = sin tope, opciones agotadas, defaults) y de un combo contra sus slots (mismas reglas, y el mismo producto no dos veces — Anexo §1.7); fusionar renglones idénticos; revalidar contra un menú nuevo; estimar el total con `precio_final_mxn` (solo para mostrar antes de cotizar); construir el cuerpo de `cotizar`/`pedir` con las cantidades como enteros y los topes del Anexo §1.8 (40 renglones, 50 por renglón, 10 por modificador); leer/guardar en `localStorage` con versión y caducidad.
- **`lib/dinero.ts`** (centavos enteros ↔ texto, formato `$1,234.50`), **`horario.ts`** («Abre hoy a las…», «Abre el lunes a las…», horario de la semana legible; usa las reglas que hoy están en `apps/admin/app/lib/tienda-reglas.ts`: muévelas a un paquete compartido existente y que el admin las importe de ahí), **`color.ts`** (hex → canales RGB para `--accent`, tono de hover y suave, y texto blanco o negro por luminancia WCAG), **`imagen.ts`** (la forma exacta de URL; `logo_ruta` → URL), **`telefono.ts`** (normalizar a 10 dígitos como la función, formato para mostrar, enlaces `tel:` y WhatsApp), **`textos.ts`** (estados, motivos, tienda cerrada, y un texto humano para **cada** código de error del Anexo §1.3, con qué puede hacer el cliente).
- **`lib/api.ts`**: `cotizar`, `pedir`, `seguimiento` hacia `/api/tienda`, devolviendo uniones discriminadas (`ok` / `error` con código y `detalle`), sin reintentos en `pedir`.

- [ ] **Step 1: Pruebas primero** de cada módulo puro: reglas de selección (cada frontera de mínimo/máximo, `null`, agotadas, combo con producto repetido), cuerpo exacto de `cotizar` para un producto con modificadores y para un combo, caducidad y versión del carrito, dinero (sumas que en flotante fallarían), horario (cierre pasada la medianoche, día sin horario, semana entera cerrada), color (negro, blanco, un amarillo, el azul de VIM), imagen (URL de otro origen, con `..`, con parámetros, `javascript:`), lectores del contrato con respuestas reales del Anexo y con basura; la ruta `/api/tienda` con `fetch` simulado (acción no permitida, cuerpo grande, `Origin` ajeno, 401 de la función → 503, reenvío de IP).
- [ ] **Step 2: Rojo.** **Step 3: Implementar.** **Step 4:** `pnpm install` (lockfile), `pnpm --filter ./apps/tienda test`, `tsc --noEmit` de `tienda` y `admin`, pruebas del admin y de `packages/*`, `pnpm tipografia`.
- [ ] **Step 5: Commit(s)** — `feat(tienda): la app de la tienda pública — servidor, contrato y carrito`.

---

### Task 3: las pantallas — menú, producto y carrito

**Files:** `apps/tienda/app/[negocio]/layout.tsx`, `page.tsx`, `apps/tienda/app/components/*` (menú, tarjeta de producto, hoja de producto, selector de sucursal/modo/zona, barra del carrito, carrito), `docs/diseno/tienda.md` (nuevo).

**Comportamiento** (spec §9):
- **Marca:** logo (o inicial del nombre si no hay), nombre, descripción, color del negocio en la acción principal. VIM solo en el pie («Pedidos con VIM POS»).
- **Encabezado de estado:** «Abierto» / el texto de tienda cerrada; horario de la semana desplegable; teléfono y dirección de la sucursal.
- **Sucursal y modo:** decisión 6. Cambiar de sucursal con cosas en el carrito pide confirmación (el carrito es por sucursal). A domicilio se elige zona (nombre y costo).
- **Menú:** categorías con navegación pegajosa (chips que siguen el scroll), productos con foto (o sin ella, sin hueco roto), nombre, descripción corta, `precio_final_mxn`, y «Agotado» atenuado y no pulsable.
- **Producto (hoja inferior en móvil, diálogo en escritorio):** foto, descripción, grupos de modificadores con su regla dicha en palabras («Elige 1», «Hasta 3», «Opcional»), extras con su `precio_extra_final_mxn`, combos con sus slots, cantidad, nota («sin cebolla…», 200 caracteres), y el botón «Agregar · $…» que solo se activa con la selección válida y dice qué falta si no. Foco atrapado, Escape y gesto de cerrar, regreso del foco.
- **Barra del carrito** fija abajo cuando hay algo: «Ver pedido · N · $…».
- **Carrito:** renglones con sus elecciones, cambiar cantidad, quitar, nota general; subtotal/envío/total **de `cotizar`** (se recotiza con cada cambio, con espera corta; mientras tanto se ve el estimado atenuado); avisos por renglón si algo se agotó. Con la tienda cerrada se puede armar el carrito pero el botón de continuar se cambia por el aviso.
- **`docs/diseno/tienda.md`:** principios, uso del color del negocio, piezas, textos y estados; con el mismo formato que `docs/diseno/factura.md`.

- [ ] **Step 1:** implementar. **Step 2:** `pnpm --filter ./apps/tienda test`, `tsc --noEmit`, `pnpm tipografia`. **Step 3: Commit** — `feat(tienda): menú, producto y carrito de la tienda pública`.

---

### Task 4: las pantallas — tus datos, enviar y seguimiento

**Files:** `apps/tienda/app/components/*` (datos y pago, confirmación), `apps/tienda/app/[negocio]/pedido/[codigo]/page.tsx` (+ componente de cliente), `apps/tienda/app/[negocio]/privacidad/page.tsx`, `apps/tienda/app/not-found.tsx`, `app/robots.ts`, metadatos por negocio.

**Comportamiento:**
- **Tus datos:** nombre, teléfono (10 dígitos, teclado numérico), correo opcional («para mandarte el enlace de tu pedido»); a domicilio: calle, número exterior, interior, colonia, código postal, ciudad, estado, referencias (prellenados con lo último que escribió). Validación en el campo, al salir de él, con el motivo en palabras; los límites del Anexo §1.9.
- **Pago:** las formas que el negocio tenga encendidas; con efectivo, «¿Con cuánto pagas?» opcional (entre el total y el total + $5,000); con tarjeta, «Paga con tarjeta al recibir: el restaurante lleva la terminal.»
- **Enviar:** antirobot (`Captcha`, acción `tienda_pedido`; token nuevo tras cada intento fallido), se cotiza justo antes y se manda `total_esperado`; botón deshabilitado mientras envía. `TOTAL_CAMBIO` → se muestra el total nuevo y se pide confirmar; `TIENDA_CERRADA` → el texto del motivo; `PRODUCTO_NO_DISPONIBLE`/`MODIFICADORES_INVALIDOS`/`COMBO_INVALIDO` → vuelve al carrito marcando el renglón; `NO_SE_PUDO_CREAR` → «No pudimos tomar tu pedido. Llama al restaurante: …»; `CAPTCHA_INVALIDO`, `DEMASIADOS_INTENTOS`, `SERVICIO_NO_DISPONIBLE` y fallo de red, cada uno con su texto y qué hacer (decisión 8). Con 200 (también el caso degradado con campos `null`) se vacía el carrito y se navega a `/[negocio]/pedido/[codigo]` con `replace`.
- **Seguimiento:** estado grande con su línea de apoyo, pasos del recorrido (los de su modo), folio, resumen (renglones, subtotal, envío, total, forma de pago), sucursal con botones «Llamar» y «WhatsApp», y «Pedir de nuevo» al terminar. Sondeo cada 10 s mientras el pedido esté vivo; se detiene en estado final y con la pestaña oculta, y se reanuda al volver; ante errores seguidos baja el ritmo y avisa «Sin conexión. Reintentando…» sin borrar lo último que se supo. `404` → «No encontramos este pedido» (enlace vencido o mal copiado). Un aviso discreto: «Guarda este enlace para volver a ver tu pedido.» con botón de copiar.
- **SEO y metadatos:** título y descripción del negocio en el menú, `og:image` con el logo si hay; `robots.ts` permite `/` y bloquea `/*/pedido/`; `noindex` en seguimiento, privacidad y raíz.
- **Privacidad:** página con texto provisional claramente marcado (decisión 10): qué datos se piden, para qué, que se guardan en el restaurante, y cómo pedir que se borren (teléfono de la sucursal).

- [ ] **Step 1:** implementar; la máquina de estados de «enviar» (qué hace cada respuesta) y la del sondeo viven en `lib/` con pruebas. **Step 2:** pruebas, `tsc`, tipografía. **Step 3: Commit** — `feat(tienda): tus datos, envío del pedido y seguimiento en vivo`.

---

### Task 5: el admin, la operación y los documentos

- **Admin:** botón «Ver mi tienda» (abre `https://pedidos.vimpos.com.mx/<slug>` en otra pestaña) en el bloque Compartir del apartado Tienda en línea; y el **aviso de combos no comprables** (plan 3, pendiente): en el apartado, si algún combo activo tiene dos slots obligatorios que solo admiten el mismo producto, una nota que lo nombra y dice cómo arreglarlo. La detección es una función pura con prueba.
- **`docs/operacion/tienda-publica-salida.md`** (nuevo): la guía paso a paso de lo que le toca a Fermín (decisión 9), con el orden y cómo comprobar cada paso: proyecto Vercel `vim-tienda` (Root Directory `apps/tienda`), variables (`VIM_TIENDA_SECRET` desde su archivo de llaves, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), dominio y DNS, añadir el dominio al widget de Turnstile, `TURNSTILE_HOSTNAMES` con **los dos** dominios, y la prueba de humo de punta a punta con un negocio interno. Avisar del impacto en el límite de 100 despliegues diarios.
- `docs/operacion/deploy-vercel.md` al día; `.env.example` con las variables de la tienda; `supabase/functions/README.md` si cambió algo del contrato.

- [ ] Implementar, pruebas del admin, `tsc`, tipografía. **Commit** — `feat(tienda): «ver mi tienda», aviso de combos y guía de salida`.

---

### Task 6: verificación

- [ ] **Todo en verde:** `cd desktop && npm run smokes`; `pnpm test:functions`; `pnpm -r test`; `pnpm tipografia`; `tsc --noEmit` en las seis apps; `pnpm audit --prod --audit-level=high`.
- [ ] **En el navegador, de punta a punta en local**, a 390 px y a 1280 px: como la Edge Function no corre en local, se levanta el backend embebido de la caja en una carpeta temporal y un servidor mínimo de prueba (fuera del repo) que atiende `/functions/v1/tienda` llamando a las mismas funciones SQL (`tienda_negocio`, `tienda_menu`, `tienda_cotizar`, `tienda_crear_pedido`, `tienda_seguimiento`) con el contrato del Anexo. Recorrer: menú abierto y cerrado, producto con modificadores, combo, carrito, domicilio con zona, envío del pedido, seguimiento que avanza al aceptar/imprimir/cobrar en el POS local, cancelación con motivo, 404. Capturas de cada pantalla. **Decir en el informe que el antirobot y la función real de producción no se ejercitaron.**
- [ ] PR contra `main`.

### Task 7: producción y mezcla

1. Comprobar que ninguna tienda usa una dirección que se va a reservar; aplicar la 0165; desplegar la función `tienda` solo si su código cambió; regenerar tipos.
2. Mezclar con el CI en verde. La app `apps/tienda` queda en `main` **sin proyecto de Vercel**: no se publica (decisión 9).
3. Dejar en el reporte la guía de salida y lo que falta probar contra producción.

## Lo que esta entrega NO hace

- Cuentas de clientes, direcciones guardadas en la nube, «mis pedidos» (entrega 6).
- Publicar la tienda: proyecto de Vercel, dominio, DNS, llaves (lo hace Fermín con la guía).
- Pago con tarjeta en línea, compra mínima, programar pedidos, propina (fuera del alcance acordado).
- Texto legal definitivo, concesión del complemento a los planes, revisión de seguridad completa (entrega 7).
- Evitar el doble pedido desde el servidor (idempotencia de `pedir`): se anota para la entrega 7.
