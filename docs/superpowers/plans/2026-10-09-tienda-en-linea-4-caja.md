# Tienda en línea · Entrega 4: la caja y el POS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado:** ejecutándose por mandato de Fermín (8 oct 2026: «sigue con las demás entregas, toma las decisiones por mí y entrégame un reporte al final»). Las decisiones tomadas en su nombre están en «Decisiones» y van al reporte.

**Goal:** Que un pedido de la tienda en línea suene en la caja, se pueda aceptar o rechazar, se vuelva ticket con sus comandas impresas, y que el cliente vea cada cambio de estado; con pausa desde la caja y sin tocar el camino de Uber.

**Architecture:** Tres frentes sobre el mismo pedido (`delivery_pedidos`, canal `TIENDA`). **Nube:** `delivery-accion` aprende a aceptar, rechazar y recibir estados de un pedido de la tienda sin llamar a Uber, y a pausar la tienda; `delivery-espejo` manda además cómo acepta la tienda. **Caja instalada:** el agente de espejo baja esos pedidos, crea el ticket local con `crear_ticket_desde_tienda` y reporta el estado mirando el ticket. **POS (web y dentro de la caja):** la pantalla pasa a «Pedidos en línea», con tarjeta propia para la tienda, timbre que se repite, comandas al aceptar y la barra de pausa.

**Tech Stack:** PL/pgSQL + smokes; Edge Functions Deno/TS con lógica pura probada en Node; agente de escritorio en `.mjs` con `node --test`; POS en Next.js con vitest para la lógica pura.

**Spec:** `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md` §8 y §3. Notas que dejaron las entregas 1, 2 y 3 para esta: secciones «Entrega 4» al final de sus planes en `docs/superpowers/plans/`.

**Anexo obligatorio:** `docs/superpowers/plans/anexos/2026-10-09-tienda-4-hechos-de-caja-y-pos.md` — cómo están hechos hoy `delivery-accion`, el agente, la pantalla del POS, las comandas y el sync, con `archivo:línea`. Las tareas lo citan como «Anexo §N».

Plan 4 de 7.

## Decisiones (tomadas por Claude en nombre de Fermín)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Las acciones de la tienda propia en `delivery-accion` se llaman `enlinea_estado`, `enlinea_pausar`, `enlinea_reanudar`, `enlinea_presente`.** No se reutiliza `tienda_*`. | `tienda_*` ya es de Uber («la tienda de Uber») y exige el módulo de apps; reutilizarlo dejaría fuera a quien solo tiene la tienda propia. |
| 2 | **El cajero no tiene botón «Marcar listo» en pedidos de la tienda.** El estado sale solo de lo que ya hace: imprimir el ticket o asignar repartidor → en camino / listo para recoger; cobrar → entregado; cancelar → cancelado. | Es lo que Fermín definió en el diseño. |
| 3 | **Si un pedido no se puede convertir en ticket por algo que no se arregla reintentando** (el total ya no coincide, la zona cambió, un producto dejó de existir), **se cancela solo y el cliente lo ve como cancelado**, y la caja lo explica al cajero. Sin turno abierto, sí se reintenta. | Un pedido aceptado que nunca llega a cocina es peor que uno cancelado a tiempo. |
| 4 | **Con aceptación automática y sin caja instalada, quien acepta es el POS web abierto con turno**, no la nube al recibir el pedido. | Es el mismo que imprime las comandas; si no hay un POS abierto no hay quien cocine. |
| 5 | **La forma de pago y la nota del cliente se ven en la cuenta y salen en el ticket impreso.** | Hoy `nota_general` no se muestra ni se imprime en ningún lado: el repartidor no sabría con cuánto paga el cliente. |
| 6 | **La pausa ofrece 30 minutos, 1 hora o «hasta que la reanude».** | Decisión de Fermín en el diseño. |
| 7 | **El aviso al celular del dueño cuando un pedido se vence dice de dónde era** («Tienda en línea: pedido sin aceptar» / «Uber Eats: pedido sin aceptar»). | Hoy dice siempre Uber. |
| 8 | **No se sube la versión de la caja ni se empaqueta instalador en esta entrega.** El código queda en `main`; el instalador 0.8.0 lo decide y aprueba Fermín (regla: lista de lo que incluye, martes). | Publicar a las cajas de clientes no es una decisión que se tome por él. |

## Global Constraints

