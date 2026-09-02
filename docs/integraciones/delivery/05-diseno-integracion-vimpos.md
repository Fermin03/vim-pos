# Cómo va a funcionar la integración de delivery dentro de VIM POS

**Estado:** propuesta de diseño (1 sep 2026), pendiente de validar con Fermín antes de escribir el
primer ADR. Se apoya en lo que ya existe en el repo y en lo aprendido en los documentos 01–04.

## 0. Lo que ya existe y se reutiliza

La especificación original (flujos Dark Kitchen §4 y §17, arquitectura 1C.2 §1.4 y §8) dejó el
terreno preparado a propósito:

| Ya existe | Dónde | Para qué sirve aquí |
|---|---|---|
| `modo_servicio` con `APP_RAPPI`, `APP_UBEREATS`, `APP_DIDI`, `APP_IFOOD`, `APP_OTRO` | enum, `tickets.modo_servicio` | El ticket de un pedido de app ya tiene canal |
| `metodo_pago` con `APP_RAPPI`, `APP_UBEREATS`, `APP_DIDI`… | enum, `pagos` | "La app ya cobró": el pago se registra contra la app, no contra caja |
| `ticket_origen = 'API_EXTERNA'` | enum, `tickets.origen_creacion` | Marca que el ticket lo creó la integración, no un cajero |
| `tickets.folio_externo_app` | 0008 | El id de la orden en la app; llave de conciliación |
| `tickets.marca_virtual_id` y `marcas_virtuales.apps_externas_config jsonb` | 0007 | Dark kitchen multi-marca; config por marca × canal |
| `productos.modos_servicio_disponibles text[]` | 0007 | Qué productos se publican en cada app |
| `productos.agotado_manual/automatico`, `opciones_modificador.agotada` | 0007 | Origen del "apagar ítem" hacia las apps |
| `apps_liquidaciones` + `apps_liquidacion_items` con `ingesta_metodo 'MANUAL'/'API'` y motor de conciliación en el admin (Delivery → Conciliación) | 0009, roadmap B2 | La conciliación por API cae aquí |
| `delivery_asignaciones` + `repartidores` | 0009, 0076–0078 | Solo aplica cuando el restaurante reparte con flota propia (Rappi `marketplace`, DiDi `delivery_type 2`, Uber BYOC) |
| `cajas.ultima_conexion` (la sella `sync_push_snapshot`; ojo: solo cuando hay ventas que subir) | 0073 | Base para contestar el PING de Rappi y decidir ONLINE/OFFLINE; habrá que añadir un latido real de la caja (p. ej. desde el pull cada 10 min) |
| Edge Functions con `service_role` y `_shared/cors.ts` | `supabase/functions/` | Patrón para los receptores de webhooks y los adaptadores |
| Web Push a las pantallas del tenant | `enviar-push` | Avisar "pedido nuevo de Rappi" aunque el POS no esté en primer plano |

Lo que **no** existe: tablas para la conexión con cada app, para el pedido crudo, para el log de
webhooks y para las publicaciones de menú; los adaptadores; las pantallas.

## 1. Principio: VIM es el integrador, el restaurante solo autoriza

Las tres apps trabajan con el mismo modelo: **una aplicación registrada por el proveedor de POS**
(VIM) con credenciales propias, y **N tiendas de N comercios** vinculadas a esa aplicación. Por eso:

- Las credenciales de Rappi (`client_id/secret`), DiDi (`app_id/secret`) y Uber (`client_id/secret`)
  son de VIM, viven como **secrets de Supabase** (variables de entorno de las Edge Functions) y
  nunca en tablas del tenant ni en el navegador. Hay un juego de prueba y uno de producción por app.
