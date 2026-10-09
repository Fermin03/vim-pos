# Tienda en línea · Entrega 7: la salida — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado:** ejecutándose por mandato de Fermín (8 oct 2026: «sigue con las demás entregas, toma las decisiones por mí y entrégame un reporte al final»). Las decisiones tomadas en su nombre están en «Decisiones» y van al reporte.

**Goal:** Dejar la tienda en línea lista para clientes reales, de modo que **mezclar este código no encienda nada** y que encenderla sea una lista corta de pasos que da Fermín: cerrar los pendientes técnicos que quedaron anotados, preparar la concesión del complemento a los planes, poner al día el admin y el panel, y dejar escritos la guía de encendido y los borradores legales.

**Architecture:** Una migración (0167) con los arreglos y con el encendido **empaquetado en una función que nadie llama todavía**: `tienda_encender_complemento()`. Mientras el complemento `TIENDA` siga inactivo en el catálogo, la sincronización de planes no lo concede y el admin sigue diciendo «estamos por lanzarla»; el día que Fermín decida, una sola llamada lo activa y lo concede a quien su plan lo incluye. El resto son cambios acotados en la función `tienda`, la app, el agente de la caja (que aún no se ha publicado: va en la 0.8.0), el admin y el panel.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` §7 (planes), §13–§15 (legales, lanzamiento). **Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-09-tienda-7-hechos-de-la-salida.md` (el precedente de lealtad, los espejos en TypeScript, la invitación del admin, los pendientes confirmados y los 18 interruptores). Las tareas lo citan como «Anexo §N».

Plan 7 de 7.

## Decisiones (tomadas por Claude en nombre de Fermín)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Mezclar esta entrega no enciende ni concede nada.** El encendido es un paso aparte y explícito (`tienda_encender_complemento()`), que solo se ejecuta con el visto bueno de Fermín. | Activar una función de pago para clientes reales no se decide por él. |
| 2 | **Al encender, el complemento se concede a todo negocio activo, en prueba o interno cuyo plan lo incluye** (Negocio, Cadena y los heredados), sin costo. Esencial lo contrata aparte por $100 al mes. | Decisión de Fermín sobre planes; se concede por plan actual para no saltarse a nadie. |
| 3 | **Conceder no abre ninguna tienda.** Cada dueño la configura y la enciende desde su admin. | Así está diseñado desde la entrega 1. |
| 4 | **El admin dice «Incluida en tu plan» o «$100 al mes en tu plan», y el camino para contratarla es el mismo de los demás complementos: escribir por WhatsApp.** No hay compra con un clic. | Ningún complemento se contrata solo desde el admin; el cobro es manual. |
| 5 | **Un pedido ya no se puede duplicar por reintento.** Cada intento de compra lleva una llave; si se reintenta, el servidor devuelve el mismo pedido. Con eso, «No pudimos confirmar tu pedido» ofrece reintentar sin riesgo. | Era el pendiente más serio de la tienda pública. |
| 6 | **Si la caja aceptó un pedido pero en 15 minutos no logró crearle su cuenta (se apagó, sin turno), el pedido se cancela solo** y el cliente lo ve. | Hoy se quedaba «en preparación» para siempre. La caja pasa a avisar «ya lo tengo» al crear la cuenta. |
| 7 | **A los 30 días se borran también las notas del pedido en línea** (la nota general y las de cada producto), además de nombre, teléfono, correo y dirección. | El aviso de privacidad lo promete y hoy no se cumplía. |
| 8 | **El límite de pedidos por red pasa a ser por restaurante** (8 por hora por red y restaurante). | Las redes de celular comparten dirección; un cliente de un restaurante no debe quedarse sin poder pedir por lo que hicieron en otro. |
| 9 | **Tope de intentos de entrada por restaurante** (300 cada 10 minutos), además del tope por red. | Protege la base de datos de un ataque de contraseñas. |
| 10 | **Los textos legales quedan como borradores para revisión, no publicados**: aviso de privacidad y términos para el comensal, y la sección nueva de los términos de VIM POS. En la tienda siguen páginas provisionales veraces, marcadas como tales. | Un texto legal definitivo lo debe revisar una persona; no se publica por él. |
| 11 | **Sin analítica en la tienda pública.** | El aviso lo promete; los números del negocio salen de la base. |
| 12 | **No se toca el sitio web ni las novedades.** Queda la lista de lo que habría que anunciar. | Anunciar es parte del lanzamiento, que decide Fermín. |

## Global Constraints