- **Cargar `ponytail` antes de escribir código**; para pantallas, además `frontend-design`, `ui-ux-pro-max`, `emil-design-eng`, y leer `docs/diseno/nucleo.md` y `docs/diseno/pos.md`.
- **El camino de Uber (canal `APP`) no cambia de comportamiento.** Toda rama nueva se decide por `canal === 'TIENDA'`. `smoke_delivery_app.sql`, `smoke_combos_uber.sql`, las pruebas de `_shared/delivery/*.test.ts` y `desktop/src/delivery-espejo*.test.mjs` existentes siguen en verde sin editar sus expectativas (salvo donde una tarea lo diga expresamente).
- **Una caja 0.7.0 en servicio no debe notar nada**: sigue mandando solo `{desde}` y recibe exactamente lo de hoy.
- **RLS sagrado**: el POS lee `delivery_pedidos` con la sesión del empleado y nunca escribe en ella; todo cambio de estado va por `delivery-accion` (`service_role` del lado del servidor).
- **El negocio y la sucursal salen de la sesión** (empleado o dispositivo), nunca del cuerpo, salvo `sucursal_id` validada contra el negocio de la sesión.
- **Motivos de rechazo de lista cerrada**: `AGOTADO`, `SATURADO`, `CERRADO`, `OTRO`. En un pedido de la tienda nunca se guarda texto libre del cajero (`tienda_seguimiento` solo enseña el código).
- **Dinero `numeric(12,2)`; en JSON, texto.** Sin `any`. Español en el dominio. Textos para quien cobra en la caja, sin palabras internas.
- **Migración:** número tentativo **0164**; confirmar contra `origin/main` y ramas vivas. Corre también en la caja.
- **Pruebas:** smokes (`cd desktop && npm run smokes -- <archivo>`), `pnpm test:functions`, `pnpm test:escritorio` (rojos conocidos en Windows: aborto libuv de `endurecimiento.test.mjs`), `pnpm --filter ./apps/pos test`, `tsc --noEmit` por app. Nunca `next build`, CLI de `supabase` en local, ni `git stash`.
- **Nada de producción sin pasar por la Task 7**; el instalador de la caja queda fuera (decisión 8).
- Commits en español con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Formas compartidas

**Respuesta de `delivery-espejo` a una caja que declara `tienda: true`** — se añade la clave `tienda` (ausente o `null` para las demás):

```json
{ "tienda": { "participa": true, "aceptacion": "MANUAL", "pausa_hasta": null } }
```

**`delivery-accion`, acciones nuevas y ramas** (cuerpo → respuesta):

| Acción | Cuerpo | Quién | Efecto | Respuesta |
|---|---|---|---|---|
| `aceptar` (pedido `TIENDA`) | `pedido_id` | empleado o caja | `ESCRITORIO`: reclama (si es caja) y pasa a `ACEPTADO`; el ticket lo crea el agente. `NUBE`: `crear_ticket_desde_tienda` | `{ok, ticket_id?}` |
| `rechazar` (pedido `TIENDA`) | `pedido_id`, `motivo` | empleado o caja | `RECHAZADO` con el código, sin detalle | `{ok}` |
| `estado` | `pedido_id`, `estado` ∈ `LISTO`,`ENTREGADO`,`CANCELADO`, `motivo?` | solo caja | `tienda_reportar_estado` | `{ok, estado}` |
| `enlinea_estado` | `sucursal_id` | empleado o caja | lectura | `{participa, aceptacion, pausa_hasta, motivo}` — `motivo` = `tienda_estado_sucursal(sucursal,'RECOGER')` o `null` si recibe |
| `enlinea_pausar` | `sucursal_id`, `duracion` ∈ `30m`,`1h`,`indefinida` | empleado o caja | `pausa_hasta` = ahora + duración, o `2999-12-31` | como `enlinea_estado` |
| `enlinea_reanudar` | `sucursal_id` | empleado o caja | `pausa_hasta = NULL` | como `enlinea_estado` |
| `enlinea_presente` | `sucursal_id` | solo empleado (POS web) | sella `cajas.espejo_turno_abierto_at` de la caja del turno abierto de esa sucursal en la nube; sin turno abierto no sella | `{ok, sellado}` |

Errores nuevos: `SIN_MODULO_TIENDA` (403), `SUCURSAL_SIN_TIENDA` (404, no hay fila en `tienda_sucursales`), `ESTADO_INVALIDO` (400), `SOLO_DISPOSITIVO` / `SOLO_EMPLEADO` (403), `PEDIDO_CANCELADO` (409: un error no reintentable al crear el ticket canceló el pedido; la respuesta lleva `causa` con el código).

**Clasificación de un fallo al crear el ticket de un pedido de la tienda** (misma tabla en la nube y en la caja):

| Código en el mensaje | Qué se hace |
|---|---|
| `SIN_TURNO_ABIERTO`, violación de unicidad (`23505`) | Reintentable: el pedido se queda como está |
| `TOTAL_NO_COINCIDE`, `ENVIO_NO_COINCIDE`, `DIRECCION_INVALIDA`, `CLIENTE_BLOQUEADO`, `PRODUCTO_DE_OTRO_NEGOCIO`, `OPCION_DE_OTRO_NEGOCIO`, `ITEM_SIN_MAPEAR`, `COMBO_ELECCION_SIN_MAPEAR`, `COMBO_ELECCION_AMBIGUA`, `SUCURSAL_DE_OTRO_NEGOCIO`, «no existe o está eliminado», «no está disponible» | No reintentable: el pedido pasa a `CANCELADO` con motivo `OTRO` (si estaba `RECIBIDO`, a `RECHAZADO`) |
| cualquier otro | Reintentable, y se registra |