- El restaurante **no captura credenciales**. Lo que hace es **autorizar** a VIM sobre su tienda,
  desde el panel de administración, con el mecanismo de cada app:
  - **Uber Eats**: botón "Conectar Uber Eats" → redirige al login de Uber (`eats.pos_provisioning`)
    → vuelve a `https://<admin>/integraciones/uber/callback?code=…` → una Edge Function cambia el
    `code` por el token del dueño, lista sus tiendas (`GET /v1/delivery/stores`), el dueño elige
    cuál corresponde a la sucursal, y la función hace `POST /pos_data` con `integrator_store_id =
    sucursal.id`. El token del dueño se desecha después.
  - **DiDi Food**: botón "Conectar DiDi Food" → Edge Function pide la URL de autorización
    (`authorizationpage/getUrl` con `app_shop_id = sucursal.id`) → se abre en el navegador → el dueño
    entra con su cuenta de DiDi Store y pulsa *Authorize*. La función después obtiene el
    `auth_token` de la tienda, fija `setconfirmmethod = OpenAPI`, `setStatus`, `apply/set`.
  - **Rappi**: botón "Conectar Rappi" → OAuth PKCE en Portal Partners → con el `id_token` la función
    llama `GET /stores/integration-status`, muestra las tiendas del dueño, y hace
    `POST /stores/provisioning` con `store_integration_id = sucursal.id`, `ping_active = true`,
    `cancellation_events = true`. El resultado llega por webhook `STORE_PROVISIONING_STATUS`.
    (Mientras Rappi no habilite self-onboarding a VIM, el TAM asocia la tienda a mano y en el panel
    solo se captura el `rappiId`.)
- El único dato que el cliente llega a "capturar" es, en el peor caso, el id de su tienda en la
  app; y lo hace eligiéndolo de una lista, no tecleándolo.

## 2. Arquitectura

```
   Rappi / DiDi / Uber ──webhook──▶ Edge Function delivery-webhook-{app}   (pública, valida firma, responde en <2 s)
                                          │  inserta delivery_eventos + delivery_pedidos (idempotente)
                                          │  pg_notify / Realtime
                                          ▼
                              Edge Function delivery-procesar      (service_role; cola por pedido)
                                          │  normaliza → mapea catálogo → decide auto-aceptar
                                          │  llama al adaptador (accept/take/confirm) dentro de la ventana
                                          ▼
                                 tablas del tenant (RLS) ◀──▶ POS de caja (Realtime + panel "Pedidos de apps")
                                          ▲                          │ aceptar / rechazar / listo / entregado
                                          │                          ▼
                              Edge Function delivery-accion  ──▶ adaptador ──▶ API de la app
                              Edge Function delivery-menu    ──▶ publica menú / disponibilidad
                              Edge Function delivery-salud   ──▶ contesta PING (Rappi) y abre/cierra tienda (DiDi/Uber) según la caja
                              Edge Function delivery-concilia ──▶ Financial / Reporting / Reconciliation → apps_liquidaciones
```

- **Un adaptador por app** (`_shared/delivery/rappi.ts`, `didi.ts`, `uber.ts`) detrás de una
  interfaz común: `vincularTienda`, `aceptar`, `rechazar`, `marcarListo`, `marcarEntregado`,
  `abrirTienda`, `cerrarTienda`, `publicarMenu`, `cambiarDisponibilidad`, `normalizarPedido`.
- **Regla dura respetada**: el POS y el admin nunca hablan con las apps ni ven secretos; todo pasa
  por Edge Functions. Las tablas nuevas llevan `tenant_id` + RLS como cualquier otra.
- Los webhooks son públicos y sin JWT: se protegen con la firma de cada app, con rate limit y con
  idempotencia por `(app, id_externo, tipo_evento, timestamp)`. Se guarda siempre el JSON crudo.
- Dominio para los webhooks: uno fijo (p. ej. `https://<proyecto>.supabase.co/functions/v1/delivery-webhook-uber`)
  y, cuando exista `vimpos.mx`, un alias estable, porque cambiar la URL implica reconfigurar en las
  tres apps.

## 3. Tablas nuevas (migración aditiva, todas con `tenant_id` y RLS)

