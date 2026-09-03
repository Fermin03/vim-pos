# Preguntas abiertas y siguientes pasos

## A. Trámites que solo Fermín puede iniciar (tardan semanas, conviene arrancarlos ya)

### Uber Eats (el más rápido para empezar)
> **Hecho el 2 sep 2026:** cuenta creada, app `wx152HzVuqgaoXH6V4GXskfZrAUwKxMq`, API Licensing
> Agreement firmado y sandbox concedido. Ver `uber-eats/contrato/README.md` para las obligaciones.
> Sigue pendiente el punto 2 (tiendas de prueba).
> **3 sep 2026:** Uber contestó (caso 59818999, `eats-partner-tech-support@uber.com`) pidiendo los
> datos de las tiendas de prueba. Respuesta: 2 tiendas en Av. Universidad 101 y 301, León;
> dueños `uber-test@vimpos.com.mx` (tienda 1, **integrada por Uber** con el client_id) y
> `uber-test2@vimpos.com.mx` (tienda 2, **sin integrar**: se conecta desde el admin para probar el
> OAuth). Son un buzón de Hostinger (`uber-test@`) y su alias (`uber-test2@`); ambos caen al mismo buzón. Se pidió también cuenta de consumidor de prueba.
> Contraseñas de esas cuentas de Uber: en el gestor de contraseñas, nunca aquí.
> **Respuesta enviada el 3 sep 2026 (mediodía).** Siguiente: esperar que Uber cree las cuentas y las
> tiendas; los códigos llegan a `uber-test@`. Luego: runbook §3 (conectar tienda 2 desde el admin) y §4.
1. Crear cuenta en <https://developer.uber.com/dashboard> con un correo de VIM (no personal), crear
   aplicación tipo **Testing** de la suite *Eats Marketplace* y guardar `client_id`/`client_secret`
   de sandbox en un gestor de contraseñas (no en el repo).
2. Pedir tiendas de prueba por <http://t.uber.com/integration-support> ("POS integrator, sandbox
   test stores, Mexico").
3. Preguntar en el mismo formulario por el proceso de NDA + API licensing agreement para México y
   pedir un *partner manager*. Para producción hará falta **otra cuenta Uber** (la de producción).

### DiDi Food
> **2 sep 2026, 22:40:** Qualification enviada desde el portal (cuenta `integraciones@vimpos.com.mx`,
> RFC como Tax ID, perfil en inglés del doc 07). **22:50:** correo A3 enviado a
> `globalsupportapi@didiglobal.com`. Pendiente: respuesta (NDA / aprobación / kickoff).
1. Registrarse en <https://developer.didi-food.com/en-US/openapi> y completar
   **Qualifications Management** con los datos de VIM (RFC, acta constitutiva, poder notarial e
   identificación del representante a la mano por si piden el *Technology Integration Agreement*).
2. Escribir a `globalsupportapi@didiglobal.com` avisando del perfil enviado y presentando VIM como
   POS integrator en México (León, GTO).
3. Cuando aprueben: crear app `MX_T_VIMPOS`, tienda de prueba, pedir cuenta de consumidor de prueba
   (formulario del portal) y pedir el kickoff / grupo de WhatsApp.

### Rappi
> **2 sep 2026:** en espera de un cliente que use Rappi. Knock-Out Burger no está en Rappi, así que
> no hay ejecutivo de cuenta que abra la puerta; forzarlo (alta ficticia) no. Cuando un cliente o
> prospecto esté en Rappi, se manda el texto B1 del doc 07 por su ejecutivo. Plan B: LinkedIn.
1. No hay formulario público: hay que conseguir el contacto (TAM / equipo de integraciones). Vías:
   el ejecutivo de cuenta de Knock-Out Burger en Rappi (el restaurante puede pedir que su POS se
   integre), o el canal de aliados en Portal Partners.
2. Pedir: credenciales de desarrollo, creación de la `Integration` y `clientId`, registro de
   `redirect_uri` para self-onboarding, lista de IPs de webhooks, y confirmación de si los montos en
   México vienen en pesos o centavos.