**Estado que reporta la caja mirando el ticket local** (diseño §8), de arriba hacia abajo:

| Ticket local | Estado a reportar |
|---|---|
| `CANCELADO` | `CANCELADO` |
| `PAGADO` o `FACTURADO` | `ENTREGADO` |
| `ticket_impreso_at` con valor, o existe su `delivery_asignaciones` | `LISTO` |
| otro | nada |

---

### Task 1: la base — reportar estado y el aviso de vencidos por canal

**Files:**
- Create: `supabase/migrations/0164_tienda_caja.sql`
- Test: `supabase/scripts/smoke_tienda_estado_pedido.sql`

**Interfaces — Produces:**
- `tienda_reportar_estado(p_tenant uuid, p_pedido uuid, p_estado text, p_motivo text DEFAULT NULL) RETURNS text` — solo `service_role`. Devuelve el estado en que quedó el pedido.
  - Exige pedido de `p_tenant` y `canal = 'TIENDA'` (`PEDIDO_NO_EXISTE`); `p_estado` ∈ `LISTO`, `ENTREGADO`, `CANCELADO` (`ESTADO_INVALIDO`).
  - **Solo avanza**: orden `ACEPTADO`/`EN_PREPARACION` < `LISTO` < `ENTREGADO`; `CANCELADO` se acepta desde cualquier estado vivo (`RECIBIDO`, `ACEPTADO`, `EN_PREPARACION`, `LISTO`). Un reporte que no avanza (el mismo estado, uno anterior, o cualquier cosa sobre un pedido ya `ENTREGADO`, `CANCELADO`, `RECHAZADO` o `EXPIRADO`) **no cambia nada y devuelve el estado actual**: es idempotente y tolera reportes repetidos o tardíos.
  - Sella `listo_at`, `entregado_at`, `cancelado_at`, y en `CANCELADO` `cancelado_por = 'RESTAURANTE'` y `motivo_cancelacion` = `p_motivo` solo si es uno de `AGOTADO`, `SATURADO`, `CERRADO`, `OTRO`; cualquier otra cosa se guarda como `OTRO`.
- `delivery_avisar_expirados(p_tenant uuid, p_sucursal uuid, p_n integer, p_canal text)` — firma nueva (se elimina la de tres argumentos). Título `'Tienda en línea: pedido sin aceptar'` y `url = '/tienda'` para `TIENDA`; lo de hoy para `APP`. `delivery_marcar_expirados()` se redefine completa desde su definición vigente (0097), agrupando el aviso por sucursal **y canal**.

- [ ] **Step 1: Smoke** con estos casos (fixture: pedidos creados a mano como en `smoke_tienda_ticket.sql`):

| # | Afirmar |
|---|---|
| 1 | `ACEPTADO` → `LISTO` devuelve `LISTO` y sella `listo_at` |
| 2 | `LISTO` → `ENTREGADO` sella `entregado_at`; después `LISTO` devuelve `ENTREGADO` y no cambia nada |
| 3 | `ACEPTADO` → `ENTREGADO` directo (cobrado sin imprimir) funciona |
| 4 | `RECIBIDO` → `LISTO` no cambia nada (un pedido sin aceptar no puede estar listo) |
| 5 | `CANCELADO` desde `RECIBIDO`, `ACEPTADO` y `LISTO`: queda `CANCELADO`, `cancelado_por = 'RESTAURANTE'`, motivo `AGOTADO` se conserva, `'texto libre 4771112233'` se guarda como `OTRO` |
| 6 | Sobre `CANCELADO`, `RECHAZADO` y `EXPIRADO`, cualquier reporte devuelve ese estado sin tocar la fila |
| 7 | Estado `'RECIBIDO'`, `'LO QUE SEA'`, `NULL` → `ESTADO_INVALIDO` |
| 8 | Pedido de otro negocio, de canal `APP`, o inexistente → `PEDIDO_NO_EXISTE` |
| 9 | `tienda_seguimiento` de un pedido `ESCRITORIO` refleja cada paso: `EN_PREPARACION` → `EN_CAMINO`/`LISTO_PARA_RECOGER` → `ENTREGADO`; y `CANCELADO` con su motivo |
| 10 | `anon` y `authenticated` no pueden ejecutar `tienda_reportar_estado` |
| 11 | Vencer un pedido `TIENDA` y uno `APP` de la misma sucursal con `delivery_marcar_expirados()`: los dos quedan `EXPIRADO`; la función no falla donde no hay `pg_net` ni Vault (la caja) — mirar cómo lo tolera hoy la 0097 y conservarlo |

