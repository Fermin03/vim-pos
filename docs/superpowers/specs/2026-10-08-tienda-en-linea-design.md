# Tienda en línea

**Fecha:** 8 oct 2026
**Estado:** diseño aprobado por Fermín sección por sección, pendiente de plan
**Antecedentes:** ADR 0011 (integración de apps de delivery, el núcleo que se reutiliza), ADR 0016
(repartidores), ADR 0017 (zonas de envío), ADR 0027 y 0029 (menú por sucursal y menús del
catálogo), ADR 0030 (lealtad, el cliente se identifica por teléfono), migración 0096 (espejo de
pedidos en la caja), migración 0113 (add-on de delivery, el molde de dos capas), migración 0136
(`consumir_cupo`), migración 0149 (`ticket_impreso_at`), portal de autofactura (`apps/factura`, el
único precedente de superficie pública).

## 1. El problema

Un restaurante con VIM POS no tiene canal propio para vender en línea. Sus opciones son las apps de
reparto, que cobran comisión por pedido, o tomar pedidos por WhatsApp y capturarlos a mano en la
caja. Square lo resuelve con Square Online; VIM POS no tiene equivalente.

Casi todo lo que hace falta del lado de la operación ya existe: pedidos externos que caen en la caja
como ticket, zonas de envío, repartidores, clientes por teléfono, menú por sucursal. Falta la
superficie pública, su configuración y abrir el núcleo de pedidos a un canal que no sea una app.

## 2. Alcance

**Entra en esta entrega (la primera de tres):**

- Tienda pública por negocio en `pedidos.vimpos.com.mx/<nombre>`, pensada para teléfono.
- Pedidos **para recoger** y **a domicilio** con repartidor propio.
- **Pago al recibir**: efectivo o tarjeta en terminal.
- Compra como **invitado** o con **cuenta** (correo y contraseña).
- Apartado "Tienda en línea" en el admin, fuera de Configuración.
- Fotos de productos.
- Recepción en la caja y en el POS web: timbre, aceptar o rechazar, comandas, pausa.
- Seguimiento del pedido en vivo y correo de confirmación.
- Complemento `TIENDA` y su inclusión por plan.

**Segunda entrega:** pago con tarjeta en línea.

**Tercera entrega:** lealtad en la tienda con teléfono verificado, avisos por WhatsApp, dominio
propio, pedidos programados, compra mínima, pedir desde la mesa con QR.

**No entra en ninguna por ahora:** horarios distintos para recoger y domicilio, ocultar un producto
solo en la tienda, portada con imagen, reporte propio de ventas en línea, reflejar en el seguimiento
los cambios que el cajero haga al ticket después de aceptarlo.

## 3. Decisiones de Fermín

| Tema | Decisión |
|---|---|
| Formas de pedido | Recoger y domicilio. Pedir desde la mesa queda para después |
| Pago | Al recibir en esta entrega; tarjeta en línea en la segunda |
| Identidad del cliente | Elige entre registrarse o pedir como invitado |
| Dueño de la cuenta | Cada restaurante; el mismo correo puede existir en dos negocios |
| Entrada | Correo y contraseña |
| Aceptación | La decide el dueño; de fábrica, a mano |
| Timbre | Suena al llegar y se repite cada 20 s mientras nadie atienda |
| Dirección | `pedidos.vimpos.com.mx/<nombre>` |
| Disponibilidad | Horario por día + caja lista + botón de pausa |
| Seguimiento | Página en vivo y correo. **Sin tiempo estimado en ningún lado** |
| Estados | Al enviar: En proceso. Al aceptar: En preparación. Al imprimir el ticket o asignar repartidor: En camino |
| Cobro a VIM | Incluida en todos los planes menos Esencial; en Esencial, complemento de $100/mes |
| Admin | Apartado propio en el menú principal, no dentro de Configuración |
| Comandas | Al aceptar se imprimen en las áreas de impresión ya configuradas en el POS |
| Camino técnico | Abrir el núcleo de pedidos de apps a un canal "Tienda" (no un sistema paralelo) |

Completado por el diseño y aceptado: en recoger, el estado equivalente a "En camino" es **"Listo
para recoger"**; el estado final es **"Entregado"** y se marca al cobrar.

## 4. Arquitectura

