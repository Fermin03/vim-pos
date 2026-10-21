# Tienda en línea · Entrega 6: cuentas de clientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado:** ejecutándose por mandato de Fermín (8 oct 2026: «sigue con las demás entregas, toma las decisiones por mí y entrégame un reporte al final»). Las decisiones tomadas en su nombre están en «Decisiones» y van al reporte.

**Goal:** Que el comensal pueda crear una cuenta en la tienda de un restaurante (correo y contraseña), entrar, recuperar su contraseña, guardar sus direcciones, ver sus pedidos y pedir de nuevo, y eliminar su cuenta; sin quitar la opción de pedir como invitado.

**Architecture:** Las cuentas viven en las tablas propias que ya existen (`tienda_cuentas`, `tienda_sesiones`, `tienda_recuperaciones`, `tienda_direcciones`), cerradas a todo rol salvo `service_role`. Toda la lógica de credenciales (hash, verificación, bloqueo, sesión) va en funciones SQL probadas por smokes. La Edge Function `tienda` gana las acciones de cuenta; la app `apps/tienda` guarda la sesión en una cookie `HttpOnly` por negocio que solo conoce su servidor y la reenvía a la función en una cabecera propia. El navegador nunca ve el token.

**Tech Stack:** PL/pgSQL + `pgcrypto` + smokes; Edge Function Deno/TS con lógica pura probada en Node; Next 15 + vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` §10 (cuentas) y §12 (seguridad).

**Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-09-tienda-6-hechos-de-cuentas.md` — las tablas tal como están, cómo se añade una acción a la función, cómo está hecha la ruta de servidor de la app, los precedentes de autenticación del repo y las trampas. Las tareas lo citan como «Anexo §N».

Plan 6 de 7.

## Decisiones (tomadas por Claude en nombre de Fermín)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Las contraseñas se guardan cifradas con bcrypt dentro de la base** (como los PIN del POS), no con scrypt en la función como decía el diseño. | Es el único mecanismo ya probado en el proyecto; deja verificación, bloqueo y sesión en una sola operación que las pruebas sí cubren. Se anota en el ADR. |
| 2 | **Contraseña de 8 a 72 caracteres**, sin más reglas. | Lo mismo que el registro de negocios. |
| 3 | **No se exige confirmar el correo para pedir.** Al registrarse entra de una vez. | Decisión de Fermín: el registro va dentro del flujo de compra. |
| 4 | **Nunca se dice si un correo ya tiene cuenta.** Registrarse con un correo ya usado responde igual que uno nuevo, y a ese correo le llega un aviso «ya tienes cuenta, entra o recupera tu contraseña». Recuperar responde siempre «si existe, te escribimos». | Que nadie pueda averiguar quién es cliente de un restaurante. |
| 5 | **Cinco contraseñas equivocadas seguidas bloquean la cuenta 15 minutos**; usar un enlace de recuperación la desbloquea. | Diseño aprobado. |
| 6 | **La sesión dura 30 días** y es por restaurante: entrar en la tienda de uno no abre sesión en la de otro. «Cerrar sesión» cierra la de ese teléfono; cambiar o recuperar la contraseña cierra todas las demás. | Diseño aprobado. |
| 7 | **El enlace para recuperar la contraseña dura 30 minutos y sirve una vez.** | Diseño aprobado. |
| 8 | **Registro pide nombre, apellido, correo, teléfono y contraseña.** Fecha de nacimiento, opcional, en «Mi cuenta». | Fermín pidió todos los datos para conectar lealtad después; el cumpleaños no debe estorbar la compra. |
| 9 | **Una cuenta ve solo lo que hizo con su sesión**: sus direcciones y sus pedidos en línea. Un invitado que luego se registra no ve sus pedidos anteriores. | Diseño aprobado; evita que alguien vea pedidos ajenos por compartir teléfono. |
| 10 | **Hasta 5 direcciones guardadas por cuenta.** | Suficiente y acotado. |
| 11 | **Eliminar la cuenta pide la contraseña, borra la cuenta, sus sesiones y sus direcciones guardadas, y desliga sus pedidos.** El restaurante conserva al cliente y sus direcciones en su propio sistema (son registros del restaurante); el aviso de privacidad lo dice. | Es lo honesto: la cuenta es del comensal, la venta es del restaurante. |
| 12 | **La cuenta todavía no se liga a los puntos de lealtad.** Queda lista: lealtad reconoce al cliente por teléfono, y la cuenta guarda el teléfono normalizado igual. | Conectar lealtad es otra función; aquí solo se deja el dato bien puesto. |
| 13 | **Antirobot al registrarse y al pedir recuperación**, no al entrar. | Entrar ya tiene límite por IP y bloqueo; registrar y recuperar mandan correos. |