- [ ] **Step 2: Rojo.** **Step 3: Migración**, leyendo antes 0091 (`delivery_pedido_transicion`) y 0097 completa. **Step 4: Verde**, con `smoke_tienda_seguimiento.sql smoke_tienda_pedido.sql smoke_delivery_app.sql` y el smoke de expirados que exista para Uber.
- [ ] **Step 5: Commit** — `feat(tienda): la caja reporta el estado de un pedido y el aviso de vencidos dice de dónde era`.

---

### Task 2: la nube — `delivery-accion` y `delivery-espejo` entienden la tienda

**Files:**
- Create: `supabase/functions/_shared/delivery/enlinea.ts`, `enlinea.test.ts`
- Modify: `supabase/functions/_shared/delivery/modulo.ts`, `modulo.test.ts`, `espejo.ts`, `espejo.test.ts`
- Modify: `supabase/functions/delivery-accion/index.ts`, `supabase/functions/delivery-espejo/index.ts`

**Interfaces — Produces** (`enlinea.ts`, puro, probado en Node):

```ts
export const ACCIONES_ENLINEA = ["enlinea_estado", "enlinea_pausar", "enlinea_reanudar", "enlinea_presente"] as const;
export const MOTIVOS_TIENDA = ["AGOTADO", "SATURADO", "CERRADO", "OTRO"] as const;
/** Cualquier motivo fuera de la lista (incluido POS_OFFLINE y texto libre) es OTRO. */
export function motivoDeTienda(x: unknown): (typeof MOTIVOS_TIENDA)[number];
/** Hasta cuándo queda en pausa. "indefinida" → 2999-12-31T00:00:00Z. null si la duración no es válida. */
export function pausaHasta(duracion: unknown, ahora: Date): string | null;
/** Clasifica el mensaje de error de crear_ticket_desde_tienda (tabla «Clasificación de un fallo»). */
export function fallaDeTicket(mensaje: string, codigoPg?: string): { reintentable: boolean; codigo: string };
export function moduloTiendaActivo(mod: unknown): boolean;   // efectivos.tienda === true, falla cerrado
/** Con algún pedido vivo de la tienda, el sondeo va al ritmo rápido. */
```

`espejo.ts`: `cadenciaEspejo` da `RAPIDA_MS` también cuando hay algún pedido vivo con `canal === 'TIENDA'` (cualquier estado vivo, no solo `RECIBIDO`), para que los estados lleguen al cliente en segundos. Los pedidos de `APP` conservan su regla.

**`modulo.ts`**: `ACCIONES_TIENDA` (las cuatro de Uber) **no cambia**, ni su prueba. `accionExigeModulo` sigue hablando solo de esas. Las `enlinea_*` se guardan con `moduloTiendaActivo`.

**`delivery-accion/index.ts`** (leer el archivo entero y el Anexo §1 antes):
- Las `enlinea_*` se despachan antes de exigir `pedido_id`: exigen `sucursal_id` de una sucursal del negocio de la sesión; si la sesión es de caja, además debe ser **su** sucursal; `SIN_MODULO_TIENDA` si el módulo no es efectivo; `SUCURSAL_SIN_TIENDA` si no hay fila en `tienda_sucursales`. Efectos según la tabla de «Formas compartidas».
- La lectura del pedido añade `canal`. La guarda `pedido.app !== "APP_UBEREATS"` pasa a aplicar **solo** a `canal === 'APP'`. Un pedido `TIENDA` va por su propia rama y **nunca** llama a Uber ni escribe `delivery_eventos` de salida a una app.
- `aceptar` (TIENDA): estado `RECIBIDO` o `ERROR` (si no, `ACCION_INVALIDA`). `ESCRITORIO`: si es caja, reclama; `delivery_pedido_transicion(ACEPTADO)`. `NUBE`: `crear_ticket_desde_tienda`; ante error, `fallaDeTicket`: reintentable → 409 con su código y el pedido intacto; no reintentable → `RECHAZADO` con motivo `OTRO` y 409 `PEDIDO_CANCELADO` con `causa`.
- `rechazar` (TIENDA): `RECIBIDO` o `ERROR`; `delivery_pedido_transicion(RECHAZADO, motivoDeTienda(body.motivo))`. **`body.detalle` se ignora.**
- `estado`: solo caja (`SOLO_DISPOSITIVO`), pedido `TIENDA` de su sucursal; `tienda_reportar_estado`.
- `reclamar` y `listo` sobre un pedido `TIENDA`: `reclamar` funciona igual que hoy; `listo` responde `ACCION_INVALIDA` (decisión 2).
- `delivery_pedido_transicion` no sella `aceptado_at`: al aceptar en `ESCRITORIO` un pedido `TIENDA`, sellarlo con un `update` (`aceptado_at = now()` donde sea NULL).