```
Teléfono del cliente
      │
      ▼
apps/tienda (Next, Vercel, pedidos.vimpos.com.mx)
      │  ruta de servidor: añade sesión (cookie), IP real y secreto interno
      ▼
Edge Function `tienda` (service_role)  ── única puerta a la base
      │
      ▼
delivery_pedidos (canal TIENDA)  ◄── sondeo ── caja de escritorio (delivery-espejo.mjs)
      │                                              │ crea ticket local, avisa estados
      ▼                                              ▼
POS web (gestión NUBE)                      Edge Function `delivery-accion`
```

**Piezas nuevas**

- `apps/tienda`: aplicación Next pública. Su navegador **nunca** llama a Supabase: todo pasa por una
  ruta de servidor propia que reenvía a la función `tienda`. Así la sesión vive en una cookie
  `HttpOnly` de primera parte y no hace falta CORS.
- Edge Function `tienda` (`verify_jwt = false`): única con acceso a los datos de la tienda. Solo
  atiende peticiones que traigan el secreto `VIM_TIENDA_SECRET` (propio, distinto de
  `VIM_INTERNO_SECRET`); con él confía en la IP reenviada.
- Apartado `/tienda` en `apps/admin/app/(panel)/`.

**Piezas que se amplían**

- Núcleo de pedidos (`delivery_pedidos`, `delivery-accion`, `delivery-espejo`, cron de expirados).
- Agente de la caja `desktop/src/delivery-espejo*.mjs`.
- Pantalla `apps/pos/app/components/pantalla-pedidos-apps.tsx` y el sondeo de `home-pos.tsx`.
- `modulos_efectivos`, `_sincronizar_addons_del_plan` y sus espejos en TS.

**Recorrido de un pedido**

1. La tienda pide a `tienda` el negocio y el menú de la sucursal, con el veredicto de si se puede
   pedir.
2. El cliente arma el carrito, elige recoger o domicilio (zona y envío), y se identifica.
3. `tienda` valida y **recalcula todo en el servidor**, inserta el pedido en `delivery_pedidos` con
   `estado = RECIBIDO` y `vence_aceptacion = now() + minutos_aceptacion`, y manda el correo.
4. La caja lo baja en su siguiente sondeo y suena. El POS web lo ve en su propio sondeo.
5. Al aceptar (a mano o sola) se crea el ticket con `crear_ticket_desde_tienda`, se imprimen las
   comandas y el pedido pasa a `ACEPTADO`.
6. Imprimir el ticket o asignar repartidor lo pasa a `LISTO`; cobrar, a `ENTREGADO`; cancelar el
   ticket, a `CANCELADO`.
7. Si nadie acepta, el cron existente lo marca `EXPIRADO`.

Desde el paso 5 es un ticket normal: corte, CFDI, lealtad y reportes no llevan código especial.

## 5. Datos

Una migración aditiva. Número tentativo **0161**; antes de aplicarla se confirma contra
`origin/main` y las ramas vivas (trampa de numeración entre ramas paralelas). Va a producción a mano
y antes del merge, y viaja a la caja con el instalador.

### 5.1 `delivery_pedidos` admite el canal Tienda

- Columna `canal text NOT NULL DEFAULT 'APP' CHECK (canal IN ('APP','TIENDA'))`.
- `conexion_id` pasa a admitir NULL.
- El CHECK de `app` se reemplaza por uno que depende del canal:
  - `APP`: `app` es una de las tres apps y `conexion_id IS NOT NULL` (lo de hoy).
  - `TIENDA`: `app IN ('DRIVE_THRU','DELIVERY_PROPIO')` y `conexion_id IS NULL`.
- En canal Tienda, `app` es el **modo de servicio del ticket que resultará**: `DRIVE_THRU` es el
  Pick-up del POS y `DELIVERY_PROPIO` es Domicilio (`home-pos.tsx:2092`). `tipo_entrega` es
  `RECOGE_CLIENTE` o `RESTAURANTE_REPARTE`.
- `id_externo` es un identificador aleatorio generado por `tienda`; `folio_corto`, uno corto para
  leerlo en voz alta.
- Columnas nuevas, todas NULL en canal APP: `cliente_email citext`, `tienda_cuenta_id uuid`,
  `zona_envio_id uuid`, `direccion jsonb` (calle, número exterior e interior, colonia, código
  postal, ciudad, estado, referencias: los campos que exige `direcciones_cliente`),
  `pago_al_recibir text CHECK IN ('EFECTIVO','TARJETA')`, `paga_con_mxn numeric(12,2)`,
  `seguimiento_hash text UNIQUE` (SHA-256 del código del enlace; el código en claro no se guarda).
