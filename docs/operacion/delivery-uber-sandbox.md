# Runbook — Pedidos de Uber Eats en el POS (F1, sandbox)

**Estado (2 sep 2026):** el código de la fase 1 está construido y probado en local; **falta la
cuenta de desarrollador de Uber** (sandbox) para la prueba de punta a punta. Diseño: ADR 0011 y
`docs/integraciones/delivery/05-diseno-integracion-vimpos.md`.

## Qué existe

| Pieza | Dónde | Probado con |
|---|---|---|
| Tablas `delivery_conexiones`, `delivery_pedidos`, `delivery_eventos`, `delivery_credenciales_app` (RLS) | `supabase/migrations/0090_*` | pgTAP `supabase/tests/0004_delivery_rls.test.sql` |
| RPC `crear_ticket_desde_app`, `delivery_pedido_transicion` (solo service_role) | `supabase/migrations/0091_*` | `supabase/scripts/smoke_delivery_app.sql` |
| Adaptador Uber (firma, dinero e5, normalización, cliente HTTP) | `supabase/functions/_shared/delivery/` | `pnpm test:functions` |
| Webhook público `delivery-webhook-uber` | `supabase/functions/delivery-webhook-uber/` | `supabase functions serve` + curl (401 firma mala, 200 buena, duplicado sin reprocesar) |
| Acciones del cajero `delivery-accion` | `supabase/functions/delivery-accion/` | typecheck; la prueba real necesita el sandbox |
| Pantalla "Pedidos de apps" + badge + sonido | `apps/pos/app/components/pantalla-pedidos-apps.tsx`, `home-pos.tsx`, `pantalla-inicio.tsx` | `pnpm --filter @vim/pos test` + typecheck |

## 1. Lo que hace el dueño una sola vez

1. Cuenta en <https://developer.uber.com/dashboard> con un correo de VIM → *Create app* → suite
   **Eats Marketplace** → tipo **Testing**. Guardar `client_id` y `client_secret` de sandbox en el
   gestor de contraseñas (nunca en el repo).
2. Pedir tiendas de prueba en <http://t.uber.com/integration-support> ("POS integrator, sandbox test
   stores, Mexico") y una cuenta de consumidor de prueba.
3. En la app Testing → **Webhooks → Primary Webhook URL**:
   `https://<proyecto>.supabase.co/functions/v1/delivery-webhook-uber`.

## 2. Configurar y desplegar (yo o el dueño)

```bash
# Secrets (si `supabase secrets set` falla en esta máquina, usar el dashboard → Edge Functions → Secrets)
supabase secrets set UBER_ENTORNO=sandbox UBER_CLIENT_ID=<client_id> UBER_CLIENT_SECRET=<client_secret> UBER_WEBHOOK_SIGNING_KEY=<signing_key> UBER_REDIRECT_URI=https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback
# La signing key la inventa uno (32+ caracteres aleatorios, del gestor de contraseñas) y se pega
# igual en Uber dashboard → Webhooks → Add New Webhook → Basic HMAC → Signing Key.
supabase functions deploy delivery-webhook-uber --no-verify-jwt
supabase functions deploy delivery-accion
supabase functions deploy delivery-uber-conexion
supabase db push   # 0093 programa el cron de expirados en la nube
```

Variables públicas del **admin** (Vercel, proyecto admin, y `apps/admin/.env.local` en desarrollo):
`NEXT_PUBLIC_UBER_CLIENT_ID=<client_id>` y `NEXT_PUBLIC_UBER_ENTORNO=sandbox`. En la app de Uber
(Setup → Redirect URIs) registrar `https://admin.vimpos.com.mx/configuracion/integraciones/uber/callback`
y, para desarrollo, `http://localhost:3001/configuracion/integraciones/uber/callback`.

## 3. Vincular la tienda a la sucursal (desde el admin, F1b)

1. Admin → Configuración → **Apps de delivery** → **Conectar con Uber Eats**.
2. Entrar en Uber con la cuenta del **dueño** (la que administra el restaurante en Uber Eats Manager)
   y autorizar. Uber regresa al asistente del admin.
3. Por cada tienda de Uber elegir la sucursal de VIM, auto-aceptar (sí por defecto) y minutos de
   preparación; marcar la casilla de autorización a VIM POS y pulsar **Activar**.
4. En la tabla, **Comprobar** confirma con Uber que `integrator_store_id` es la sucursal y que la
   integración está encendida. **Pausar** apaga la inyección de pedidos sin desconectar.

### Respaldo manual (si el admin no está disponible)

Con el token del **dueño** (OAuth `authorization_code`, scope `eats.pos_provisioning`; ver
`docs/integraciones/delivery/03-uber-eats-resumen.md §4`):

```bash
# 1) tiendas del dueño
curl -H "Authorization: Bearer <USER_TOKEN>" https://test-api.uber.com/v1/delivery/stores
# 2) activar nuestra app en la tienda (integrator_store_id = uuid de la sucursal en VIM)
curl -X POST -H "Authorization: Bearer <USER_TOKEN>" -H "Content-Type: application/json" \
  https://test-api.uber.com/v1/eats/stores/<STORE_ID>/pos_data \
  -d '{"integrator_store_id":"<SUCURSAL_UUID>","integrator_brand_id":"vimpos","is_order_manager":true,
       "require_manual_acceptance":false,
       "allowed_customer_requests":{"allow_special_instruction_requests":true,"allow_single_use_items_requests":false},
       "webhooks_config":{"webhooks_version":"1.0.0","order_release_webhooks":{"is_enabled":false},
                          "schedule_order_webhooks":{"is_enabled":false},"delivery_status_webhooks":{"is_enabled":true}}}'
```