```sql
-- Un renglón por sucursal × app. Es la "conexión".
delivery_conexiones (
  id, tenant_id, sucursal_id, marca_virtual_id NULL,
  app                modo_servicio  CHECK IN ('APP_RAPPI','APP_UBEREATS','APP_DIDI'),
  estado             text  -- SIN_CONECTAR | PENDIENTE | ACTIVA | PAUSADA | ERROR | DESCONECTADA
  tienda_id_externo  text, -- rappiId / shop_id / store_id (UUID)
  tienda_nombre_app  text,
  auto_aceptar       boolean DEFAULT true,
  tiempo_prep_min    integer DEFAULT 15,
  credencial_tienda  text NULL, -- SOLO DiDi: auth_token cifrado (pgsodium/vault); Uber y Rappi no tienen token por tienda
  credencial_vence   timestamptz NULL,
  config             jsonb DEFAULT '{}', -- % de incremento de precio, modos aceptados, webhooks_version, etc.
  ultimo_evento_at, ultimo_error, conectada_at, desconectada_at, created_*, updated_*
  UNIQUE (sucursal_id, app)
)

-- Un renglón por pedido recibido de una app; independiente del ticket para poder recibir
-- aunque no haya turno abierto.
delivery_pedidos (
  id, tenant_id, sucursal_id, conexion_id, app,
  id_externo         text,       -- order_id de la app (string; DiDi es de 64 bits)
  folio_corto        text,       -- display_id / order_index / order_id corto para gritar en cocina
  estado             text,       -- RECIBIDO | ACEPTADO | RECHAZADO | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO | EXPIRADO
  estado_app         text,       -- el estado tal cual lo reporta la app
  tipo_entrega       text,       -- APP_REPARTE | RESTAURANTE_REPARTE | RECOGE_CLIENTE
  programado_para    timestamptz NULL,
  vence_aceptacion   timestamptz,  -- recibido + 4/5/11.5 min según app
  cliente_nombre, cliente_telefono, cliente_telefono_pin, direccion_texto, nota_cliente,
  subtotal_mxn, descuento_app_mxn, descuento_tienda_mxn, envio_mxn, propina_mxn,
  total_cliente_mxn, total_restaurante_mxn, efectivo_a_cobrar_mxn,  -- numeric(12,2), ya normalizados
  payload_raw        jsonb,      -- la orden completa como llegó (para soporte y conciliación)
  ticket_id          uuid NULL REFERENCES tickets(id),
  items_sin_mapear   jsonb NULL, -- SKUs que no se encontraron en el catálogo
  repartidor_nombre, repartidor_telefono, repartidor_estado,
  recibido_at, aceptado_at, listo_at, entregado_at, cancelado_at, motivo_cancelacion, cancelado_por,
  UNIQUE (app, id_externo)
)

-- Bitácora de todo lo que llega y lo que se manda (para soporte con la app y para métricas de éxito).
delivery_eventos (
  id, tenant_id NULL, app, direccion ('ENTRADA'|'SALIDA'), tipo, id_externo NULL, conexion_id NULL,
  firma_valida boolean, http_status, payload jsonb, respuesta jsonb, procesado boolean, error text, created_at
)

-- Cada vez que se publica el menú a una app.
delivery_menu_publicaciones (
  id, tenant_id, sucursal_id, conexion_id, app, version integer,
  payload jsonb, estado ('ENVIADO'|'EN_REVISION'|'APROBADO'|'RECHAZADO'|'ERROR'),
  task_id_externo text, respuesta jsonb, errores jsonb, publicado_por, created_at, resuelto_at
)
```

Sin tabla de mapeo de productos: el identificador que se manda a las apps es **el `uuid` de VIM**
(`productos.id`, `opciones_modificador.id`, `grupos_modificadores.id`, `categorias.id`). Es estable,
único, no tiene `/` ni `;`, cabe en los 500 caracteres de Rappi y evita mantener un catálogo
paralelo. Cuando la orden regresa, `sku`/`app_item_id`/`item.id` es directamente nuestra llave.
Excepción: en Rappi un topping con precio distinto según el producto necesita SKU propio; se genera
`"{opcion_id}@{producto_id}"` solo en ese caso.

## 4. Flujo de un pedido, paso a paso

1. **Llega el webhook.** `delivery-webhook-uber` valida `X-Uber-Signature`; `-didi` valida
   `didi-header-sign` y contesta `{errno:0}`; `-rappi` valida `Rappi-Signature`. Se inserta en
   `delivery_eventos`. Si es un pedido nuevo, se busca la `delivery_conexion` por el id de tienda
   (`meta.user_id`, `app_shop_id`, `store.external_id`) y se inserta `delivery_pedidos` en estado
   `RECIBIDO` con `vence_aceptacion`. Responde 200 en menos de 2 s; lo pesado va después.