- `delivery_anonimizar_pedidos_viejos` también blanquea las columnas nuevas.

Los estados no cambian. Lo que ve el cliente es una traducción:

| `estado` | Cliente (domicilio) | Cliente (recoger) |
|---|---|---|
| `RECIBIDO` | En proceso | En proceso |
| `ACEPTADO`, `EN_PREPARACION` | En preparación | En preparación |
| `LISTO` | En camino | Listo para recoger |
| `ENTREGADO` | Entregado | Entregado |
| `RECHAZADO`, `CANCELADO`, `EXPIRADO` | Cancelado, con motivo | Cancelado, con motivo |

### 5.2 `crear_ticket_desde_tienda(p_pedido_id uuid) RETURNS uuid`

Hermana de `crear_ticket_desde_app` (mig. 0112), `SECURITY DEFINER`, solo `service_role`. Existe en
la nube y en el Postgres de la caja. Reutiliza `abrir_ticket`, `agregar_item_a_ticket`,
`agregar_combo_a_ticket` y `fijar_envio_ticket`.

1. Bloquea el pedido; si ya tiene `ticket_id` lo devuelve (idempotente). Exige `canal = 'TIENDA'`.
2. Toma el turno abierto de la sucursal o lanza `SIN_TURNO_ABIERTO`.
3. Resuelve al cliente por teléfono con `lealtad_resolver_cliente`; si no existe, lo crea con nombre
   y teléfono. Un cliente `BLOQUEADO` lanza `CLIENTE_BLOQUEADO`.
4. En domicilio, crea la `direcciones_cliente` del pedido (o reutiliza la que coincida) y la pone
   como `direccion_entrega_id`.
5. Abre el ticket con `modo_servicio = app`, `origen_creacion = 'API_EXTERNA'`,
   `folio_externo_app = id_externo`, `cliente_id` y `nombre_cliente`.
6. Agrega renglones y **pisa los precios con los del pedido**, como hace la de apps: lo cotizado al
   cliente manda.
7. En domicilio, `fijar_envio_ticket` con la zona y el renglón de envío al precio cotizado.
8. `nota_general` = forma de pago ("Efectivo, paga con $500" o "Tarjeta al recibir") + nota del
   cliente.
9. **No aplica ningún pago.** El ticket queda `ABIERTO`, `estado_cocina = 'EN_COCINA'`.
10. Comprueba que `total_mxn` del ticket sea igual a `total_cliente_mxn` del pedido; si no, aborta
    con `TOTAL_NO_COINCIDE`.
11. Deja el pedido en `ACEPTADO` con su `ticket_id`.

### 5.3 Configuración

- `configuracion_tenant.modulo_tienda_activo boolean DEFAULT false`: el interruptor del dueño, igual
  que `modulo_delivery_activo`.
- `tienda_config` (PK `tenant_id`): `slug citext UNIQUE` (minúsculas, dígitos y guiones; con lista
  de nombres reservados), `color`, `descripcion`, `aceptacion` (`MANUAL` de fábrica, o `AUTO`),
  `minutos_aceptacion int DEFAULT 5 CHECK (BETWEEN 3 AND 15)`, `pago_efectivo`, `pago_tarjeta` (al
  menos uno).
- `tienda_sucursales` (PK `sucursal_id`): `tenant_id`, `participa`, `recoger`, `domicilio`,
  `horario jsonb`, `pausa_hasta timestamptz`.
  - `horario`: un rango por día de la semana, `{"1": ["13:00","22:00"], …}`; día ausente = cerrado.
    Un cierre menor que la apertura significa que cierra pasada la medianoche. Se evalúa en la hora
    de México, como el resto del sistema; nunca con `CURRENT_DATE`.

Ambas con RLS por tenant: lee cualquier empleado del negocio, escriben dueño y administradores.

### 5.4 Cuentas de clientes

Tablas cerradas a todo rol salvo `service_role` (se registran en `_rls_exentas`, que la prueba
`0002_rls_cobertura` exige):