Y la conexión en VIM (SQL editor de Supabase, como administrador):

```sql
INSERT INTO delivery_conexiones (tenant_id, sucursal_id, app, estado, tienda_id_externo, tienda_nombre_app, auto_aceptar, tiempo_prep_min, conectada_at)
VALUES ('<tenant>', '<sucursal>', 'APP_UBEREATS', 'ACTIVA', '<STORE_ID>', 'Tienda de prueba Uber', true, 12, now());
```

La carta se manda desde el admin: en la fila de la sucursal, **Enviar carta** (acción `menu` de
`delivery-uber-conexion`, `_shared/delivery/menu-uber.ts`). Reemplaza la carta entera de la tienda
con los productos activos con precio (**id del ítem en Uber = uuid del producto en VIM**), agrupados
por categoría, sin modificadores, disponible todo el día. Los agotados, ocultos y sin precio quedan
fuera y el aviso dice cuáles. Hay que repetirlo cuando cambie el catálogo (no es automático todavía).

## 3b. Tienda y expirados (spec A6)

- **POS → Pedidos de apps**: la barra de arriba muestra "Uber: en línea / pausada hasta HH:MM /
  sin datos" (cache de 60 s), **Prep −5/+5** (sincroniza a Uber y a `tiempo_prep_min`) y
  **Pausar…** (30 min, 1 h, resto del día) / **Reanudar**. Si Uber contesta 403
  `resource_update_not_allowed` la tienda no tiene estrategia de estado "external": se pausa
  desde Uber Eats Manager (pedir a soporte que la cambie para la tienda de prueba).
- **Admin → Apps de delivery**: chip "Tienda: …", columna "Expirados hoy" y Prep (min) que también
  va a Uber.
- **Expirados**: `delivery_marcar_expirados()` corre cada minuto por pg_cron en la nube (mig.
  0093). Comprobar en el SQL editor: `select jobname, schedule, active from cron.job;`. Para
  probar sin esperar: insertar un `delivery_pedidos` RECIBIDO con `vence_aceptacion` en el pasado
  y ejecutar la función; el POS muestra el banner rojo en el inicio hasta que alguien entra a
  Pedidos de apps.

## 3c. Alergias (A7)

Uber manda la alergia por ítem (`customer_request.allergy`: lista de alérgenos + texto libre). El
normalizador la traduce (`cacahuate`, `lácteos`…) y `crear_ticket_desde_app` la pone **al frente**
de la nota de cocina del ítem (`⚠ ALERGIA: …`) y avisa en la nota general del ticket; la tarjeta de
Pedidos de apps la muestra en rojo. Para que Uber mande el campo hay que **pedir a soporte que
active "allergy requests" para la tienda** (viene apagado en integraciones POS); mientras tanto el
cliente puede escribirla en las instrucciones, que también llegan. Prueba local:
`supabase/scripts/smoke_delivery_app.sql` (ítem con alergia → nota de cocina y nota general).

## 3d. Caja de escritorio (espejo)

Si la sucursal opera con el programa instalado, no hay que hacer nada especial: al arrancar, la
caja vinculada a la nube inicia el agente de espejo (`· [espejo]` en el log). Cada 10 s lee
`delivery-espejo` con su token de dispositivo, copia conexiones y pedidos a su base local, y para
los pedidos que le tocan crea el ticket local y acepta en Uber. La pantalla "Pedidos de apps" y
sus botones funcionan igual que en la web (el gateway reenvía `delivery-accion` a la nube).

- Ver que la caja está viva para la nube: `select nombre, espejo_apps_at from cajas` en el SQL
  editor (debe tener menos de un minuto).
- Si el ticket no aparece en la caja: buscar en el log `· [espejo]` el motivo (`SIN_TURNO_ABIERTO`,
  `ITEM_SIN_MAPEAR`, reclamo de otra caja) y en la tarjeta del POS (`ultimo_error`).
- Si la app cancela un pedido que ya tenía ticket local, la tarjeta lo avisa en rojo y el cajero
  cancela el ticket con el flujo normal.
- Sin internet: el agente se salta el ciclo y la pantalla sigue con lo último espejado; al volver
  la red, el siguiente ciclo se pone al día.

## 3e. Aviso push al dueño cuando vencen pedidos (0097)

Una sola vez, el dueño:
1. Dashboard → **Vault** → *New secret*: `vim_interno` = cadena aleatoria de 32+ caracteres (del
   gestor de contraseñas) y `vim_functions_url` = `https://pbiaxzvmssjsxdwqrumb.supabase.co/functions/v1`.
2. Edge Functions → **Secrets**: `VIM_INTERNO_SECRET` = la misma cadena que `vim_interno`.
3. Los dispositivos que deben recibir el aviso activan notificaciones en el admin
   (Configuración → Notificaciones).

Prueba: `select delivery_avisar_expirados('<tenant>', '<sucursal>', 1);` en el SQL editor debe
devolver `true` y llegar la notificación; `select * from net._http_response order by id desc limit 3`
muestra la respuesta de `enviar-push` (200 con `enviadas`).

## 4. Prueba de punta a punta

0. Tiendas de prueba recibidas el 3 sep 2026 (caso 59818999): «VIM POS Test Store 1» (dueño
   `uber-test@vimpos.com.mx`, id `e597a6b1-9ea2-45d0-a0cd-5843ac6908b8`) y «VIM POS Test Store 2»
   (`uber-test2@vimpos.com.mx`, id `55435171-1ab7-4a42-8b38-b55d5672ef25`), Delivery by Uber. Uber
   NO las integró: hay que conectarlas con el flujo de §3 (OAuth con la cuenta del dueño de prueba).
   Las contraseñas están en el correo de Uber; van al gestor de contraseñas, no aquí. Uber avisó que
   el client ID no tenía webhook URL: comprobar en el dashboard de desarrollador que el Primary
   Webhook sea `https://pbiaxzvmssjsxdwqrumb.supabase.co/functions/v1/delivery-webhook-uber`.