**`delivery-espejo/index.ts`**: la consulta de `tienda_sucursales` trae `participa, pausa_hasta`, y se añade la de `tienda_config.aceptacion`; la respuesta lleva `tienda: {participa, aceptacion, pausa_hasta}` cuando `alcance.conTienda`, y `null` si no. Una caja que no declara la tienda recibe **exactamente** la respuesta de hoy (sin la clave).

- [ ] **Step 1: Pruebas** (`enlinea.test.ts`, y casos nuevos en `espejo.test.ts`): cada fila de la tabla de clasificación; `motivoDeTienda` con cada motivo, `POS_OFFLINE`, texto libre, `null`; `pausaHasta` con `30m`, `1h`, `indefinida`, basura; `moduloTiendaActivo` con `null`, sin la clave, `"true"`, `true`; cadencia: un pedido `TIENDA` `ACEPTADO` → rápida; uno `APP` `ACEPTADO` → como hoy.
- [ ] **Step 2: Rojo.** **Step 3: Implementar** módulos puros y los dos handlers.
- [ ] **Step 4:** `pnpm test:functions`; comprobar los handlers con el método de `tsc` estricto y `Deno` simulado que usó la entrega 2 (está descrito en el historial del repo: plan de la entrega 2, Task 7) y por lectura: cada rama `TIENDA` no toca `uber.*`; ninguna respuesta lleva datos de otro negocio; la respuesta a una caja vieja no cambió.
- [ ] **Step 5: Commit** — `feat(tienda): la nube acepta, rechaza, pausa y recibe estados de los pedidos de la tienda`.

---

### Task 3: la caja instalada — el agente

**Files:**
- Modify: `desktop/src/delivery-espejo.mjs`, `delivery-espejo-plan.mjs`, `directivas.mjs`, `main.mjs` (solo textos de log del arranque del agente)
- Modify/Test: `desktop/src/delivery-espejo.test.mjs`, `delivery-espejo-plan.test.mjs`, `directivas.test.mjs`

**Reglas** (Anexo §3 y §4):
- `debeSondearApps(d)` = `modulos.delivery_apps === true || modulos.tienda === true`. Los mensajes de log dejan de decir «apps de delivery» cuando lo que falta es cualquiera de los dos.
- Cada sondeo manda `{ desde, tienda: true, turno_abierto }`. `turno_abierto` se consulta **antes** de llamar, en cada vuelta: hay un turno `ABIERTO` en la sucursal de esta caja (la sucursal sale de la fila local de `cajas`).
- `COLUMNAS_PEDIDO` gana `canal`, `cliente_email`, `tienda_cuenta_id`, `zona_envio_id`, `direccion`, `pago_al_recibir`, `paga_con_mxn`. Una fila sin `canal` (nube vieja) se guarda como `'APP'`.
- `planificarEspejo` recibe además `tienda` (la clave nueva de la respuesta, o `null`):
  - Pedido `TIENDA` `RECIBIDO`, sin ticket local, `gestion = 'ESCRITORIO'`, no reclamado por otra caja: va a `aCrear` **solo si** `tienda?.aceptacion === 'AUTO'` y hay turno abierto. Con `MANUAL` espera al cajero.
  - Pedido `TIENDA` `ACEPTADO` sin ticket local (lo aceptó el cajero): a `aCrear`, igual que hoy con Uber.
  - Un pedido `TIENDA` que la nube ya cerró (`EXPIRADO`, `CANCELADO`, `RECHAZADO`) y que tiene ticket local abierto: aviso «El pedido en línea se canceló: cancela el ticket en caja».
  - Los pedidos `APP` se planifican exactamente como hoy (sus pruebas no cambian).
- El tick, para un pedido `TIENDA` en `aCrear`: `reclamar` → `SELECT crear_ticket_desde_tienda($1)` local → si estaba `RECIBIDO`, `aceptar`. Un fallo se clasifica con la misma tabla («Formas compartidas»): reintentable → se deja y se reintenta; no reintentable → `rechazar` con motivo `OTRO` si la nube lo tiene `RECIBIDO`, o `estado` `CANCELADO` con motivo `OTRO` si ya estaba `ACEPTADO`, y se anota en `ultimo_error` del pedido local un texto para el cajero.
- **Reporte de estado**, en cada vuelta: para los pedidos locales de canal `TIENDA` con `ticket_id` y estado local `ACEPTADO`, `EN_PREPARACION` o `LISTO`, calcular el estado a reportar con la tabla de «Formas compartidas» (una sola consulta que une `delivery_pedidos`, `tickets` y `delivery_asignaciones`); si es distinto del estado local, llamar `estado` y, si la nube responde bien, guardar el estado devuelto en la fila local. Sin red, se reintenta en la siguiente vuelta: nada se pierde porque sale de mirar el ticket.
- La lógica de «qué estado reportar» y la clasificación de fallos son **funciones puras** en `delivery-espejo-plan.mjs`, con sus pruebas.
- `codigoDeError` conoce los códigos nuevos.