- `tienda_cuentas`: `tenant_id`, `email citext`, **`UNIQUE (tenant_id, email)`**, `password_hash`,
  `nombre`, `apellido`, `telefono`, `fecha_nacimiento` (opcional), `acepto_privacidad_at`,
  `intentos_fallidos`, `bloqueada_hasta`, `deleted_at`.
- `tienda_sesiones`: `token_hash` (PK), `cuenta_id`, `tenant_id`, `expira_at`.
- `tienda_recuperaciones`: `token_hash` (PK), `cuenta_id`, `expira_at`, `usada_at`.
- `tienda_direcciones`: `cuenta_id`, `tenant_id`, los campos de dirección y `zona_envio_id`.

No se usa Supabase Auth para estos clientes: ahí el correo es único en toda la plataforma (el choque
que ya se conoce con los empleados) y pondría al público en el mismo rol `authenticated` que al
personal.

### 5.5 Señal de "caja lista"

- `cajas.espejo_turno_abierto boolean`: lo sella `delivery-espejo` junto con `espejo_apps_at`, con
  el dato que la caja manda en cada sondeo.
- `sucursal_recibe_pedidos(p_sucursal uuid) RETURNS boolean`: hay una caja activa con
  `espejo_apps_at` de hace menos de 90 s y `espejo_turno_abierto`.
- El servidor ya dicta el ritmo del sondeo (`_shared/delivery/espejo.ts`). Con el módulo de tienda
  efectivo y la sucursal participando, el reposo es de 30 s, no de 300 s, para que la ventana de
  90 s se cumpla.
- El POS web, que no tiene agente, sella lo mismo cada 30 s con una acción nueva `presente` de
  `delivery-accion`, usando la caja de su turno.

### 5.6 Complemento y plan

Molde de la migración 0113, sin mecanismo nuevo:

- Fila en `addons`: `TIENDA`, $100.
- `planes.features_incluidos.tienda_incluida = true` en `NEGOCIO` y `CADENA`.
- `('TIENDA','tienda_incluida')` se suma a la lista de `_sincronizar_addons_del_plan` y a
  `ADDONS_DEL_PLAN` (`apps/platform/app/lib/cambio-plan.ts`). La migración otorga el complemento a
  los negocios que ya están en esos planes.
- `modulos_efectivos`: `tienda` = complemento `TIENDA` activo **y** `modulo_tienda_activo`.
- `tienda` entra en `packages/db/src/modulos.ts` y en las directivas del latido, que es de donde la
  caja instalada lee los módulos (allí `tenant_addons` no baja).

### 5.7 Fotos

Bucket público `productos`, copia del bucket `anuncios` (mig. 0150): 1 MB, JPG/PNG/WebP, carpeta por
`tenant_id`, escritura solo para administradores del negocio. La ruta se guarda en
`productos.imagen_url`, columna que ya existe y hoy nadie usa.

## 6. La tienda (`apps/tienda`)

Rutas: `/[negocio]` (menú y carrito), `/[negocio]/pedido/[codigo]` (seguimiento),
`/[negocio]/cuenta`, `/[negocio]/privacidad`. El diseño sigue `docs/diseno/nucleo.md` y estrena su
propio documento `docs/diseno/tienda.md`; el color principal es el del negocio.

| Pantalla | Contenido |
|---|---|
| Menú | Logo, nombre, abierto o cerrado con su horario, selector de sucursal si hay más de una, recoger o domicilio. Categorías y productos con foto, precio y agotado |
| Producto | Modificadores y combos con las reglas de la caja, cantidad, nota |
| Carrito | Renglones, subtotal, envío, total. Pago al recibir: efectivo con "¿con cuánto pagas?", o tarjeta |
| Tus datos | Entrar, registrarse o invitado. En domicilio, dirección y zona |
| Seguimiento | Estado (sondeo cada 10 s; el proyecto no usa Realtime), resumen, llamar o WhatsApp al restaurante |
| Mi cuenta | Datos, direcciones, historial con "pedir de nuevo", cerrar sesión, eliminar cuenta |

- El carrito vive en `localStorage`; el servidor lo vuelve a cotizar antes de aceptar el pedido.
- Con la tienda cerrada, en pausa o sin caja lista, el menú se ve completo y el botón de pedir se
  cambia por el aviso y la hora de apertura.
- El menú se arma con la regla que ya existe en `_shared/delivery/menu-uber.ts`
  (`aplicarSucursalCarta`), extraída para compartirla; no se escribe una cuarta copia.