1. Abrir turno en el POS (nube o caja de escritorio) de la sucursal vinculada; mandar la carta
   (**Enviar carta** en el admin).
2. En ubereats.com con la cuenta de prueba, dirección de la tienda de prueba, pedir un producto.
3. Verificar en orden: `delivery_eventos` (fila `orders.notification`, `firma_valida = true`,
   `respuesta->>'accion' = 'ACEPTADO_AUTO'`), `delivery_pedidos` (estado `ACEPTADO`, `ticket_id`),
   Consultar cuentas en el POS (ticket PAGADO con canal Uber Eats), Uber Eats Orders
   (restaurant-dashboard.uber.com) muestra la orden aceptada.
4. En el POS → Pedidos de apps → **Marcar listo** → en Uber `preparation_status = READY_FOR_HANDOFF`.
5. Con `auto_aceptar = false` en la conexión: el pedido aparece **Por aceptar** con contador; Aceptar
   y Rechazar (con motivo) deben reflejarse en Uber.

### Resultado del 6 sep 2026 (nube, sucursal Pruebas de VIM Pruebas)

Hecho de punta a punta con la tienda de prueba 1: OAuth con `uber-test@` (en ventana de incógnito:
la sesión de Uber se comparte entre dashboards y el primer intento autorizó con otra cuenta y devolvió
0 tiendas) → Activar → Comprobar (integración activa, tienda en línea) → Enviar carta (38 productos,
7 categorías) → pedido desde ubereats.com → webhook con firma válida → ítems reconocidos por uuid →
con turno abierto en el POS web, **aceptado en automático**, ticket VP1-2026-000005 → Marcar listo →
`ready` enviado a Uber. Lo que se rompió y se arregló ese día: el contador de folios de la nube no
existía para sucursales cuyos folios emitió el escritorio (mig. 0107); el primer pedido expiró sin
turno abierto. Pendiente: la caja de escritorio (espejo) recibía `401 AUTH_INVALIDA` y se quedaba con
el token muerto 20 min; el agente ya fuerza login nuevo tras un 401 y el log dice vigencia y sesión.

### Resultado del 11 sep 2026 — combos y modificadores (entrega 2)

Primera prueba con la carta que lleva **grupos de modificadores y combos**. Se hizo **por fases**,
para separar el riesgo de publicar del riesgo de cobrar. Hay un solo proyecto de Supabase
(`pbiaxzvmssjsxdwqrumb`), así que "sandbox" es la tienda de prueba de Uber, no un backend aparte:
probar obliga a desplegar a producción.

**Fase A — solo la carta.** Se desplegó únicamente `delivery-uber-conexion`. Antes se comprobó que
esa función **no tiene ninguna acción que procese pedidos** y que sus dos referencias a
`procesar-uber.ts` son `import type`, que desaparece al compilar: el radio real del despliegue era
el botón "Enviar carta" del admin. Si hubiera fallado, se revertía redesplegando la versión de
`main`.

Resultado: **la carta se publicó y Uber la aceptó.** Eso cierra la duda de mayor riesgo de toda la
entrega, porque `tax_info` pasó de `tax_rate` a `vat_rate_percentage` (lo que corresponde a México
con precio con IVA incluido) y ese era el único cambio que alcanzaba a **todos** los restaurantes
que ya publican. Como `PUT /menus` reemplaza la carta entera, un rechazo habría dejado sin poder
republicar a quien lo intentara. También quedaron aceptados los `modifier_group` de los grupos de
modificadores y los de los slots de combo, con sus opciones como ítems sin categoría.

**Fase B — el pedido.** Se aplicó la migración `0112_combos_uber.sql` y se redesplegaron
`delivery-webhook-uber` y `delivery-accion`. Las dos hacían falta: cada función empaqueta su propia
copia de `_shared/`, así que sin redesplegarlas el pedido habría llegado con el normalizador viejo,
sin `grupo_id`, y la migración nueva lo habría rechazado.

Pedido **9E434** desde ubereats.com → ticket **VP1-2026-000009**, aceptado en automático, con dos
combos:

```
1 × Combo Knock-Out · Cheese Burger, Papas Sencillas, Coca Cola
1 × Combo Knock-Out · Cheese Burger, Aros de Cebolla, Coca Cola
Total en la app: $300.00
```

**El ticket cuadra con lo que cobró Uber.**

### Qué quedó probado, y qué no

**Probado:**

- La carta se publica con grupos de modificadores y combos, y Uber la acepta.
- Un pedido con combos se convierte en ticket: padre con su precio, hijos desglosados.
- **El segundo nivel de anidamiento.** No se probó con el término —esos grupos se habían quitado del
  catálogo de pruebas— pero sí con **extras sobre los componentes del combo**, que recorren
  exactamente el mismo camino. El término habría pasado por el mismo código.
- **El defecto de los `$0.00` está cerrado con datos reales.** El precio de cada opción se buscaba en
  el desglose con el `cart_item_id` del ítem **padre**, cuando Uber indexa esas filas por el de la
  **opción**; con datos reales no coincidía ninguna y todo modificador entraba a cero. Que el total
  del ticket cuadre con los $300 de la app lo demuestra: si los extras hubieran entrado a cero, no
  cuadraría.

**No probado en vivo, y por qué se asume:**