> **Nota tras la revisión final (9 oct 2026).** La tabla se deja como se escribió; esto es lo que
> cambió al construirla, y manda el ADR `docs/decisiones/0032`:
> - **Decisión 4 no se cumple en `registrar`, y se acepta.** Las decisiones 3 («entra de una vez») y
>   4 («responde igual») son incompatibles: el alta nueva abre sesión y la repetida no, así que quien
>   llama a `registrar` deduce si ese correo ya es cliente. Lo acotan el antirobot, 5 por hora por IP
>   y 3 por hora por correo. `entrar` y `recuperar_pedir` sí la cumplen.
> - **Decisión 2: el tope es de 72 bytes, no 72 caracteres** (mínimo 8 caracteres). Es lo que mira bcrypt.
> - **Los correos de cuenta no llevan el nombre** que se tecleó, y `registrar` tiene además un tope
>   por correo: van a direcciones sin verificar.
> - **El enlace de recuperación lleva el token tras `#`**, no en `?t=` como dicen las tareas de abajo.

## Global Constraints

- **Cargar `ponytail` antes de escribir código**; para pantallas, además `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, y leer `docs/diseno/nucleo.md` y `docs/diseno/tienda.md`.
- **Lo existente no cambia**: pedir como invitado funciona exactamente igual (mismas pruebas, sin editar expectativas salvo donde una tarea lo diga); `tienda_cotizar` y el menú no se tocan.
- **Aislamiento por negocio en la base, no en la app**: toda función de cuentas recibe `p_tenant` (que la Edge Function saca del slug) y **todas** sus consultas filtran por él. Una sesión, un enlace de recuperación o una dirección de otro negocio se comportan como inexistentes.
- **Secretos**: contraseña, token de sesión y token de recuperación nunca se registran, nunca van en una URL salvo el enlace de recuperación del correo, y en la base solo existe su huella SHA-256 (tokens) o su hash bcrypt (contraseña). El token de sesión nunca llega a JavaScript del navegador.
- **Sin enumeración**: mismas respuestas, mismos estados HTTP y —en lo razonable— el mismo trabajo (un `crypt()` de relleno cuando el correo no existe) exista o no la cuenta.
- **La cuenta de un pedido sale solo de la sesión**, nunca del cuerpo (la ruta de la app sigue tirando `p_cuenta`, `tenant_id` y cualquier clave que no conozca).
- **Estados HTTP**: los que la app ya deja pasar (200, 400, 403, 404, 409, 413, 429, 503). «Sin sesión» y «credenciales incorrectas» son **403** con código; nunca 401.
- **Códigos de error de SQL** con al menos un guion bajo (Anexo §0.8).
- **Migración** tentativa **0166**; confirmar contra `origin/main`. Corre también en la caja (sin `storage.*`, `cron.*`, `net.*`); `pgcrypto` existe en ambas.
- **Sin `any`. Español en el dominio. Dinero en texto.** Textos para un comensal.
- **Pruebas**: smokes para todo el SQL; `pnpm test:functions`; vitest en la app. Nunca `next build`, CLI de `supabase` en local, ni `git stash`.
- Commits en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Formas compartidas

### Función `tienda`: acciones nuevas

Todas son `POST` con `{ accion, negocio, … }` y la cabecera del secreto, como las existentes. La sesión llega en la cabecera **`x-tienda-sesion`** (la pone solo el servidor de la app). Las respuestas de `registrar`, `entrar` y `recuperar_aplicar` traen el token de sesión en el campo **`sesion`**, que el servidor de la app convierte en cookie y **quita** antes de responder al navegador.

| Acción | Cuerpo | Sesión | Respuesta 200 | Errores propios |
|---|---|---|---|---|
| `registrar` | `nombre`, `apellido`, `email`, `telefono`, `password`, `captcha` | no | correo nuevo: `{ ok: true, sesion, cuenta }` · correo ya usado: `{ ok: true }` (sin sesión; sale el correo «ya tienes cuenta») | 400 `CUENTA_INVALIDA_DATOS`, 403 `CAPTCHA_INVALIDO` |
| `entrar` | `email`, `password` | no | `{ ok: true, sesion, cuenta }` | 403 `CREDENCIALES_INVALIDAS` (también si está bloqueada o no existe) |
| `salir` | — | sí (si no hay, 200 igual) | `{ ok: true }` | — |
| `recuperar_pedir` | `email`, `captcha` | no | `{ ok: true }` siempre | 403 `CAPTCHA_INVALIDO` |
| `recuperar_aplicar` | `token`, `password` | no | `{ ok: true, sesion, cuenta }` | 403 `ENLACE_INVALIDO` (vencido, usado o inexistente) |
| `cuenta` | — | sí | `{ cuenta, direcciones }` | 403 `SESION_INVALIDA` |
| `cuenta_guardar` | `nombre`, `apellido`, `telefono`, `fecha_nacimiento` (o `null`) | sí | `{ cuenta }` | 403 `SESION_INVALIDA`, 400 `CUENTA_INVALIDA_DATOS` |
| `cuenta_password` | `actual`, `nueva` | sí | `{ ok: true }` (cierra las demás sesiones) | 403 `SESION_INVALIDA` / `CREDENCIALES_INVALIDAS` |
| `direccion_guardar` | `id` (o `null` = nueva), `etiqueta`, y los campos de dirección de `pedir` | sí | `{ direcciones }` | 403 `SESION_INVALIDA`, 409 `DIRECCIONES_LLENAS`, 400 `DIRECCION_INVALIDA` |
| `direccion_borrar` | `id` | sí | `{ direcciones }` | 403 `SESION_INVALIDA` |
| `mis_pedidos` | — | sí | `{ pedidos: [{ folio_corto, recibido_at, modo, estado, total_mxn, renglones: [{nombre, cantidad, detalle}], items }] }` (últimos 20; `items` con la forma del carrito para «pedir de nuevo», o `null` si ya se anonimizó) | 403 `SESION_INVALIDA` |
| `eliminar_cuenta` | `password` | sí | `{ ok: true }` | 403 `SESION_INVALIDA` / `CREDENCIALES_INVALIDAS` |
| `pedir` (existente) | igual que hoy | opcional | igual que hoy; con sesión válida el pedido queda ligado a la cuenta; con sesión inválida o vencida **se rechaza** con 403 `SESION_INVALIDA` (no se degrada a invitado en silencio) | — |

`cuenta` = `{ nombre, apellido, email, telefono, fecha_nacimiento }`. Nunca sale el id de la cuenta, ni el `tenant_id`.

**Cupos** (rama propia en `cuposDe`; las que escriben se niegan si el control de cupos no responde): `entrar` 10 / 10 min por IP; `registrar` 5 / h por IP; `recuperar_pedir` 3 / h por IP **y** 3 / h por huella del correo+negocio; `recuperar_aplicar` 10 / h por IP; lecturas y cambios de «Mi cuenta» en su bolsa (`tienda:cuenta:ip`, 60 / 10 min).

**Correos** (buzón de VIM, con el nombre del restaurante en el asunto y el cuerpo; después de responder; su fallo no cambia la respuesta): bienvenida; «ya tienes cuenta»; recuperación con enlace `${VIM_TIENDA_URL}/<slug>/recuperar?t=<token>`.

### Funciones SQL (todas `SECURITY DEFINER`, `search_path` fijo, solo `service_role`)

| Función | Devuelve |
|---|---|
| `tienda_cuenta_registrar(p_tenant, p_nombre, p_apellido, p_email, p_telefono, p_password, p_sesion_hash)` | `jsonb`: `{ creada: true, cuenta }` o `{ creada: false }` si el correo ya existía en ese negocio (no crea nada, no revela nada más) |
| `tienda_cuenta_entrar(p_tenant, p_email, p_password, p_sesion_hash, p_ahora default now())` | `jsonb` `{ cuenta }` o `NULL` (credenciales malas, cuenta inexistente o bloqueada: indistinguibles). Cuenta fallos, bloquea a los 5, y hace un `crypt()` de relleno si el correo no existe |
| `tienda_sesion_cuenta(p_tenant, p_sesion_hash, p_ahora default now())` | `uuid` de la cuenta o `NULL` (inexistente, vencida, de otro negocio). Renueva `ultimo_uso` como mucho una vez por hora |
| `tienda_cuenta_salir(p_tenant, p_sesion_hash)` | `void` |
| `tienda_recuperar_pedir(p_tenant, p_email, p_token_hash, p_ahora default now())` | `jsonb` `{ nombre }` si la cuenta existe (para el correo) o `NULL`; invalida enlaces anteriores sin usar |
| `tienda_recuperar_aplicar(p_tenant, p_token_hash, p_password, p_sesion_hash, p_ahora default now())` | `jsonb` `{ cuenta }` o `NULL`; un solo uso, 30 min; cierra todas las sesiones, levanta el bloqueo, sella `email_verificado_at`, abre la sesión nueva |
| `tienda_cuenta_leer(p_tenant, p_cuenta)` | `jsonb` `{ cuenta, direcciones }` |
| `tienda_cuenta_guardar(p_tenant, p_cuenta, p_nombre, p_apellido, p_telefono, p_fecha_nacimiento)` | `jsonb` `{ cuenta }` |
| `tienda_cuenta_password(p_tenant, p_cuenta, p_actual, p_nueva, p_sesion_hash)` | `boolean`; cierra las demás sesiones |
| `tienda_direccion_guardar(p_tenant, p_cuenta, p_id, p_etiqueta, p_direccion jsonb)` / `tienda_direccion_borrar(p_tenant, p_cuenta, p_id)` | `jsonb` con la lista |
| `tienda_mis_pedidos(p_tenant, p_cuenta)` | `jsonb` (lista; estado con la misma regla de `tienda_seguimiento`) |
| `tienda_cuenta_eliminar(p_tenant, p_cuenta, p_password)` | `boolean` |

Borrado oportunista de sesiones y enlaces vencidos dentro de `entrar` y `recuperar_pedir` (sin cron).

### App: la cookie y la ruta

- Cookie **`vt_<slug>`** = token de sesión; `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`. (`Secure` se omite solo en `localhost` de desarrollo.)
- `POST /api/tienda`: acepta además las acciones de la tabla; para las que llevan o crean sesión exige `Origin` presente e igual al propio y `Content-Type: application/json`; lee la cookie del negocio del cuerpo y la manda en `x-tienda-sesion`; si la respuesta trae `sesion`, pone la cookie y devuelve el JSON **sin** ese campo; en `salir`, `eliminar_cuenta` y ante `SESION_INVALIDA` borra la cookie.
- El layout del negocio pinta «Entrar» o «Mi cuenta» mirando solo si la cookie existe (sin llamada extra); la validez la decide la función al usarla.
- Rutas nuevas: `/[negocio]/entrar`, `/[negocio]/registro`, `/[negocio]/recuperar` (pedir, y aplicar cuando llega `?t=`), `/[negocio]/cuenta`. Todas `noindex`; `/recuperar` además `Referrer-Policy: no-referrer`.

---

### Task 1: la base — cuentas, sesiones y recuperación

**Files:** `supabase/migrations/0166_tienda_cuentas.sql`; `supabase/scripts/smoke_tienda_cuentas.sql` (nuevo); ajustar los fixtures de `smoke_tienda_rls.sql` y `smoke_tienda_pedido.sql` solo donde un CHECK nuevo lo exija; `supabase/tests/0003_grants_secdef.test.sql` (añadir las RPC nuevas y las `tienda_*` existentes).

**Esquema** (Anexo §1): `tienda_cuentas` gana `apellido`, `fecha_nacimiento`, `email_verificado_at`, `intentos_fallidos`, `bloqueada_hasta`, `UNIQUE (id, tenant_id)` y disparador de `updated_at`; las tres tablas hijas ganan `tenant_id` (si no lo tienen) y FK compuesta `(cuenta_id, tenant_id)`; `tienda_recuperaciones` gana `usada_at` e índice por huella; `tienda_direcciones` gana `etiqueta`; índice parcial en `delivery_pedidos (tienda_cuenta_id)`; el teléfono de la cuenta se guarda normalizado a 10 dígitos. Las tablas están vacías en producción: comprobarlo en la Task 6 antes de aplicar.

- [ ] **Step 1: Smoke** con dos negocios, cubriendo como mínimo: registro (datos válidos e inválidos; correo repetido en el mismo negocio → `creada: false` sin crear ni cambiar nada; mismo correo en otro negocio → cuenta independiente; mayúsculas y espacios en el correo); `entrar` bien, mal, correo inexistente (misma salida), 5 fallos → bloqueada aunque la contraseña sea correcta, desbloqueo a los 15 min (`p_ahora`), y **un intento contra el otro negocio no mueve el contador**; sesión válida, vencida a los 30 días, cerrada, y **usada con el `p_tenant` de otro negocio → NULL**; recuperación: token correcto, usado dos veces, vencido a los 30 min, de otro negocio, y que aplicar cierra las sesiones viejas, levanta el bloqueo y sella `email_verificado_at`; cambio de contraseña (actual mala → false; buena → cierra las demás y conserva la presente); direcciones (alta, edición, borrado, la 6ª → `DIRECCIONES_LLENAS`, dirección de otra cuenta → no se toca); `mis_pedidos` (solo los de esa cuenta y ese negocio, estado derivado, `items` presentes); `pedir` con cuenta sigue funcionando (`tienda_crear_pedido` con `p_cuenta`); eliminar (contraseña mala → false; buena → sin cuenta, sin sesiones, sin direcciones, y sus pedidos con `tienda_cuenta_id` NULL); el hash guardado **no** es la contraseña y verifica con `crypt()`; y el bloque de privilegios: `anon` y `authenticated` sin EXECUTE en ninguna función nueva ni acceso a las tablas.
- [ ] **Step 2: Rojo.** **Step 3: Migración.** **Step 4: Verde** con todos los `smoke_tienda_*.sql` y `npm run smokes` completo.
- [ ] **Step 5: Commit** — `feat(tienda): cuentas de clientes en la base — registro, sesión, recuperación, direcciones y pedidos`.

---

### Task 2: la función — acciones de cuenta

**Files:** `supabase/functions/tienda/index.ts`; `supabase/functions/_shared/tienda/validar.ts`, `respuesta.ts`, nuevos `cuenta.ts` (lógica pura: lectura de la sesión de la cabecera, forma pública de la cuenta) y `correo-cuenta.ts` (tres plantillas), con sus `*.test.ts`; `supabase/functions/_shared/turnstile.ts` (acciones `tienda_registro`, `tienda_recuperar`); `supabase/functions/README.md`.

Según «Formas compartidas». Orden por acción: cupo → negocio (slug) → antirobot donde aplique → RPC. El token de sesión y el de recuperación se generan con `nuevoCodigo()` y viajan a la base solo como `huellaDe()` (Anexo §2.3). `pedir` lee la cabecera de sesión: sin cabecera → invitado como hoy; con cabecera válida → `p_cuenta`; con cabecera inválida → 403 `SESION_INVALIDA`. Nada de contraseñas, tokens ni correos en `console.*`.

- [ ] **Step 1: Pruebas** de `validar.ts` (cada acción nueva: forma, límites —contraseña 8–72, nombre y apellido ≤ 100, correo como hoy, teléfono normalizado—, claves desconocidas ignoradas), de `cuposDe` (cada rama y su «al fallar»), de las plantillas de correo (escapado de HTML del nombre del negocio y del cliente; el enlace de recuperación exacto), y de `cuenta.ts`.
- [ ] **Step 2: Rojo → verde** con `pnpm test:functions`. El handler se comprueba con el `tsc` estricto con `Deno` simulado que usaron las entregas 2 y 4 y por lectura.
- [ ] **Step 3: Commit** — `feat(tienda): la función atiende registro, entrada, recuperación y «mi cuenta»`.

---

### Task 3: la app — sesión en servidor y lógica

**Files:** `apps/tienda/app/api/tienda/route.ts`, `app/lib/servidor/funcion.ts`, nuevo `app/lib/servidor/sesion.ts`; `app/lib/api.ts`, `contrato.ts`, nuevo `app/lib/cuenta.ts` (validación de formularios, textos de error de cuenta, reconstruir un carrito desde `items` de un pedido); `next.config.mjs`, `robots.ts`; `packages/ui` (`Captcha`: acciones nuevas); pruebas.

Según «Formas compartidas» → «App: la cookie y la ruta». `llamarTienda` acepta la sesión como argumento y devuelve el JSON; el recorte del campo `sesion` y el manejo de la cookie viven en la ruta. Las pruebas existentes de la ruta siguen pasando sin cambiar expectativas (un `pedir` de invitado manda exactamente lo mismo).

- [ ] **Step 1: Pruebas** de la ruta con `fetch` simulado: cada acción nueva permitida; `Origin` ausente o ajeno en acciones con sesión → 403; sin `Content-Type` JSON → 400; la cookie de **otro** negocio no se manda; `sesion` de la respuesta se vuelve cookie con sus atributos exactos y **no** aparece en el cuerpo devuelto; `salir`, `eliminar_cuenta` y `SESION_INVALIDA` borran la cookie; el cuerpo no puede fijar `x-tienda-sesion` ni `p_cuenta`; `pedir` con cookie la reenvía. Y de `cuenta.ts`: validaciones y «pedir de nuevo» (items → carrito, descartando lo que no cumpla la forma).
- [ ] **Step 2: Rojo → verde**; `tsc --noEmit` de tienda y admin; `pnpm tipografia`.
- [ ] **Step 3: Commit** — `feat(tienda): sesión por cookie en el servidor de la tienda y lógica de cuentas`.

---

### Task 4: las pantallas — entrar, registro, recuperar y «Mi cuenta»

**Files:** `apps/tienda/app/[negocio]/{entrar,registro,recuperar,cuenta}/page.tsx`, componentes de cliente, `[negocio]/layout.tsx` (enlace «Entrar» / «Mi cuenta»), `components/datos.tsx` (integración), `[negocio]/privacidad/page.tsx`, `docs/diseno/tienda.md`.

- **Entrar / Registro / Recuperar:** formularios cortos, una acción principal, enlaces cruzados, `autocomplete` (`email`, `current-password`, `new-password`, `given-name`, `family-name`, `tel-national`), mostrar/ocultar contraseña, errores junto al campo. Registro: tras enviar, si la respuesta no trae cuenta (correo ya usado) se muestra «Revisa tu correo para continuar» — el mismo camino visual que un alta que pidiera confirmar, sin decir que ya existía. Recuperar: «Si hay una cuenta con ese correo, te mandamos un enlace.»; con `?t=` pide la contraseña nueva; el token se quita de la barra de direcciones (`history.replaceState`) en cuanto se lee. Todas vuelven a donde venía el cliente (`?volver=` validado contra rutas internas del mismo negocio; nunca una URL externa).
- **Mi cuenta:** datos (editar), direcciones guardadas (hasta 5, con etiqueta), mis pedidos (estado, total, «Pedir de nuevo» que arma el carrito y abre el menú, y «Ver» al seguimiento cuando aplique), cambiar contraseña, cerrar sesión, eliminar cuenta (zona aparte, pide la contraseña y explica qué se borra y qué conserva el restaurante). Sin sesión, redirige a `/entrar`.
- **En «Tus datos»:** sin sesión, una franja discreta «¿Ya tienes cuenta? Entra» / «Crea tu cuenta para guardar tus datos» que no estorba al invitado; con sesión, nombre/teléfono/correo prellenados desde la cuenta, selector de direcciones guardadas, y casilla «Guardar esta dirección» si es nueva. Con sesión no se escribe `vim.tienda.cliente` en `localStorage`.
- **Aviso de privacidad** provisional al día: cuentas, contraseña cifrada, cookie de sesión propia, cómo eliminar la cuenta y qué conserva el restaurante.
- Lógica fuera de los componentes y con prueba. Estados de carga/error/vacío. 44 px, 16 px en campos.

- [ ] Implementar; `pnpm --filter ./apps/tienda test`, `tsc --noEmit`, `pnpm tipografia`. **Commit** — `feat(tienda): entrar, registrarse, recuperar la contraseña y «Mi cuenta»`.

---

### Task 5: verificación y documentos

- [ ] ADR nuevo en `docs/decisiones/` (siguiente número libre): la tienda en línea es un canal de `delivery_pedidos`, sus clientes no viven en Supabase Auth, y las contraseñas van con bcrypt en la base (cambio respecto al diseño), con sus consecuencias. `docs/operacion/tienda-publica-salida.md` al día (correos de cuenta, acciones nuevas del antirobot, prueba de humo de cuentas).
- [ ] **Todo en verde:** smokes; `pnpm test:functions`; `pnpm -r test`; tipografía; `tsc` de las seis apps.
- [ ] **En el navegador, de punta a punta en local** con el arnés de la entrega 5 ampliado a las acciones de cuenta: registrarse, salir, entrar, contraseña mala, pedir con sesión (y ver el pedido en «Mi cuenta»), guardar dirección, pedir de nuevo, recuperar contraseña (leyendo el token del arnés), eliminar cuenta; y que la cookie de un negocio no sirve en otro. Decir en el informe lo que no se ejercitó (correos reales, antirobot, función de producción).
- [ ] PR contra `main`.

### Task 6: producción y mezcla

1. Comprobar que las cuatro tablas de cuentas están vacías en producción; aplicar la 0166; desplegar la función `tienda`; regenerar tipos.
2. Mezclar con el CI en verde. La tienda sigue sin publicarse.

## Lo que esta entrega NO hace

- Ligar la cuenta a los puntos de lealtad, ni mostrar saldo de puntos.
- Entrar con Google, Apple o por código al teléfono.
- Confirmación de correo obligatoria; doble factor.
- Fusionar pedidos de invitado con una cuenta nueva.
- Publicar la tienda, el aviso de privacidad definitivo, y la revisión de seguridad completa (entrega 7).