**Invitado:** nombre, teléfono, correo opcional y dirección si aplica. Recibe el enlace de
seguimiento. No guarda nada.

**Cuenta:** registro dentro del flujo de compra, sin confirmar correo antes de pedir. La cuenta
**solo ve lo que ella misma creó** (sus direcciones y sus pedidos en línea). No ve el historial ni
el saldo de lealtad que la caja tenga para ese teléfono: cualquiera puede escribir un teléfono
ajeno. Eso se abre en la tercera entrega, con el teléfono verificado.

## 7. Edge Function `tienda`

Un solo punto de entrada con `accion`, como `autofacturar`. El negocio se resuelve siempre a partir
del `slug`; ninguna acción acepta un `tenant_id` del cliente.

| Acción | Qué hace |
|---|---|
| `negocio` | Datos públicos, sucursales participantes y si cada una recibe pedidos |
| `menu` | Carta de una sucursal: categorías, productos, modificadores, combos, fotos, agotados |
| `cotizar` | Valida un carrito y devuelve renglones, envío y total |
| `pedir` | Cotiza de nuevo, inserta el pedido, manda el correo, devuelve el código de seguimiento |
| `seguimiento` | Estado y resumen de un pedido por su código |
| `registrar`, `entrar`, `salir` | Cuenta y sesión |
| `recuperar_pedir`, `recuperar_aplicar` | Enlace de recuperación y cambio de contraseña |
| `cuenta`, `direcciones`, `mis_pedidos`, `eliminar_cuenta` | "Mi cuenta"; exigen sesión |

**Una sucursal recibe pedidos** cuando se cumple todo: complemento y módulo efectivos, `participa`,
el modo pedido está habilitado, la hora cae dentro del horario, `pausa_hasta` ya pasó y
`sucursal_recibe_pedidos` es verdadero.

**`pedir` valida en el servidor:** que la sucursal reciba pedidos; que cada producto se venda ahí y
no esté agotado (`motivo_no_disponible_en_sucursal`); precios con `precio_producto_en_sucursal`;
mínimos y máximos de modificadores y combos; que la zona sea de la sucursal y esté activa; que la
forma de pago esté habilitada; que el teléfono no sea de un cliente `BLOQUEADO`. Entradas con Zod y
tamaños acotados. El dinero nunca en `float`.

**Estado en negocios sin caja instalada.** Con `gestion = 'NUBE'` el ticket vive en la nube, así que
`seguimiento` deriva el estado del propio ticket al leerlo, con la misma regla de la sección 8.

**Correos**, con `_shared/correo.ts`: confirmación con enlace de seguimiento, recuperación de
contraseña y bienvenida.

## 8. Caja y POS web

**Pantalla.** "Pedidos de apps" pasa a llamarse **"Pedidos en línea"**. Cada tarjeta lleva su
origen (Tienda, Uber) y, en los de la tienda: recoger o domicilio, cliente y teléfono, dirección y
zona, productos, total y forma de pago. Se muestra si el módulo de apps **o** el de tienda está
activo.

**Timbre.** Hoy suena una vez por pedido nuevo (`home-pos.tsx:1484`). Pasa a sonar al llegar y a
**repetirse cada 20 s mientras exista algún pedido `RECIBIDO`**, desde cualquier pantalla. Vale
para todos los canales.

**Aceptar y rechazar** van por `delivery-accion`, que para `canal = 'TIENDA'` no llama a Uber:

- `aceptar`: en gestión NUBE llama a `crear_ticket_desde_tienda`; en ESCRITORIO el ticket ya lo creó
  la caja y solo transiciona.
- `rechazar`: con motivo (agotado, saturado, cerrado, otro).
- `estado`: acción nueva con la que la caja reporta `LISTO`, `ENTREGADO` o `CANCELADO`.
- `tienda_pausar` y `tienda_reanudar`: para canal Tienda escriben `tienda_sucursales.pausa_hasta`
  (30 min, 1 h, hasta reabrir).
- `presente`: la señal de caja lista del POS web.

**Agente de la caja** (`desktop/src/delivery-espejo*.mjs`):