- **Un extra sobre un producto suelto**, fuera de combo. Recorre la misma ruta de código que los
  extras dentro del combo, que sí quedó probada. Riesgo bajo, asumido a propósito. Además, hoy
  **ningún restaurante real usa apps de delivery**: la integración está en producción pero solo la
  ejercita el tenant de pruebas, así que un fallo aquí no alcanza a un cliente.
- **`core_price` vs `corePrice`.** La referencia de Uber y su propio ejemplo se contradicen. No
  rompe el `PUT`; rompe los reembolsos parciales, en silencio. Sigue sin confirmar.
- **El tope de precio por ítem en pesos**, si existe para México.
- **Que `min_permitted`/`max_permitted` se respeten de verdad en la app del cliente.** El modelo de
  combo lo da por hecho: si Uber no los aplicara, podría llegar un pedido con un slot incompleto y
  el POS lo rechazaría con el cliente ya cobrado.
- **El `max_permitted` de un slot no se recorta a sus opciones vivas** (a diferencia del de un grupo
  de modificadores, que sí). Un slot "elige hasta 2" con una sola opción disponible publica
  `max_permitted: 2` con un solo `modifier_option`. No lo vuelve inordenable —el máximo es un tope,
  no una exigencia— pero está por ver si Uber acepta ese payload sin protestar.

### Lo que la prueba real encontró y se arregló

Los extras del segundo nivel **no se veían en la pantalla "Pedidos de apps"**. El dinero estaba bien
y la cocina los recibía, porque cuelgan del renglón hijo, pero `apps/pos/app/lib/pedidos-apps.ts`
se quedaba con el nombre y la cantidad de cada modificador y descartaba el array anidado. El cajero
veía "Cheese Burger" sin enterarse de que llevaba algo encima.

Arreglado: la tarjeta pinta ahora el extra pegado a su componente,
`1 × Combo Knock-Out · Cheese Burger (extra queso), Papas Sencillas, Coca Cola`. **Ese arreglo vive
en el POS web, que se despliega desde `main`: no se ve hasta mezclar.**

### El orden del despliegue, que importa

1. `supabase db push` (la `0112`).
2. Mezclar el PR.
3. Instalador **0.4.68** en todas las cajas.
4. **Solo al final**, enviar la carta con combos a la tienda de producción.

Una caja en 0.4.67 no tiene la `0112`, así que `agregar_item_a_ticket` rechazaría el combo con
`'El producto "%" es un combo: usa agregar_combo_a_ticket'` — un mensaje que el espejo tampoco
traduce. Publicar la carta antes de actualizar el parque es invitar pedidos que la caja no sabe
cobrar.

**Hoy esto no bloquea a nadie**: ningún restaurante real usa apps de delivery todavía. La regla
aplica al primero que las active — y entonces hay que comprobar que su caja está de verdad en
0.4.68, porque el actualizador avisa y ofrece, no instala solo.

## 4b. Guion — los tres estados del add-on de delivery