2. **Se normaliza.** Uber: `GET /v1/delivery/order/{id}?expand=carts,deliveries,payment`. DiDi y
   Rappi ya traen todo. El adaptador convierte el dinero a `numeric(12,2)` (DiDi ÷ 100, Uber ÷ 100 000,
   Rappi por confirmar), resuelve ítems y modificadores contra el catálogo por uuid y registra los
   que no encuentre en `items_sin_mapear`.
3. **Se decide aceptar.** Si `auto_aceptar` está activo **y** la caja de la sucursal dio señal de
   vida en los últimos minutos (`cajas.ultima_conexion` más el latido que falta) **y** hay turno abierto **y** todos los ítems se mapearon, la
   función acepta en la app de inmediato (Rappi `take/{tiempo_prep}`, DiDi `confirm`, Uber
   `accept` con `ready_for_pickup_time = ahora + tiempo_prep` y `external_reference_id = folio del
   ticket`). Si falta algo, se deja `RECIBIDO` y el cajero decide con un contador visible; si el
   contador expira, la app lo cancela y nosotros marcamos `EXPIRADO` (en Uber conviene rechazar
   explícitamente con `POS_OFFLINE`/`POS_NOT_READY` para no manchar el 99 %).
4. **Se crea el ticket.** Un RPC `crear_ticket_desde_app` (SECURITY DEFINER, solo llamable por
   service_role) abre el ticket en la caja/turno vigentes de la sucursal con `origen_creacion =
   'API_EXTERNA'`, `modo_servicio = APP_*`, `folio_externo_app`, `marca_virtual_id` si aplica, los
   ítems con `precio_unitario_snapshot` **al precio que pagó el cliente en la app**, la nota del
   cliente en `nota_cocina`/`nota_general`, y aplica el pago con `metodo_pago = APP_*` por
   `total_cliente_mxn` (o `PAGO_AL_RECIBIR`/`EFECTIVO` por la parte en efectivo cuando el cliente o
   el repartidor pagan en tienda). El ticket queda `PAGADO`, entra a cocina (comanda/KDS) como
   cualquier otro y aparece en la lista de cuentas con la etiqueta del canal y el `folio_corto`.
   Las comisiones **no** se tocan aquí: se conocen al conciliar.
5. **Cocina y entrega.** "Listo" en el POS/KDS → `delivery-accion` manda `ready` (Uber),
   `order/ready` (DiDi) o `ready-for-pickup` (Rappi, solo si la tienda está en modo manual). Los
   webhooks de repartidor (`deliveryStatus`, `delivery.state_changed`, `ORDER_OTHER_EVENT`)
   actualizan `repartidor_*` y el POS muestra "repartidor en camino / en tienda / entregado". Si el
   restaurante reparte con su flota, se crea la `delivery_asignacion` como hoy y "entregado" se
   reporta a DiDi (`order/delivered`).
6. **Cancelaciones.** Del lado de la app (`ORDER_EVENT_CANCEL`, `orderCancel`, `orders.failure`):
   se cancela el ticket con el RPC existente y motivo "cancelado por la app", se avisa por push y se
   imprime aviso en cocina. Del lado del restaurante: rechazo antes de aceptar (con motivo mapeado a
   los catálogos de cada app y, en Rappi, opcionalmente apagando los SKUs agotados); después de
   aceptar solo DiDi y Uber lo permiten por API. Las solicitudes de cancelación del cliente en DiDi
   (`orderCancelApply`) se muestran en el POS con dos botones y 10 minutos de plazo.
7. **Efectivo.** Cuando la app indica efectivo (`cash`, `pay_type 2`, `cash_amount_due`), el ticket
   queda con esa parte en `PAGO_AL_RECIBIR` y se liquida como hoy con el delivery propio; en DiDi con
   repartidor de DiDi, al recibir el dinero del repartidor se llama `payConfirm`.

## 5. Salud de la tienda: prendida solo si la caja está viva

- **Rappi PING** (cada 3 min por tienda): `delivery-webhook-rappi` contesta `{status:"OK"}` solo si la
  sucursal tiene señal de vida reciente (`cajas.ultima_conexion` + latido nuevo), turno abierto y la conexión no está en
  `PAUSADA`. Si no, contesta otra cosa y Rappi apaga la tienda; al volver, la prende. Es exactamente
  el comportamiento que queremos: que nadie pida a una cocina que no está.