- Sondea si `delivery_apps` **o** `tienda` está activo, y manda si tiene turno abierto.
- Espeja también los pedidos de canal Tienda con sus columnas nuevas.
- Acepta solo cuando `tienda_config.aceptacion = 'AUTO'` (el sondeo trae ese dato), hay turno
  abierto y los productos existen; si no, espera al cajero.
- Crea el ticket local con `crear_ticket_desde_tienda`, después de reclamar el pedido como hoy.
- En cada ciclo compara cada pedido vivo de la tienda con su ticket local y reporta el estado que
  corresponde. La regla, de arriba hacia abajo:

| Ticket local | Estado a reportar |
|---|---|
| `CANCELADO` | `CANCELADO` |
| `PAGADO` o `FACTURADO` | `ENTREGADO` |
| `ticket_impreso_at` con valor, o existe su `delivery_asignaciones` | `LISTO` |
| cualquier otro | sin cambio |

- Mientras haya pedidos vivos de la tienda el ritmo es de 10 s. Sin internet los avisos esperan; el
  pedido se atiende igual.
- El POS no gana botones de estado: el cajero imprime, asigna y cobra como siempre.

**Comandas.** Las imprime el POS, no el agente (`imprimirComandaCocina` en `home-pos.tsx:894`, que
ya reparte por área de impresión). Una sola regla cubre la aceptación manual y la automática: en el
sondeo que ya corre desde cualquier pantalla, **todo pedido de la tienda aceptado, cuyo ticket es de
esta caja y tiene `comanda_impresa_at` vacío, manda sus comandas**. `imprimir_comanda` sella esa
columna, así que no se repite. Los pedidos de Uber no cambian en esta entrega.

**Cancelación por tiempo.** El cron `delivery-expirados` ya cubre la tabla. El aviso push deja de
decir "Uber Eats" fijo y nombra el canal.

**Dos cajas en la sucursal.** La protección existente (`delivery_reclamar_pedido`) decide cuál se
queda el pedido.

## 9. Admin

Apartado **"Tienda en línea"** en el menú principal (`apps/admin/app/(panel)/tienda/`), visible
para dueño y administradores.

- Sin el complemento: invitación a contratarlo, como hoy reparto y lealtad.
- Con él: interruptor, dirección, apariencia (logo existente, color, descripción), aceptación y
  minutos, formas de pago, y por sucursal: participa, recoger, domicilio, horario.
- Compartir: enlace, QR descargable y "ver mi tienda".
- Cambiar la dirección avisa que los QR impresos dejan de servir.
- Lista de revisión al encender. **Bloquea:** sucursal sin horario o sin teléfono, domicilio sin
  zonas de envío. **Advierte:** productos sin foto o sin descripción.

La foto se sube desde la ficha del producto en el catálogo.

## 10. Seguridad

- **Una puerta.** Ninguna tabla ni RPC nueva para `anon`. `apps/tienda` no tiene llave de servicio.
- **Aislamiento.** El negocio sale del `slug` en el servidor; sesiones, cuentas y pedidos llevan
  `tenant_id` y toda consulta filtra por él.
- **Contraseñas.** `scrypt` de `node:crypto` con sal por cuenta y comparación de tiempo constante.
  Mínimo 8 caracteres.
- **Sesión.** Token aleatorio en cookie `HttpOnly`, `Secure`, `SameSite=Lax`, 30 días; en la base
  solo su SHA-256. Cambiar la contraseña cierra las demás sesiones.
- **Recuperación.** Token de un solo uso, 30 minutos, guardado como huella.
- **Sin enumeración.** Registro y recuperación responden igual exista o no el correo.
- **Seguimiento.** Código aleatorio de 128 bits en el enlace; nunca el folio.
- **Límites** con `consumir_cupo` (mig. 0136), por IP, por cuenta o teléfono y por negocio:

| Acción | Tope |
|---|---|
| `pedir` | 5 por hora por IP; 3 pedidos vivos por teléfono; 60 por hora por negocio |
| `entrar` | 10 cada 10 min por IP; 5 fallos seguidos bloquean la cuenta 15 min |
| `registrar` | 5 por hora por IP |
| `recuperar_pedir` | 3 por hora por correo y por IP |
| Lecturas | 120 cada 10 min por IP |

- **Cierre ante falla.** Si el control de cupos no responde, las acciones que escriben se niegan (al
  revés que la autofactura, que deja pasar).