Prueba de la entrega "delivery como add-on" (PR #12, migración 0113). Se corre con el tenant de
pruebas **`d3462bb3-198b-4cc3-8105-7060d6998478`** (`vim-pruebas`) y la tienda sandbox ya
conectada. **Requisito de partida: la conexión tiene que estar en `ACTIVA`** — si está en
`PENDIENTE` o `ERROR` no hay nada que pausar y el estado 1 no prueba lo que dice probar.

### Por qué va en tres olas, y no de corrido

La interfaz (admin, POS, panel) se despliega desde `main`: hasta que el PR no se mezcle, en
producción sigue la versión anterior. El backend, en cambio, se despliega a mano y puede ir antes.
Así que la prueba se parte por donde se parte el despliegue:

| Ola | Cuándo | Qué se prueba |
|---|---|---|
| **A** | tras aplicar 0113 y desplegar las 3 functions, **antes** de mezclar | los guards: webhook, espejo y cadencia. Los estados se cambian por SQL |
| **B** | tras mezclar el PR | el interruptor del dueño, la sección que desaparece, el POS, y el aviso a Uber desde el panel |
| **C** | con la caja en **0.4.70** | que el espejo se **detenga** de verdad, no que baje el ritmo |

> **Por qué 0.4.70 y no 0.4.69.** La rama del add-on reservó la 0.4.69 cuando `main` estaba en
> 0.4.68, pero otra sesión se llevó ese número el mismo día: el PR #11 la subió a 0.4.69 y
> **publicó `VIM.POS.Setup.0.4.69.exe` a las 16:25**, con el catálogo en cuadrícula y **sin** el
> guard del espejo. Como las dos ramas escribieron el mismo string, git no dio conflicto y la mezcla
> pasó limpia: quedaron dos contenidos distintos bajo un mismo número. El instalador del add-on va
> en **0.4.70**. Es la misma trampa que el plan ya advertía para las migraciones, en otra ventanilla.

Sin la ola C, una caja en 0.4.68 sigue sondeando: obedece el `siguiente_en_ms` que le manda la nube
y se va a 5 minutos, pero no para. Eso **también es un resultado válido** y hay que verlo: es lo que
le va a pasar a todo el parque hasta que se actualice.

### Paso 0 — la línea base, antes de tocar nada

```sql
SELECT modulos_efectivos('d3462bb3-198b-4cc3-8105-7060d6998478');
```

Tiene que traer `delivery_apps: true` en **las dos** llaves (`permitidos` y `efectivos`): así lo
deja la migración. Si `permitidos` sale en `false`, el `INSERT` de `tenant_addons` de la 0113 no
corrió —¿la migración se saltó en silencio?— y no tiene sentido seguir.

---

### Estado 3 — encendido: **nada cambia** (ola A)

La no-regresión que más importa. Esta entrega no debe cambiarle nada a quien sí paga.

- [ ] Hacer un pedido en la tienda sandbox, como en la prueba del 11 sep.
- [ ] El ticket entra en la caja, con su comanda. Cuadra el total.
- [ ] En el log de la caja (`%APPDATA%\vim-pos-desktop\vim-pos.log`) el espejo sigue a su ritmo
      normal: 30 s con conexión viva y nada corriendo, 10 s mientras hay una ventana de aceptación.

---

### Estado 2 — el dueño lo apaga (olas A, B y C)

**Apagarlo.** En la ola A por SQL, que es exactamente lo que escribe el interruptor del admin:

```sql
UPDATE configuracion_tenant SET modulo_delivery_activo = false
 WHERE tenant_id = 'd3462bb3-198b-4cc3-8105-7060d6998478';
SELECT modulos_efectivos('d3462bb3-198b-4cc3-8105-7060d6998478');
-- permitidos.delivery_apps = true   ·   efectivos.delivery_apps = false
```

En la ola B se hace desde el admin: **Configuración → Apps de delivery → el interruptor**. Pide
confirmación al apagar. El encabezado pasa a "Apps de delivery · Apagado" y el asistente de Uber
desaparece de la pantalla; la **sección sigue en el menú**, que es la diferencia con el estado 1.

- [ ] **La caja deja de sondear.** Hasta 10 minutos de espera: el módulo viaja en el latido, y el
      latido va cada 10 min. En 0.4.70 el log lo dice literal:
      `· [espejo] detenido (el cliente apagó el módulo de apps de delivery)`.
      En 0.4.68 no aparece nada: el espejo sigue, pero la nube le contesta `siguiente_en_ms:
      300000` y pasa a preguntar cada 5 minutos. También sirve mirar `directivas.json` en la misma
      carpeta: `modulos.delivery_apps` tiene que estar en `false`.
- [ ] **El POS esconde la pantalla de pedidos de apps** (ola B). Si el cajero estaba parado en ella,
      se le saca; no basta con no pintar el botón.
- [ ] **Un pedido que llegue se descarta antes de pedírselo a Uber.** Hacer otro pedido sandbox y:

```sql
SELECT created_at, tipo, respuesta->>'accion' AS accion, respuesta->>'detalle' AS detalle
  FROM delivery_eventos
 WHERE direccion = 'ENTRADA' AND app = 'APP_UBEREATS'
 ORDER BY created_at DESC LIMIT 5;
```

Se espera `accion = SIN_MODULO`. **Ojo:** esa fila lleva `tenant_id` nulo —no hay pedido al que
enrutarla— así que solo se ve desde el editor SQL, nunca desde el admin del cliente.

- [ ] Y que **no** haya fila de pedido:

```sql
SELECT count(*) FROM delivery_pedidos WHERE app = 'APP_UBEREATS' AND id_externo = '<order id>';
-- 0
```

---

### Estado 1 — VIM retira el add-on (olas A y B)

**En la ola B se hace desde `/platform` → el cliente → Add-ons → dar de baja "Apps de delivery"**,
que es el camino de verdad: es el único que le avisa a Uber. En la ola A, por SQL, se prueba todo
menos ese aviso:

```sql
UPDATE tenant_addons SET activo = false, fecha_fin = CURRENT_DATE
 WHERE tenant_id = 'd3462bb3-198b-4cc3-8105-7060d6998478'
   AND addon_id = (SELECT id FROM addons WHERE codigo = 'DELIVERY') AND activo;
SELECT modulos_efectivos('d3462bb3-198b-4cc3-8105-7060d6998478');
-- las DOS llaves en false
```

- [ ] **La sección desaparece del admin**, del menú incluido (ola B). No queda interruptor: el
      dueño no puede devolverse lo que no le concedieron.
- [ ] **Las acciones de `delivery-uber-conexion` devuelven 403 `SIN_MODULO_DELIVERY`.** Con la
      sección escondida no hay botón que pulsar, así que la prueba directa es a mano: sacar el
      token de la sesión del dueño (devtools del admin → Application → Local Storage) y

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/delivery-uber-conexion" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_DUENO" -H "content-type: application/json" \
  -d '{"accion":"comprobar_tienda","conexion_id":"<uuid>"}'
```

`desconectar` es la excepción a propósito: sigue funcionando sin módulo, porque solo quita.

- [ ] **Uber recibió el aviso** (ola B, y solo si el secreto está dado de alta en los dos lados).
      La respuesta del panel trae `{pausadas: 1, fallos: []}`; un `fallos` con algo dentro es el
      síntoma de que falta `VIM_DELIVERY_INTERNO_SECRET` en Vercel o en Supabase. Del lado de la
      base:

```sql
SELECT estado FROM delivery_conexiones WHERE tenant_id = 'd3462bb3-198b-4cc3-8105-7060d6998478';
-- PAUSADA

SELECT created_at, tipo, procesado, respuesta
  FROM delivery_eventos
 WHERE direccion = 'SALIDA' AND tipo = 'pos_data_actualizar'
 ORDER BY created_at DESC LIMIT 3;
-- respuesta: {"integration_enabled": false}
```

Y en el dashboard de Uber, la tienda deja de aceptar pedidos.

---

### Estado 3 otra vez — devolverlo (olas A y B)

Es lo que va a pasar con un cliente que se atrasa un mes y luego paga. **Son dos gestos, no uno**:
dar de alta el add-on **y** encender el interruptor. Y la conexión se quedó en `PAUSADA` — hay que
reanudarla desde el admin para que Uber vuelva a mandar pedidos.

- [ ] Add-on de alta desde `/platform`. El precio pre-llenado depende del plan del tenant:
      **0.00 si es Negocio o Cadena**, 100.00 si es Esencial. Comprobar de paso que la ficha de
      contrato enseña el precio pactado, no el de lista.
- [ ] Interruptor encendido desde el admin.
- [ ] Reanudar la conexión y hacer un último pedido: el ticket entra como en el estado 3 inicial.

### Qué anotar

Fecha, versión de la caja en cada ola, y para cada estado qué se vio y qué no. Lo que **no** se
pudo comprobar importa tanto como lo que sí: el defecto de los modificadores a $0.00 de la entrega
anterior sobrevivió porque una prueba dijo "pasa" sobre una fixture irreal.

### Resultado de la ola A — 13 sep 2026

Migración **0113 aplicada** (`supabase db push --linked`, una sola migración, dry-run antes) y las
tres Edge Functions desplegadas: `delivery-webhook-uber`, `delivery-espejo`,
`delivery-uber-conexion`.

**La comprobación previa salió limpia.** En toda la base hay **una sola** fila en
`delivery_conexiones` —la tienda sandbox del tenant de pruebas, `ACTIVA`— y cuatro
`delivery_pedidos` históricos, todos del mismo tenant y todos `CANCELADO`. Ningún cliente real
usa delivery, así que retirarle el módulo a todo el mundo no rompió a nadie.

**Después de la migración:** los nueve planes se quedaron con `kds, recetas, promociones,
reservaciones` y ninguno concede ya `delivery_apps`; cero filas en `tenant_feature_flags` con ese
código; y `modulos_efectivos` de los cuatro tenants devuelve los otros cinco módulos igual que
antes. `vim-pruebas` quedó con las dos capas en `true`, como manda la migración.

> Observación que no es de esta entrega: `recetas` sale `permitidos: true` pero `efectivos: false`
> en **todos** los tenants, Knock-Out incluido, porque su interruptor es
> `modulo_inventario_activo` (ADR 0013) y nadie lo tiene encendido. Es el comportamiento de 0103,
> no una regresión de la 0113 — pero conviene saberlo antes de que alguien pregunte por qué el POS
> no enseña recetas.

#### El gateway sí deja pasar la llamada del panel

Era lo único de la rama que no se podía verificar sin desplegar. Con un `x-vim-interno`
deliberadamente incorrecto y un `conexion_id` inexistente —sin tocar Uber ni ninguna fila— las tres
variantes contestaron **`401 {"error":"INTERNO_INVALIDO"}`**: vocabulario nuestro, o sea que el
gateway dejó pasar y corrió el código de la función.

De paso se cerró la duda que quedaba anotada en el código: el gateway acepta **`apikey` sola**, sin
`Authorization`. El panel manda las dos, así que no hay nada que cambiar; pero la suposición de que
`Authorization` era obligatoria era falsa.

Funciona igual con el secreto sin dar de alta: sin `VIM_DELIVERY_INTERNO_SECRET` configurado,
cualquier cabecera es inválida por diseño (`secretoInternoValido` exige que el configurado no sea
vacío).

#### El espejo: de 30 s a 5 minutos, con una caja 0.4.68

La prueba de verdad de esta entrega, medida sobre `cajas.espejo_apps_at` de la caja de pruebas
(versión **0.4.68**, sin desplegar nada en el escritorio):

| Momento | Intervalos observados |
|---|---|
| Estado 3 (encendido) | 31, 29, 28, 32 s → **NORMAL** |
| Estado 2 (el dueño lo apaga) | **323 s** → **REPOSO** |
| Estado 3 otra vez | 33, 34, 30, 30, 32, 30, 31, 33 s → **NORMAL** |

El cambio es **inmediato**, no espera al latido: el guard vive en la Edge Function y se evalúa en
cada llamada; la caja solo obedece el `siguiente_en_ms` que recibe. Diez veces menos carga sin
tocar el parque. El cero llega con 0.4.70, que además detiene el espejo.

Y el estado 1 (sin add-on) deja las **dos** llaves en `false`, como debe.

#### El pedido con el módulo apagado (13 sep 2026, 17:23 UTC)

Pedido real en la tienda sandbox con `efectivos.delivery_apps = false` (add-on concedido,
interruptor del dueño apagado). Orden `1546d6e0-e81a-44cd-820a-ad9d82f5b592`.

```
delivery_eventos #174   orders.notification
  firma_valida = true    procesado = true
  respuesta.accion  = SIN_MODULO
  respuesta.detalle = tenant d3462bb3-… sin el módulo de delivery
  tenant_id = NULL   conexion_id = NULL   http_status = NULL
```

Las tres cosas que se querían ver:

1. **El webhook sigue recibiendo y verificando la firma.** El módulo no le quita a Uber su acuse:
   se contesta 200 y el evento queda registrado. Un webhook que fallara haría que Uber reintentara
   y acabara marcando la integración como caída.
2. **`accion = SIN_MODULO`**, con el tenant nombrado en el detalle.
3. **Ninguna fila nueva en `delivery_pedidos`**: siguen siendo las cuatro de siempre.

Y una cuarta, que es la que justifica dónde está puesto el guard: **ese pedido tiene un solo evento
en toda la tabla, el de entrada**. Ni una llamada de salida a Uber — el guard corre antes de
`obtenerOrden()`, así que un tenant sin módulo no cuesta ni un viaje de red.

La conexión se quedó en `ACTIVA`: apagar el interruptor **no** pausa la tienda en Uber. Es a
propósito — pausar es cosa del panel cuando VIM retira el add-on, no del dueño que apaga su propio
módulo un rato. El efecto visible para el cliente final es que el pedido se queda sin aceptar y
expira por la ventana de ~11 min de Uber.

El `tenant_id` nulo del evento confirma lo que advierte el guion: esa fila **solo se ve desde el
editor SQL**, nunca desde el admin del cliente, porque no hay pedido al que enrutarla.

#### El 403, y la cuarta función que faltaba (13 sep 2026)

**El 403 de `delivery-uber-conexion`, probado con la sesión de un dueño.** Con el módulo apagado,
"Comprobar" en el admin devolvió el error genérico *"Algo salió mal con la conexión"* — el admin
desplegado no tiene traducción para `SIN_MODULO_DELIVERY` y cae al mensaje por defecto. Del lado de
la base, **ningún evento**: ni el `verificar` que esa acción escribe siempre, ni la llamada a Uber
que lo precede. El guard cortó antes de hablar con Uber. (En la rama ya hay mensaje para ese código,
en el admin y en el POS: sin él, una pestaña abierta desde antes solo vería el código en crudo.)

**Y buscando eso apareció un agujero.** Doce segundos después de apagar el módulo entró un evento
`tienda_estado`, y otro al minuto siguiente, y otro. No era el "Comprobar": es la pantalla "Pedidos
de apps" del POS, que pregunta el estado de la tienda **cada 60 s** (`REFRESCO_TIENDA_MS`) contra
`delivery-accion` — **una cuarta función que el spec no guardaba**. 56 de los últimos 60 eventos de
salida eran ese sondeo, y siguieron entrando con el módulo apagado.

Arreglado en la misma rama: `delivery-accion` exige el módulo para sus cuatro acciones de TIENDA
(`tienda_estado`, `tienda_pausar`, `tienda_reanudar`, `tienda_prep`) y deja pasar las de PEDIDO —
un cliente al que se le retira el módulo con pedidos vivos tiene que poder despachar comida ya
pagada, y nuevos no entran porque el webhook los descarta antes.

**Verificado en producción con la función redesplegada**, y con control para descartar que la
pantalla simplemente se hubiera cerrado:

| Ventana | `tienda_estado` |
|---|---|
| Antes (módulo encendido) | 17:28:15, 17:29:16, 17:31:16, 17:33:16, 17:35:57 |
| Módulo apagado 17:37:38 → 17:41:54 | **ninguno en 4 minutos** |
| Encendido otra vez a las 17:41:54 | 17:42:33 (a los 39 s), 17:44:33 |

El sondeo nunca paró: el POS siguió preguntando y se llevó 403 sin que la llamada saliera a Uber.

#### El secreto interno, dado de alta y comprobado (13 sep 2026)

`VIM_DELIVERY_INTERNO_SECRET`: 32 bytes aleatorios en hex, el mismo valor en Supabase (Edge
Functions → Secrets) y en Vercel (proyecto `platform`, los tres entornos). Queda además en
`supabase/functions/.env`, que está en `.gitignore`, para desarrollo local.

**Los dos caminos automáticos estaban cerrados**, y conviene saberlo para la próxima:
`supabase secrets set` —y también `secrets list`— responde *"Access token not provided"* aunque
`db push` y `functions deploy` funcionen en la misma máquina y el mismo minuto; y el token que el
CLI de Vercel dejó en `auth.json` estaba **caducado** (`invalidToken` de la API). Los dos altas se
hacen desde el dashboard.

Comprobado contra la función desplegada, **sin llamar a Uber ni tocar ninguna fila** (el
`conexion_id` es todo ceros):

| Llamada | Respuesta |
|---|---|
| secreto incorrecto (control) | `401 INTERNO_INVALIDO` |
| secreto bueno, conexión inexistente | **`404 CONEXION_NO_EXISTE`** |
| secreto bueno, acción `desconectar` | `403 ACCION_NO_PERMITIDA` |

La segunda es la que importa: llegar hasta "esa conexión no existe" significa que la llamada pasó
el gateway, pasó la puerta interna y llegó a resolver el tenant desde la fila. La tercera confirma
el alcance: el secreto autentica al llamador, no le autoriza cualquier acción — por el camino
interno solo entra `pausar`.

**Lo que todavía no está probado es el lado de Vercel.** El único código que lee esa variable es el
de retirar el add-on, así que se comprueba en la ola B: la respuesta del panel tiene que traer
`{pausadas: 1, fallos: []}`. Y una variable nueva en Vercel no aplica hasta el siguiente
despliegue.

#### Lo que la ola A no puede probar

- ~~El webhook descartando con `SIN_MODULO`~~: **probado**, ver arriba.
- ~~El 403 `SIN_MODULO_DELIVERY`~~: **probado** con la sesión de un dueño, ver arriba.
- **Toda la interfaz** (el interruptor, la sección que desaparece, el POS) y **el aviso a Uber**:
  son la ola B, y el aviso necesita además el secreto dado de alta en Supabase y en Vercel.

### Resultado de la ola B — 13 sep 2026

Con el PR #12 mezclado (`1af7f8c`) y los cinco proyectos de Vercel desplegados.

**Estado 2, el dueño lo apaga desde el admin.** El interruptor escribió
`modulo_delivery_activo = false` y `modulos_efectivos` quedó en `permitidos: true` /
`efectivos: false`. En pantalla: la sección **se queda** con su interruptor pero sin el asistente de
Uber —esa es la diferencia visible con el estado 1— y el POS esconde "Pedidos de apps", que
reaparece al volver a encender.

**Estado 1, VIM retira el add-on desde el panel.** Lo único de toda la entrega que no se podía
ejercitar de otra forma, porque es lo que estrena la variable de Vercel:

```
delivery_eventos #193   18:43:43   pos_data_actualizar
  procesado = true   respuesta = {"integration_enabled": false}
delivery_conexiones     estado = PAUSADA
modulos_efectivos       permitidos = false   efectivos = false
```

El camino entero: el panel leyó `VIM_DELIVERY_INTERNO_SECRET`, llamó a la Edge Function, pasó el
gateway y la puerta interna, resolvió el tenant desde la fila de la conexión y le dijo a Uber que
cerrara. El interruptor del dueño seguía en `true` y aun así las dos llaves cayeron: sin add-on, lo
que el dueño quiera da igual.

**Un contraste que quedó grabado sin buscarlo:** el mismo botón "Comprobar", con el módulo
encendido, escribió su evento `verificar` a las 18:37 (#192); con el módulo apagado, un rato antes,
no dejó rastro ninguno. Misma acción, mismo usuario, distinto módulo.

**Devolverlo.** Salió un bug, y no de esta entrega: dar de alta el add-on el mismo día de la baja
reventaba con `duplicate key value violates unique constraint "addon_unico_activo"`, porque esa
restricción de la 0002 es `UNIQUE (tenant_id, addon_id, fecha_inicio)` y no lo que su nombre dice.
Arreglado en el PR #14 —un alta el mismo día se trata como deshacer la baja— y **probado en el
escenario exacto que falló**: tras desplegar, el alta entró limpia y la fila quedó reactivada con
`fecha_fin: null`, precio **0.00** y la nota "incluido en el plan" (el tenant está en NEGOCIO).

La conexión volvió a `ACTIVA` reusando la misma fila (`7a5b0309…`, creada el 6 sep), con la carta
republicada: 49 ítems, 1 combo, 5 grupos, 10 opciones.

#### Lo que la ola B dejó pendiente, y ya no

Faltaba la **ola C**: publicar la 0.4.70. Mientras no existió ese instalador, ninguna caja tenía el
guard del escritorio y el espejo de un cliente sin módulo **bajaba a 5 minutos pero no paraba**
(medido el 13 sep: sellos a 18:19:06, 18:24:22 y 18:29:18, con tres latidos de por medio; el
`directivas.json` sí traía `delivery_apps: false` — el dato llegaba, faltaba el código que
reacciona). Resuelto abajo.

### Resultado de la ola C — 13 sep 2026

Instalador **0.4.70** publicado (release `v0.4.70`, 156,357,497 bytes; el `sha512` del manifiesto se
calculó sobre el asset **descargado**, no sobre el local) y instalado en la caja de pruebas.

#### El espejo se detiene, y vuelve

| Hora (UTC) | Qué |
|---|---|
| 19:35:59 | sondeo normal, cada ~30 s |
| **19:36:03** | **el dueño apaga el módulo** |
| 19:36:32 | último sondeo: este ya recibe la respuesta de reposo |
| 19:41:50 | sondeo de reposo, a 5 min |
| **19:43:56** | **latido** → la caja se entera |
| — | **nada más**: el sello siguiente tocaba hacia las 19:46:50 y no llegó |
| **19:50:44** | **se vuelve a encender** |
| **19:53:57** | **latido** → la caja se entera |
| 19:53:58 | el espejo arranca solo, y sigue a ~30 s (19:54:27, 19:55:00, 19:55:31…) |

En el log de la caja (`%APPDATA%/vim-pos-desktop/vim-pos.log`), las dos líneas, cada una a
milisegundos de su latido:

```
[19:43:57.386] · [espejo] detenido (el cliente apagó el módulo de apps de delivery)
[19:53:59.007] · [espejo] iniciado (el cliente encendió el módulo de apps de delivery)
```

**De 288 llamadas al día a cero**, sin reiniciar la caja y sin que el cajero note nada.

#### Lo que hay que saber para operar

**El cambio tarda hasta 10 minutos en los dos sentidos**, porque viaja en el latido. Apagar no
duele: la carga cae a reposo en el acto (eso lo decide la Edge Function en cada llamada) y la
parada total llega con el latido. **Encender sí se nota**: a un cliente que acaba de pagar puede
tardarle hasta 10 minutos en volverle el espejo. No es un fallo; es el precio de que la caja no
consulte nada más que su latido.

**Cómo distinguir reposo de parada, que es donde ya me equivoqué una vez:** son indistinguibles
durante los primeros cinco minutos. Un espejo en reposo sella `cajas.espejo_apps_at` cada ~300 s; uno
detenido no sella nunca. Hay que esperar **más de un ciclo de reposo** después del latido antes de
concluir nada — y confirmar con el control: encender otra vez y ver que vuelve.

## 5. Cuando algo falla

- `delivery_eventos.error` dice qué pasó al procesar (`UBER_TOKEN_401` = credenciales o entorno
  equivocados; `SIN_CONEXION` = el `store_id` no está en `delivery_conexiones`).
- `delivery_pedidos.ultimo_error` y estado `ERROR`: el cajero puede reintentar con **Aceptar**.
- Pedido `RECIBIDO` con `items_sin_mapear`: los ids del menú de Uber no son uuids del catálogo, o
  falta `config.producto_generico_id` en la conexión.
- Sin turno abierto la nube no auto-acepta; el pedido espera al cajero (`vence_aceptacion`).

## Prueba local que ya se hizo (sin Uber real)

```powershell
supabase start; supabase db reset
supabase functions serve delivery-webhook-uber --env-file supabase/functions/.env.delivery.local --no-verify-jwt
# .env.delivery.local: UBER_ENTORNO=sandbox / UBER_CLIENT_ID=test-client / UBER_CLIENT_SECRET=test-secret
```

Resultado: firma incorrecta → 401 y fila con `firma_valida=false`; firma correcta → 200, fila
`firma_valida=true`, procesamiento intenta `obtenerOrden` y registra `UBER_TOKEN_401` (esperado sin
credenciales reales); el mismo `event_id` repetido → 200 sin crear otra fila.