### Comunes
- Definir la **URL pública estable de webhooks** (¿`api.vimpos.com.mx`? ¿`vimpos.mx` cuando se
  registre?). Cambiarla después obliga a reconfigurar las tres apps.
- Definir el correo/teléfono de contacto técnico que las apps usarán para incidentes (Uber avisa
  ahí cuando pausa tiendas por caídas).

## B. Decisiones de producto que hay que tomar antes de escribir el ADR

1. **Orden de las apps.** Propuesta: construir contra Uber sandbox, luego DiDi, luego Rappi. Pero si
   Knock-Out Burger solo vende por Rappi, quizá conviene presionar el trámite de Rappi desde ya.
2. **¿Add-on o incluido en el paquete?** Ya existe `tenant_addons` y precios por paquete
   (`decisiones/0002`). Las apps cobran comisiones altas; un add-on mensual por sucursal es
   razonable, pero es una decisión comercial.
3. **Auto-aceptar por defecto.** Recomendado sí (Rappi da 4 minutos). ¿Qué tiempo de preparación por
   defecto? ¿Se permite que el cajero lo cambie por pedido?
4. **Precio en la app.** ¿Un % de incremento por app (como pide la spec Dark Kitchen) o listas de
   precios por canal? El % es más simple y cubre el 90 % de los casos.
5. **Qué pasa con un pedido que trae un producto no mapeado** (el cliente lo dio de alta en la app y
   no en VIM): ¿se rechaza, se acepta con un ítem genérico "Producto de app" al precio de la app, o
   se deja al cajero decidir dentro de la ventana? Propuesta: aceptar con ítem genérico y alertar al
   admin; perder el pedido es peor.
6. **Retención de PII** del cliente final: ¿cuántos días se conserva nombre/teléfono/dirección en
   `delivery_pedidos`? Propuesta: 30 días, luego se anonimiza.
7. **Marcas virtuales.** ¿La conexión es por sucursal o por sucursal × marca? La spec Dark Kitchen
   pide marca × canal. Propuesta: `delivery_conexiones.marca_virtual_id` opcional desde el inicio,
   nulo para restaurantes normales.
8. **Efectivo.** ¿Se acepta efectivo en apps para el piloto? Complica el cuadre de caja (el repartidor
   paga en tienda en DiDi; el cliente paga al repartidor propio en Rappi marketplace).
9. **CFDI de ventas por app.** Confirmar con el contador: la venta es del restaurante (factura global
   o autofactura con el folio), la comisión de la app es un gasto con su propio CFDI.

## C. Dudas técnicas que se resuelven en sandbox

- Rappi: unidad monetaria en MX; comportamiento exacto de `PING` cuando la respuesta tarda; si el
  webhook `NEW_ORDER` trae `customer` en `delivery` (no marketplace); tiempo real de aprobación de
  menú.
- DiDi: si `orderNew` llega con todos los `sub_item_list` anidados para grupos compartidos; cómo
  viene `app_content_id` cuando el mismo ítem está en dos grupos; latencia real del `taskID` de menú.
- Uber: si con `webhooks_version 1.0.0` sigue llegando `orders.cancel` o solo `orders.failure`;
  si `update-store-status` funciona con la estrategia por defecto de una tienda nueva o hay que
  pedir `external`; formato exacto de `service_availability` para 24 h.
- Los tres: qué llega cuando el cliente edita el pedido después de aceptar (Uber
  `orders.customer_order_edit`, DiDi `orderPartialCancel`), y cómo reflejarlo en el ticket pagado.

## D. Siguiente sesión (propuesta)

1. Fermín decide B.1–B.4 y arranca los trámites de A (al menos crear la cuenta de Uber Developer y
   registrar el perfil en DiDi).
2. Con eso, la siguiente sesión de código: ADR `00NN-integracion-apps-de-delivery.md`, migración con
   las cuatro tablas y RLS, `delivery-webhook-uber` + adaptador Uber + panel "Pedidos de apps" contra
   el sandbox de Uber, con tests de RLS y de normalización usando los payloads guardados en
   `uber-eats/openapi/order-fulfillment-api.openapi.json`.