- [ ] **Step 1: Pruebas** (pool y nube falsos, como las existentes): el cuerpo del sondeo lleva `tienda: true` y `turno_abierto` verdadero y falso; una fila `TIENDA` se guarda con sus columnas y una sin `canal` como `APP`; `MANUAL` no crea, `AUTO` con turno crea con `crear_ticket_desde_tienda` (y **no** con `crear_ticket_desde_app`), `AUTO` sin turno no crea; `ACEPTADO` sin ticket crea; fallo reintentable deja todo igual; fallo no reintentable llama `rechazar` o `estado CANCELADO` según el caso; la tabla de estados fila por fila; un reporte que la nube rechaza no cambia el local; un pedido `APP` en la misma vuelta sigue su camino de hoy; `debeSondearApps` con solo `tienda`.
- [ ] **Step 2: Rojo.** **Step 3: Implementar.** **Step 4:** `pnpm test:escritorio` (contar aparte `endurecimiento`) y `node --check` de los `.mjs` tocados.
- [ ] **Step 5: Commit** — `feat(tienda): la caja baja los pedidos de la tienda, crea su ticket y reporta el estado`.

---

### Task 4: el POS — la lógica

**Files:**
- Modify: `apps/pos/app/lib/pedidos-apps.ts`, `apps/pos/app/lib/__tests__/pedidos-apps.test.ts`
- Create: `apps/pos/app/lib/pedidos-en-linea.ts`, `apps/pos/app/lib/__tests__/pedidos-en-linea.test.ts`

**Interfaces — Produces:**
- `pedidos-apps.ts`: el `select` trae además `canal, cliente_telefono, direccion, pago_al_recibir, paga_con_mxn, envio_mxn, subtotal_mxn, gestion` y del ticket `caja_id, comanda_impresa_at`. `PedidoApp` gana `canal: "APP" | "TIENDA"`, `clienteTelefono`, `direccion` (texto armado en una línea + `referencias`), `pago` (`{ forma: "EFECTIVO" | "TARJETA"; pagaCon: number | null } | null`), `envio`, `gestion`, `ticketCajaId`, `comandaImpresa: boolean`. Una fila sin `canal` es `APP`. `accionPedidoApp` no cambia de firma.
- `pedidos-en-linea.ts` (puro salvo las llamadas):

```ts
export function etiquetaOrigen(p: PedidoApp): string;                 // "Tienda" o el nombre de la app
export function etiquetaPago(p: PedidoApp): string | null;            // "Efectivo, paga con $500.00" | "Efectivo" | "Tarjeta" | null
export function etiquetaEntrega(p: PedidoApp): string;                // "Para recoger" | "A domicilio" | lo de hoy para apps
/** Timbre: suena al llegar un pedido nuevo por aceptar y se repite cada 20 s mientras quede alguno. */
export const TIMBRE_CADA_MS = 20_000;
export function debeSonar(d: { hayNuevoPorAceptar: boolean; hayPorAceptar: boolean; ultimoTimbre: number | null; ahora: number }): boolean;
/** Qué pedidos de la tienda necesitan que ESTE dispositivo imprima sus comandas. */
export function comandasPendientes(pedidos: PedidoApp[], cajaDelTurnoId: string, yaIntentadas: ReadonlySet<string>): { pedidoId: string; ticketId: string }[];
/** POS web con aceptación automática: qué pedidos aceptar solos. */
export function aceptablesSolos(pedidos: PedidoApp[], d: { esEscritorio: boolean; aceptacion: "MANUAL" | "AUTO" | null; hayTurno: boolean }, yaIntentados: ReadonlySet<string>): string[];
export type EstadoEnLinea = { participa: boolean; aceptacion: "MANUAL" | "AUTO"; pausaHasta: string | null; motivo: string | null };
export async function leerEstadoEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea | null>;   // null = sin tienda
export async function pausarEnLinea(token: string, sucursalId: string, duracion: "30m" | "1h" | "indefinida"): Promise<EstadoEnLinea>;
export async function reanudarEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea>;
export async function avisarPresente(token: string, sucursalId: string): Promise<void>;   // nunca lanza
export function etiquetaEstadoEnLinea(e: EstadoEnLinea, ahora: Date): { texto: string; tono: "ok" | "aviso" };
export function mensajeErrorEnLinea(codigo: string, causa?: string): string;
```