- **DiDi y Uber** no preguntan: un job periódico (`delivery-salud`, cron cada 2 min) compara el
  estado de la caja con el estado remoto y llama `setStatus` / `update-store-status` cuando cambian.
  Además el POS tiene un botón **"Pausar apps"** (por app o todas) con tiempo, que hace lo mismo y
  se refleja en `delivery_conexiones.estado = PAUSADA`.
- Abrir turno → tiendas ONLINE; cerrar turno → OFFLINE. Los horarios publicados en cada app se
  toman de `sucursales.horario_apertura/cierre` (y en Uber del `service_availability` del menú).

## 6. Menú: se publica desde el catálogo de VIM, no se edita en las apps

- En el admin, **Catálogo → Canales**: por producto se marca en qué apps se vende (ya existe
  `modos_servicio_disponibles`) y, por app, un **% de incremento** (`delivery_conexiones.config.incremento_pct`,
  como pide la spec Dark Kitchen §4.4). El precio interno no cambia.
- "Publicar menú en Uber Eats / DiDi / Rappi" arma el payload desde `categorias` → `productos`
  (`estado ACTIVO`, `visible_en_pos`, con el canal) → `productos_grupos_modificadores` →
  `grupos_modificadores` (`tipo_seleccion`, `minimo/maximo_selecciones`) → `opciones_modificador`
  (`precio_extra_mxn`), con `imagen_url` pública https y las reglas de cada app (doc 04). Lo manda,
  guarda `delivery_menu_publicaciones` y muestra el resultado: inmediato en Uber, tarea en DiDi,
  validación + aprobación humana en Rappi. Los errores se listan con el producto culpable.
- Impuestos: precios con IVA incluido → Uber `vat_rate_percentage = tasa_iva`, DiDi `tax_info_list
  {type 1, rate 1600}`, Rappi sin campo. IEPS por producto si el catálogo lo trae (hoy no).
- **Disponibilidad**: cambiar `agotado_manual`/`agotado_automatico` de un producto u `agotada` de
  una opción dispara (trigger → cola → `delivery-menu`) el apagado/prendido en cada app conectada:
  Uber `POST …/menus/items/{id}` con `suspension_info`, DiDi `updateItemStatus`, Rappi
  `PUT availability/stores/items`. Al volver a subir menú completo en Rappi, los apagados **siguen
  apagados** (hay que prenderlos aparte).
- Texto sanitizado antes de mandar a Rappi (sin emojis ni nombres de competidores) y nombres
  recortados a 50 caracteres para DiDi.

## 7. Pantallas

**Admin (`apps/admin`, nueva sección "Integraciones" o dentro de Configuración):**

- Tarjeta por app: logo, estado (sin conectar / pendiente / activa / pausada / error), tienda
  vinculada, última orden, botón *Conectar* / *Desconectar*, *Publicar menú*, % de incremento,
  tiempo de preparación por defecto, auto-aceptar sí/no, historial de publicaciones y errores.
- La sección Delivery → Conciliación que ya existe recibe las liquidaciones por API (`ingesta_metodo
  'API'`) además del pegado manual.

**POS de caja (`apps/pos`):**

- Panel **"Pedidos de apps"** (Realtime sobre `delivery_pedidos` de la sucursal): tarjetas con logo
  del canal, `folio_corto`, cliente, ítems, nota, tipo de entrega, total, y un **contador** hasta
  `vence_aceptacion`. Botones *Aceptar* (con tiempo de preparación) y *Rechazar* (motivos del
  catálogo de la app). Con auto-aceptación activa, la tarjeta aparece ya aceptada y solo queda
  *Listo* / *Entregado* / *Cancelar*.
- Sonido y Web Push al llegar un pedido; badge en la barra; impresión automática de comanda con el
  canal en grande (la spec Dark Kitchen §6 pide etiquetas por marca/canal).
- Botón "Pausar apps" con tiempo (15/30/60 min) y "Reanudar".
- El ticket resultante se ve en cuentas abiertas como cualquier otro, ya pagado, con el canal.

**KDS:** la comanda lleva el canal y el `folio_corto`; nada más cambia.

## 8. Offline y la caja de escritorio