- **Antirobot.** Turnstile, ya usado en el registro de negocios, en `pedir` y `registrar`. Se añade
  `pedidos.vimpos.com.mx` a sus dominios.
- **Registros.** Nunca contraseñas, tokens ni códigos de seguimiento.
- **Datos personales.** Los pedidos se anonimizan a los 30 días con el proceso existente.
  "Eliminar cuenta" borra sesiones y direcciones y vacía los datos de la cuenta.
- **Tarjetas.** No se toca ningún dato de tarjeta en esta entrega.

## 11. Pruebas

- pgTAP: cobertura de RLS con las tablas nuevas; cruce entre negocios en `tienda_config` y
  `tienda_sucursales`.
- Smoke SQL de `crear_ticket_desde_tienda`: total = productos + envío; sin pagos; cliente encontrado
  y cliente creado; idempotencia; `SIN_TURNO_ABIERTO`; `CLIENTE_BLOQUEADO`; recoger y domicilio.
- Smoke SQL de `sucursal_recibe_pedidos` y del horario, incluido el cierre pasada la medianoche.
- Función `tienda`: precio alterado desde el cliente, producto agotado, tienda cerrada, zona de otra
  sucursal, cupos agotados, sesión de un negocio usada en otro, token de recuperación reusado.
- Agente de la caja: la tabla de estados de la sección 8, como prueba de `planificarEspejo`.
- Regresión de Uber con las pruebas existentes: el canal APP no debe cambiar de comportamiento.
- Recorrido completo en la Caja de Pruebas: pedir, timbre repetido, aceptar, comandas por área,
  imprimir ticket, cobrar, y cada estado en el teléfono. También el camino automático, el rechazo y
  la cancelación por tiempo.
- Revisión de seguridad completa de la función pública y las cuentas antes de la salida.

## 12. Orden de construcción

Siete entregas parciales; cada una se mezcla sola y deja todo funcionando. La tienda queda apagada
para todos hasta la última.

1. **Base.** Migración, complemento y plan, canal Tienda en el núcleo, `crear_ticket_desde_tienda`,
   señal de caja lista. Con sus smokes.
2. **Función `tienda`.** `negocio`, `menu`, `cotizar`, `pedir`, `seguimiento` y los correos.
3. **Admin.** Apartado "Tienda en línea" y fotos de productos.
4. **Caja y POS.** Pantalla, timbre, aceptar con comandas, reporte de estados, pausa.
5. **Tienda para invitados.** `apps/tienda` con menú, carrito, pedido y seguimiento. Primer
   recorrido de punta a punta.
6. **Cuentas.** Registro, entrada, recuperación y "Mi cuenta".
7. **Salida.** Aviso de privacidad de la tienda, sección nueva en los términos del servicio,
   revisión de seguridad, prueba con Knock-Out, instalador 0.8.0 en martes y ADR.

## 13. Despliegue y documentos

- Proyecto Vercel nuevo `vim-tienda` con dominio `pedidos.vimpos.com.mx`; variables
  `VIM_TIENDA_SECRET` y la URL de funciones.
- Secreto `VIM_TIENDA_SECRET` en Supabase; función `tienda` con `verify_jwt = false` en
  `config.toml`, desplegada **antes** del merge de la entrega que la usa.
- Instalador de la caja 0.8.0 (función nueva), con la lista "Antes de empaquetar" del RUNBOOK.
- ADR nuevo en `docs/decisiones/` (siguiente número libre): la tienda es un canal del núcleo de
  pedidos y sus clientes no viven en Supabase Auth.
- Avisos legales: el restaurante es el responsable de los datos de sus clientes y VIM los trata por
  encargo.

## 14. Riesgos

- **Tocar el núcleo de Uber.** Ningún cliente real lo usa hoy; lo cubren sus pruebas y el CHECK por
  canal mantiene intactas las filas existentes.
- **Pedidos falsos con pago al recibir.** Aceptación manual de fábrica, antirobot, cupos y bloqueo
  de clientes. El teléfono sin verificar es un límite conocido de esta entrega.
- **Señal de caja lista.** Depende del sondeo; una caja con internet inestable hará que la tienda
  abra y cierre. La ventana de 90 s frente a un sondeo de 30 s tolera dos fallos seguidos.
- **Cuenta obligatoria descartada, invitado permitido.** El invitado no deja rastro reutilizable; la
  unión con el cliente de la caja es solo por teléfono.