- **Cargar `ponytail` antes de escribir código**; para pantallas, además `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, y el documento de diseño de la app que se toque.
- **Regla de oro de esta entrega:** con el complemento `TIENDA` inactivo (`addons.activo = false`), el comportamiento visible del admin, del panel, de las altas y de los cambios de plan es **idéntico al de hoy**. Cada tarea lo demuestra con una prueba.
- **Lo existente intacto:** Uber, pedir como invitado, cuentas, el POS. Sin editar expectativas de pruebas previas salvo donde una tarea lo diga.
- **Caja 0.7.0 en servicio y caja 0.8.0 sin publicar:** lo que cambie en la nube debe seguir sirviendo a las dos (una caja que no avisa «ya lo tengo» no existe en producción, porque ninguna 0.7.0 recibe pedidos de la tienda).
- Migración **0167** (confirmar contra `origin/main`); corre también en la caja; funciones redefinidas completas desde su definición vigente.
- Estados HTTP de la función: los que la app ya deja pasar. Códigos de SQL con guion bajo.
- Sin `any`. Español en el dominio. Dinero en texto. Textos para quien cobra o para un comensal, sin palabras internas.
- Pruebas: smokes; `pnpm test:functions`; `pnpm test:escritorio`; vitest por app. Nunca `next build`, CLI de `supabase` en local, ni `git stash`. No subir la versión de `desktop/package.json`.
- Commits en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Formas compartidas

**Encendido** — `tienda_encender_complemento() RETURNS jsonb` (solo `service_role`), idempotente: pone `addons.activo = true` para `TIENDA`; concede el complemento (incluido en plan, $0) a cada negocio en estado `ACTIVO`, `TRIAL` o `INTERNO` cuyo `plan_actual_id` tiene `features_incluidos.tienda_incluida = true` y que no lo tenga ya vigente; devuelve `{ activado: boolean, concedidos: integer, ya_tenian: integer }`. No toca `modulo_tienda_activo` de nadie.

**Sincronización de planes** — `_sincronizar_addons_del_plan` gana la pareja `('TIENDA','tienda_incluida')`, que **solo actúa si `addons.activo` de `TIENDA` es `true`**. Las demás parejas, igual que hoy.

**Idempotencia de `pedir`** — el cuerpo de `pedir` acepta `clave` (22 caracteres con la forma de un código, generada en el navegador por intento de compra). Con `clave`, el código de seguimiento **se deriva**: `HMAC-SHA256(VIM_TIENDA_SECRET, "<slug>:<clave>")` → base64url → 22 caracteres; su huella es el `seguimiento_hash`. `tienda_crear_pedido` recibe además `p_clave text DEFAULT NULL`: si ya existe un pedido de ese negocio con ese `seguimiento_hash`, **no crea nada** y devuelve el existente (`folio_corto`, `total_mxn`, `vence_aceptacion`). Sin `clave`, todo como hoy. La `clave` no se guarda en ningún lado (basta la huella).

**«Ya lo tengo»** — la acción `estado` de `delivery-accion` y `tienda_reportar_estado` aceptan además `EN_PREPARACION` (desde `ACEPTADO`). El agente de la caja lo reporta en cuanto crea la cuenta local del pedido. `delivery_marcar_expirados` cancela (motivo `OTRO`, `cancelado_por = 'RESTAURANTE'`) los pedidos de la tienda de gestión `ESCRITORIO` que lleven más de 15 minutos en `ACEPTADO`. El seguimiento del cliente ya trata `ACEPTADO` y `EN_PREPARACION` igual.

**Cupos** — `pedir`: `tienda:pide:ip:<ip>:<slug>` 8 / h (reemplaza al compartido de 5 / h); `entrar`: se añade `tienda:entra:negocio:<slug>` 300 / 10 min (cierra si el control falla).

---

### Task 1: la base (0167)

**Files:** `supabase/migrations/0167_tienda_salida.sql`; `supabase/scripts/smoke_tienda_salida.sql` (nuevo); ajustar `smoke_tienda_modulo.sql`, `smoke_tienda_estado_pedido.sql`, `smoke_tienda_pedido.sql` donde sus aserciones cambien **por diseño** (decirlo en el informe); `supabase/tests/0003_grants_secdef.test.sql`.

- `_sincronizar_addons_del_plan` y `tienda_encender_complemento()` según «Formas compartidas» (Anexo §1.4–§1.6: la clave es `tienda_incluida`, en femenino).
- `tienda_crear_pedido` con `p_clave` (idempotencia por `seguimiento_hash` + negocio; con carrera, el segundo no crea y devuelve el primero).
- `tienda_reportar_estado` acepta `EN_PREPARACION`; `delivery_marcar_expirados` cancela los `ACEPTADO` de `ESCRITORIO` de la tienda con más de 15 min (después de su pasada de vencidos; sin tocar los de gestión `NUBE`, que derivan su estado del ticket, ni los de canal `APP`).
- Retención (Anexo §7c): a los 30 días se blanquean también `nota_cliente` y la `nota` de cada renglón de `items` de los pedidos de la tienda, y se alcanzan los que quedaron en `ACEPTADO`/`EN_PREPARACION`/`LISTO` viejos; `tienda_cuenta_id` se conserva. Y un barrido de sesiones y enlaces de recuperación vencidos en la misma pasada diaria.
- **Smoke:** con el complemento inactivo, un alta en Negocio y un cambio de plan **no** conceden `TIENDA` (regla de oro); `tienda_encender_complemento()` activa, concede a ACTIVO/TRIAL/INTERNO de planes que la incluyen y no a Esencial ni a un negocio dado de baja, no enciende el interruptor de nadie, y llamarla dos veces no duplica; después de encender, un alta en Negocio sí la concede y pasar a Esencial la retira (y apaga la tienda por el disparador existente); idempotencia de `pedir` (misma `clave` → mismo pedido, una sola fila; otra `clave` → otro pedido; sin `clave` → como hoy); `EN_PREPARACION`; cancelación a los 15 min solo del caso descrito; retención con notas y con una fila atascada; permisos.

- [ ] Rojo → migración → verde con todos los `smoke_tienda_*.sql`, `smoke_delivery_app.sql` y `npm run smokes` completo. **Commit** — `feat(tienda): la salida en la base — encendido empaquetado, pedido sin duplicados, caducidad y retención`.

### Task 2: la nube (funciones)

**Files:** `supabase/functions/tienda/index.ts`, `_shared/tienda/{validar,respuesta,seguimiento}.ts` (+ pruebas); `supabase/functions/delivery-accion/index.ts`, `_shared/delivery/enlinea.ts` (+ prueba); `supabase/functions/delivery-espejo/index.ts`, `_shared/delivery/espejo.ts` (+ prueba); `supabase/functions/README.md`.

- `pedir` con `clave`: código derivado (función pura `codigoDeClave(secreto, slug, clave)` con prueba de vector fijo), `p_clave` a la RPC; la respuesta es la de siempre. Sin `clave`, igual que hoy.
- Cupos nuevos de «Formas compartidas».
- `delivery-accion`: `estado` admite `EN_PREPARACION`.
- `delivery-espejo`: para decidir el sondeo rápido solo cuentan los pedidos de la tienda recibidos en las últimas 6 horas (un pedido atascado ya no deja a la caja sondeando cada 10 s para siempre).

- [ ] Pruebas primero; `pnpm test:functions`; `tsc` con `Deno` simulado para los tres handlers. **Commit** — `feat(tienda): pedir sin duplicados, topes por restaurante y «ya lo tengo» en la nube`.

### Task 3: la tienda pública y la caja

**Files:** `apps/tienda/app/lib/{envio,api,contrato}.ts`, `components/datos.tsx`, `app/api/tienda/route.ts` (deja pasar `clave`) (+ pruebas); `desktop/src/delivery-espejo.mjs`, `delivery-espejo-plan.mjs` (+ pruebas); `desktop/RUNBOOK.md`.

- **Tienda:** una `clave` nueva por intento de compra (se crea al tocar «Enviar pedido» y se conserva mientras ese intento siga sin confirmar; cambia cuando el pedido entra o cuando el cliente modifica el carrito o sus datos); `SIN_CONFIRMAR` ahora ofrece **«Reintentar»** como acción principal (es seguro) y «Llamar al restaurante» como secundaria; el texto deja de asustar.
- **Caja:** tras crear la cuenta local de un pedido de la tienda, reporta `EN_PREPARACION` (mismo mecanismo y memoria de reportes que `LISTO`); la tabla «qué estado reportar» gana esa fila al principio (ticket abierto sin imprimir ni repartidor → `EN_PREPARACION` si el pedido local sigue `ACEPTADO`).

- [ ] Pruebas primero; `pnpm --filter ./apps/tienda test`, `tsc`; `pnpm test:escritorio`. **Commit** — `feat(tienda): reintentar un pedido es seguro y la caja avisa cuando ya lo tiene`.

### Task 4: el admin y el panel

**Files:** `apps/admin/app/lib/tienda-plan.ts`, `tienda-reglas.ts`, `components/tienda-sin-contratar.tsx`, `tienda-estado.tsx`, `tienda-compartir.tsx` (+ pruebas); `apps/platform/app/lib/cambio-plan.ts` (`ADDONS_DEL_PLAN`), `addons.ts` (`INCLUIDOS_DESDE_NEGOCIO`) y los dos textos del panel (Anexo §2, §3) (+ pruebas); una prueba nueva que compare `ADDONS_DEL_PLAN` con las parejas de la definición vigente de `_sincronizar_addons_del_plan` leyendo el SQL.

- **Invitación del admin** (Anexo §4), leyendo `addons` (`activo`, precio) y el plan del negocio: complemento **inactivo** → exactamente lo de hoy («Estamos por lanzarla…»); **activo y el plan la incluye pero aún no está concedida** → «Tu plan incluye la tienda en línea. Escríbenos para activarla.»; **activo y el plan no la incluye** → «La tienda en línea cuesta $100 al mes en tu plan. Escríbenos para contratarla.» (precio leído de `addons`), con la tarjeta de contacto que ya usan los demás complementos.
- Textos «Tu plan ya no incluye…» → uno que sirva también a quien la pagaba aparte.
- Panel: `TIENDA` en `ADDONS_DEL_PLAN` e `INCLUIDOS_DESDE_NEGOCIO` (con el complemento inactivo el panel no lo lista, así que nada cambia a la vista).

- [ ] Pruebas primero; tests y `tsc` de admin y platform; `pnpm tipografia`. **Commit** — `feat(tienda): el admin y el panel listos para cuando la tienda se active`.

### Task 5: documentos, legales y páginas provisionales

**Files:** `docs/operacion/tienda-encendido.md` (nuevo: **la** lista de encendido); `docs/legal/` (borradores); `apps/tienda/app/[negocio]/privacidad/page.tsx`, `apps/tienda/app/[negocio]/terminos/page.tsx` (nueva, provisional) y su enlace en el pie; `docs/operacion/tienda-publica-salida.md`, `instalador-0.8.0-pendiente.md`, `tienda-en-linea-caja.md`; `docs/decisiones/0032…` (lo que cambió); `docs/operacion/tienda-vigilancia.md` (nuevo).

- **`tienda-encendido.md`**: los 18 interruptores del Anexo §9 convertidos en una lista ordenada con casillas, quién hace cada paso (**Fermín** / **Claude con su visto bueno**), cómo comprobarlo y cómo deshacerlo; incluye la llamada a `tienda_encender_complemento()`, el orden respecto del instalador 0.8.0 (primero prueba interna con POS web, luego 0.8.0 en martes, luego Knock-Out, luego todos), y la prueba de humo de punta a punta.
- **Borradores legales** en `docs/legal/` marcados «BORRADOR — requiere revisión legal»: aviso de privacidad de la tienda (plantilla por restaurante: el restaurante es responsable, VIM encargado; qué se recaba, para qué, conservación —30 días el detalle del pedido, el cliente del restaurante hasta que pida su baja—, Cloudflare y Google Fonts, cuentas y cookie de sesión, derechos ARCO y cómo ejercerlos; con los huecos que solo el restaurante puede llenar: razón social y domicilio), términos para el comensal (quién vende, pago al recibir, cancelaciones, sin tiempo estimado), y la sección nueva de los términos de VIM POS para el restaurante. Lista de las decisiones que el texto obliga a tomar.
- **Páginas provisionales de la tienda** veraces con lo que el sistema hace **tras esta entrega** (las notas sí se borran a los 30 días) y una de términos, corta y marcada como provisional.
- **`tienda-vigilancia.md`**: las consultas del Anexo §8 escritas y listas para copiar (pedidos por día y desenlace, vencidos sin aceptar, atascados, tiendas encendidas, cajas en 0.7.0 con tienda, topes alcanzados, que el cron corre), y qué mirar la primera semana.

- [ ] Escribir; `tsc` y pruebas de `apps/tienda`; `pnpm tipografia`. **Commit** — `docs(tienda): lista de encendido, borradores legales y qué vigilar`.

### Task 6: revisión de seguridad completa, verificación y mezcla

- [ ] **Auditoría de seguridad** de toda la función pública, las cuentas y la app (entregas 2, 5, 6 y 7 juntas), por un revisor que no las escribió; una tanda de arreglos.
- [ ] Todo en verde; el manejador real de `tienda` ejecutado en local con el arnés (pedido con la misma `clave` dos veces → un solo pedido; topes nuevos); recorrido en navegador del reintento.
- [ ] PR; aplicar la 0167 en producción; desplegar `tienda`, `delivery-accion`, `delivery-espejo`; tipos; mezclar con el CI en verde.
- [ ] **No** ejecutar `tienda_encender_complemento()`, **no** publicar el instalador, **no** tocar Vercel, dominio ni Cloudflare (decisión 1).

## Lo que esta entrega NO hace

- Encender el complemento, concederlo, publicar la tienda o el instalador 0.8.0, anunciar nada.
- Publicar textos legales definitivos; pedir al dueño que acepte condiciones al encender su tienda (se anota como decisión para Fermín).
- Confirmación de correo obligatoria, ligar cuentas a lealtad, pago con tarjeta en línea, tarjeta de pedidos en el panel de VIM.