**Reglas:**
- `debeSonar`: verdadero si hay uno nuevo por aceptar; o si hay alguno por aceptar y pasaron ≥ 20 s desde el último timbre. «Por aceptar» = `RECIBIDO` (un pedido en `ERROR` no hace sonar en bucle). Vale para todos los canales.
- `comandasPendientes`: canal `TIENDA`, estado `ACEPTADO` / `EN_PREPARACION` / `LISTO`, con ticket, `ticketCajaId === cajaDelTurnoId`, `comandaImpresa === false`, y no intentado ya en esta sesión.
- `aceptablesSolos`: solo si **no** es escritorio (ahí acepta el agente), `aceptacion === 'AUTO'`, hay turno, canal `TIENDA`, `RECIBIDO`, `gestion === 'NUBE'`, no intentado ya.
- `etiquetaEstadoEnLinea`: sin motivo → «Tienda: recibiendo pedidos»; `EN_PAUSA` → «Tienda: en pausa hasta las 8:30 p. m.» o «Tienda: en pausa» (si es indefinida, año ≥ 2999); `FUERA_DE_HORARIO` → «Tienda: fuera de horario»; `CAJA_NO_LISTA` → «Tienda: sin turno abierto»; `NO_PARTICIPA` / `MODO_NO_DISPONIBLE` / `TIENDA_NO_DISPONIBLE` → «Tienda: apagada».
- `mensajeErrorEnLinea`: `SIN_TURNO_ABIERTO` → «Abre un turno para aceptar pedidos.»; `PEDIDO_CANCELADO` → «Este pedido ya no coincide con tu menú o tus zonas de envío. Se canceló y tu cliente ya lo sabe.»; `ACCION_INVALIDA` → «Este pedido ya fue atendido.»; `RECLAMADO_POR_OTRA_CAJA` → «Otra caja ya tomó este pedido.»; `SIN_RED` / `FUNCION_REQUIERE_NUBE` → «Sin internet no se pueden atender pedidos en línea.»; otro → «No se pudo completar. Inténtalo de nuevo.»

- [ ] **Step 1: Pruebas** de cada función con sus fronteras (timbre a 19 999 y 20 000 ms; comandas con ticket de otra caja, ya impresa, ya intentada; aceptables en escritorio, en `MANUAL`, sin turno, `ESCRITORIO`; etiquetas de pago con y sin «paga con»; la hora de la pausa; una fila de Uber sin las columnas nuevas).
- [ ] **Step 2: Rojo.** **Step 3: Implementar.** **Step 4:** `pnpm --filter ./apps/pos test` y `tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(tienda): lógica del POS para los pedidos de la tienda — timbre, comandas, pausa y etiquetas`.

---

### Task 5: el POS — la pantalla

**Files:**
- Modify: `apps/pos/app/components/pantalla-pedidos-apps.tsx`, `pantalla-inicio.tsx`, `home-pos.tsx`
- Modify: `apps/pos/app/components/pantalla-cuentas-modo.tsx`, `apps/pos/app/lib/cuentas-abiertas.ts`, `apps/pos/app/lib/print/ticket-datos.ts`, `ticket-builder.ts` (decisión 5)

**Comportamiento** (Anexo §5, §6, §7; el código vigente manda sobre los números de línea):

- **Quién ve la pantalla:** `modulos.delivery_apps === true || modulos.tienda === true`. Título **«Pedidos en línea»**; el mosaico del inicio y el aviso de vencidos dicen «Pedidos en línea» / «Se venció 1 pedido en línea sin aceptar…».
- **Tarjeta de un pedido de la tienda:** origen «Tienda» y folio; «Para recoger» o «A domicilio»; cliente y teléfono; en domicilio, dirección y referencias; productos con modificadores y notas; nota del cliente; envío (si hay) y total; forma de pago. Botones **Aceptar** y **Rechazar** en `RECIBIDO`; **sin** «Marcar listo». En `ACEPTADO` en adelante: «Aceptado · Ticket {folio}» y una línea «Cóbralo desde Pick-up» / «…desde Domicilio». Rechazar usa el diálogo de motivos que ya existe (los cuatro de la lista cerrada). Las tarjetas de Uber no cambian.
- **Barra de la tienda propia**, solo con `modulos.tienda`: el texto de `etiquetaEstadoEnLinea`, y botones **Pausar** (menú: 30 minutos · 1 hora · Hasta que la reanude) o **Reanudar**. Se relee cada 60 s y tras cada acción. La barra de Uber sigue como está, debajo, si aplica.
- **Sondeo (en `home-pos.tsx`, desde cualquier pantalla):**
  - corre con cualquiera de los dos módulos;
  - el timbre lo decide `debeSonar` (mismo archivo de sonido), y se evalúa también entre lecturas con un reloj de 1 s para que la repetición a 20 s no dependa del sondeo de 10 s;
  - comandas: por cada elemento de `comandasPendientes`, llamar a la impresión de comandas del ticket completo (todas sus líneas), reutilizando `imprimirComandaCocina`/`imprimirComandaPorAreas` — si hace falta, extraer de `imprimirComandaCocina` una variante «todas las líneas del ticket» sin duplicar su cuerpo. Se marca como intentada antes de imprimir; un fallo de impresora muestra el aviso que ya usa esa función y no se reintenta solo (el cajero reimprime desde la cuenta);
  - POS web: `avisarPresente` cada 30 s mientras haya turno abierto y `modulos.tienda`; y aceptar solo lo que diga `aceptablesSolos`. Nada de esto corre dentro de la caja instalada (`esEscritorio()`).