- Los webhooks llegan a la nube. Si la sucursal **no tiene internet**, no puede recibir pedidos de
  ninguna forma; el PING de Rappi y el job de salud apagan la tienda automáticamente en minutos, que
  es lo correcto. Cuando vuelve, se prende sola.
- La caja de escritorio (Postgres local + sync por snapshot) **no** recibe webhooks: lee
  `delivery_pedidos` de la nube por Realtime/polling ligero cuando hay internet y crea el ticket
  localmente por el mismo RPC; el snapshot lo sube después como cualquier ticket. Para la aceptación
  dentro de la ventana no importa dónde esté el ticket: la acepta la nube (`auto_aceptar`).
- Si hay internet pero la caja lleva más de 3 minutos sin señal de vida, la nube no auto-acepta y
  las tiendas se apagan: no se aceptan pedidos que nadie va a preparar.

## 9. Conciliación por API

Un job diario (`delivery-concilia`) por conexión activa: Rappi Financial API (`payments` +
`orders` + `cancellations` del último corte), Uber Reporting API (`POST /v1/eats/report` Payment
Details, resultado por webhook `eats.report.success` → CSV), DiDi Payment Reconciliation Report.
Cada corrida crea `apps_liquidaciones` con `ingesta_metodo = 'API'` y sus `apps_liquidacion_items`
con `folio_externo_app`, y corre el motor de conciliación existente (match exacto por folio). Las
comisiones y ajustes se conocen aquí, no en el ticket. Fase posterior a la recepción de pedidos.

## 10. Seguridad y cumplimiento

- Secretos de VIM en Supabase secrets; `auth_token` de DiDi por tienda cifrado en tabla (vault) y
  solo legible por Edge Functions; rotación automática por vencimiento.
- Firmas verificadas con comparación en tiempo constante; rechazo de eventos repetidos
  (`event_id` / `requestId`); rate limit por IP y por tienda; tamaño máximo de cuerpo.
- PII del cliente (nombre, teléfono, dirección) se guarda en `delivery_pedidos` con el mismo
  tratamiento que `clientes`/`direcciones_cliente` y se purga a los N días (definir N); DiDi ya
  manda datos ofuscados en modo privacidad y Uber teléfonos con PIN temporal. No se copia PII a
  `store_configuration_data` de Uber (lo prohíben).
- Todo lo que sale hacia las apps queda en `delivery_eventos` (dirección `SALIDA`) para calcular la
  tasa de éxito que exigen (98 %/99 %) y para soporte.
- CFDI: la venta por app es del restaurante; el cliente puede autofacturar con el folio del ticket
  como cualquier venta, y lo no facturado entra a la factura global. Pendiente confirmar con el
  contador cómo tratar la comisión que la app factura al restaurante (es un gasto, no afecta al
  ticket).

## 11. Orden de construcción propuesto

| Fase | Entregable | Depende de |
|---|---|---|
| F0 — Trámites | Solicitar acceso en las tres apps (doc 06). Registrar dominio/URL de webhooks estable | Fermín |
| F1 — Núcleo con Uber sandbox | Tablas, `delivery-webhook-uber`, adaptador Uber (auth, stores, pos_data, order accept/deny/ready, store status), panel POS "Pedidos de apps", RPC `crear_ticket_desde_app`, push y comanda | Sandbox Uber (autoservicio) |
| F2 — DiDi | Adaptador DiDi (auth_token por tienda, authorization page, confirm/cancel/ready/payConfirm, webhooks), pantalla de conexión en admin | *Qualification* de DiDi |
| F3 — Rappi | Adaptador Rappi (token, webhooks por tienda, PING, take/reject, self-onboarding cuando lo habiliten) | TAM de Rappi |
| F4 — Menú y disponibilidad | Publicación de menú desde el catálogo a las tres, sincronía de agotados, % de incremento | F1–F3 |
| F5 — Conciliación por API | Financial/Reporting/Reconciliation → `apps_liquidaciones` | F1–F3 |
| F6 — Piloto | Knock-Out Burger con una app real, 3 días con ≥ 98 % de aceptación, luego las demás | Todo lo anterior |

Cada fase termina con: tests del adaptador contra payloads reales guardados en `delivery/*/`, test
de RLS de las tablas nuevas y prueba de punta a punta en sandbox.