- **La cuenta (Pick-up y Domicilio):** el panel de detalle muestra `nota_general` cuando existe, con la etiqueta «Nota del pedido». El ticket impreso del cliente la lleva en una línea propia bajo los datos de entrega.
- Estados de carga, error y solo lectura como en el resto de la pantalla; controles de 44 px; sin palabras internas.

- [ ] **Step 1:** implementar, manteniendo `home-pos.tsx` lo más quieto posible: la lógica nueva ya vive en `lib/pedidos-en-linea.ts`; el efecto solo la llama.
- [ ] **Step 2:** `pnpm --filter ./apps/pos test`, `tsc --noEmit`, `pnpm tipografia`.
- [ ] **Step 3: Commit** — `feat(tienda): Pedidos en línea en el POS — tarjeta de la tienda, timbre que se repite, comandas y pausa`.

---

### Task 6: documentos y verificación

- [ ] **Step 1: Documentos.** `desktop/RUNBOOK.md`, sección «Espejo de pedidos de apps»: lo nuevo de la tienda (qué manda la caja, cómo acepta, qué reporta, qué buscar en el log `· [espejo]`). `docs/diseno/pos.md`: «Pedidos en línea» (tarjeta de la tienda, timbre, barra de pausa, nota del pedido en la cuenta y el ticket). `docs/operacion/` : una nota `tienda-en-linea-caja.md` para soporte: qué hacer si un pedido no suena, si se cancela solo, si la tienda sale «sin turno abierto».
- [ ] **Step 2: Todo en verde.** `cd desktop && npm run smokes`; `pnpm test:functions`; `pnpm test:escritorio`; `pnpm -r test`; `pnpm tipografia`; `tsc --noEmit` en las cinco apps; `node --check` de `desktop/src/*.mjs`.
- [ ] **Step 3: Verificación en el navegador** del POS local contra el Supabase local (ya tiene 0160–0163; aplicar la 0164 **sin** `db reset`; el negocio de desarrollo ya tiene el complemento): encender la tienda del negocio local, insertar a mano en la base local dos pedidos de la tienda (uno para recoger, uno a domicilio) y uno de Uber, y recorrer con capturas: mosaico y pantalla «Pedidos en línea», las tres tarjetas, el timbre (por consola: cuántas veces se pidió reproducir en 45 s), el diálogo de rechazo, la cuenta con su «Nota del pedido». Las funciones de la nube no corren en local: aceptar, pausar y el reporte de estado quedan verificados por pruebas, no en el navegador — decirlo en el informe.
- [ ] **Step 4:** PR contra `main`.

---

### Task 7: producción y mezcla

1. `supabase migration list --linked`; aplicar la 0164 en una transacción con `lock_timeout`; `migration repair --status applied 0164`; verificar funciones y permisos.
2. Desplegar `delivery-accion` y `delivery-espejo`. Comprobar que la Caja de Pruebas (0.7.0, con Uber) sigue sondeando a su ritmo normal y que `delivery-accion` responde a una acción de Uber de solo lectura (`tienda_estado`) como antes.
3. Regenerar tipos si cambiaron y confirmarlos en el PR.
4. Mezclar con el CI en verde. **El POS web se despliega solo desde `main`**: quien use el POS web verá «Pedidos en línea» solo si ya veía «Pedidos de apps» (nadie tiene la tienda).
5. **No** se sube la versión de la caja ni se empaqueta instalador (decisión 8). Dejar en `docs/operacion/` la lista de lo que incluiría la 0.8.0 y su nota para quien cobra, lista para que Fermín la apruebe.

## Lo que esta entrega NO hace

- La tienda pública (entrega 5) y las cuentas de clientes (6).
- El instalador 0.8.0 de la caja: sin él, ninguna caja instalada recibe pedidos de la tienda. El código y la nube quedan listos.
- Cambiar a mano un pedido ya aceptado y que el cliente lo vea reflejado.
- Un negocio con caja 0.7.0 **y** POS web abierto a la vez en la misma sucursal: la tienda podría abrir por el POS web y mandar el pedido a una caja que no lo entiende; se vencería a los minutos. Desaparece al actualizar la caja; se anota para el lanzamiento.
