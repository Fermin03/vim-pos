# Tienda en línea — reporte final de construcción

**Para:** Fermín · **Fecha:** 9 de octubre de 2026 · **Hecho por:** Claude, en automático, con tu mandato del 8 de octubre («sigue con las demás entregas, toma las decisiones por mí y entrégame un reporte al final»).

## En una frase

Las siete entregas de la tienda en línea están construidas, revisadas y mezcladas. **Nada está encendido para clientes:** la tienda no está publicada en internet, el complemento no está activado ni concedido a ningún negocio, y el instalador de la caja no se publicó. Encenderla es una lista corta de pasos tuyos: [`tienda-encendido.md`](tienda-encendido.md).

## Qué quedó construido

| # | Entrega | Qué es | PR |
|---|---|---|---|
| 1 | La base | Los pedidos de la tienda como un canal más de los pedidos en línea; tablas de configuración y de cuentas | #139 |
| 2 | La función pública | La puerta por la que la tienda habla con el sistema: negocio, menú, cotizar, pedir, seguimiento | #140 |
| 3 | El admin | Apartado «Tienda en línea»: datos, dirección, color, logo, sucursales, horario, formas de pago, fotos de productos | #142 |
| 4 | La caja y el POS | «Pedidos en línea»: tarjeta del pedido, timbre que se repite, aceptar y rechazar, comandas automáticas, pausa, estados para el cliente | #143 |
| 5 | La tienda pública | `apps/tienda`: menú, producto, carrito, tus datos, envío y seguimiento en vivo | #144 |
| 6 | Cuentas de clientes | Registro, entrada, recuperar contraseña, «Mi cuenta», direcciones, mis pedidos, pedir de nuevo, eliminar cuenta | #145 |
| 7 | La salida | Encendido empaquetado, pedido sin duplicados, caducidad, retención, topes, admin y panel listos, documentos | #146 |

**En producción hoy:** las migraciones 0161 a 0167 y las funciones `tienda`, `delivery-accion` y `delivery-espejo`. El admin, el POS web y el panel ya llevan el código nuevo.

## Qué ve hoy cada quien

- **Un comensal:** nada. La tienda no tiene dirección en internet.
- **Un dueño, en su admin:** la entrada «Tienda en línea», con la invitación «Estamos por lanzarla. Escríbenos y te avisamos en cuanto esté lista.»
- **Un cajero en el POS web con Uber:** la pantalla se llama «Pedidos en línea» y el timbre se repite cada 20 segundos mientras haya un pedido por aceptar (antes sonaba una vez).
- **Las cajas instaladas (0.7.0):** sin ningún cambio.

## Lo que queda en tus manos

Todo está detallado, en orden y con cómo comprobar y cómo deshacer cada paso, en [`tienda-encendido.md`](tienda-encendido.md). En corto:

1. **Publicar la tienda en internet:** proyecto de Vercel `vim-tienda`, dominio `pedidos.vimpos.com.mx` y su DNS, añadir ese dominio al antirobot (Cloudflare), y los secretos. Guía: [`tienda-publica-salida.md`](tienda-publica-salida.md).
2. **Probar con un negocio interno** usando el POS web.
3. **Aprobar y publicar el instalador 0.8.0 de la caja** (martes). Sin él, ninguna caja instalada recibe pedidos de la tienda. Su lista y su nota: [`instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md).
4. **Knock-Out como primer negocio real**, concedido a mano.
5. **Encender para todos:** un solo paso (`tienda_encender_complemento()`), que yo ejecuto cuando me lo digas. Concede la tienda a los planes que la incluyen; no abre la tienda de nadie.
6. **Revisar los textos legales** (borradores en [`docs/legal/`](../legal/LEEME.md)) con alguien con criterio legal, y publicarlos.
7. **Anunciar:** sitio, novedades y aviso a clientes.

## Decisiones que tomé por ti

Las que más pesan van primero. Cada plan tiene su tabla completa con el porqué (`docs/superpowers/plans/2026-10-09-tienda-en-linea-*.md`).

### Te recomiendo revisar estas cuatro

1. **Registrarse deja deducir si un correo ya es cliente del restaurante.** Tú pediste que al registrarse el cliente entre de una vez, sin confirmar su correo. La consecuencia es que, si alguien intenta registrar el correo de otra persona, la respuesta distinta lo delata. Está acotado (antirobot y topes por red y por correo). La alternativa es pedir confirmar el correo antes de abrir sesión, que añade un paso a la compra. Detalle: [ADR 0032](../decisiones/0032-la-tienda-es-un-canal-y-sus-clientes-no-viven-en-auth.md).
2. **El timbre de Uber ahora también se repite cada 20 segundos.** Lo pediste para la tienda; lo apliqué a todos los pedidos en línea para que la pantalla tenga una sola regla. Ya está en el POS web.
3. **Un pedido aceptado por la caja que en 15 minutos no llega a tener cuenta se cancela solo** (caja apagada o sin turno), y el cliente lo ve como cancelado. Antes se quedaba «en preparación» para siempre.
4. **Mezclé la entrega 6 con el revisor de secretos (GitGuardian) en rojo.** Sus diez avisos eran falsas alarmas, revisadas una por una: nueve eran el nombre de la acción `cuenta_password` en una lista, y uno una contraseña de prueba inválida a propósito. Conviene marcarlos como falsos positivos en su panel.

### La caja y el POS (entrega 4)

- El cajero no tiene botón «Marcar listo» en pedidos de la tienda: el estado sale de imprimir el ticket o asignar repartidor (en camino / listo para recoger), cobrar (entregado) y cancelar.
- Si un pedido no se puede convertir en cuenta por algo que no se arregla reintentando (el total ya no coincide, un producto se agotó o ya no existe, la zona cambió), se cancela solo y la caja le explica al cajero por qué.
- Con aceptación automática y sin caja instalada, quien acepta es el POS web abierto con turno.
- La forma de pago y la nota del cliente se ven en la cuenta y salen en el ticket y en la comanda, solo en pedidos de la tienda.
- Si la comanda automática no sale, la tarjeta lo avisa y trae un botón para imprimirla.
- La pausa ofrece 30 minutos, 1 hora o «hasta que la reanude».
- El aviso al celular del dueño por un pedido vencido dice de dónde era.

### La tienda pública (entrega 5)

- Los precios del menú son los que se cobran, con IVA cuando va aparte. El total siempre es el que calcula el servidor.
- El menú aparece en buscadores; el seguimiento de un pedido no.
- El color del negocio pinta los botones principales, y el texto se pone blanco o negro solo para que siempre se lea.
- «Abre a las…» se calcula con la hora del centro de México.
- La zona de envío la elige el cliente de una lista; no se valida contra la dirección.
- Con una sola sucursal o un solo modo, no se pregunta.
- Sin analítica ni píxeles.

### Cuentas (entrega 6)

- Las contraseñas se guardan cifradas dentro de la base, con el mismo mecanismo que los PIN del POS (el diseño decía otro; este es el ya probado). De 8 caracteres en adelante.
- Cinco contraseñas equivocadas seguidas bloquean la cuenta 15 minutos.
- La sesión dura 30 días y es por restaurante. El enlace para recuperar la contraseña dura 30 minutos y sirve una vez.
- El registro pide nombre, apellido, correo, teléfono y contraseña; la fecha de nacimiento es opcional, en «Mi cuenta».
- Una cuenta ve solo sus direcciones (hasta 5) y los pedidos hechos con su sesión.
- Eliminar la cuenta pide la contraseña y borra cuenta, sesiones y direcciones guardadas. El restaurante conserva al cliente en su propio sistema.
- La cuenta todavía no se liga a los puntos de lealtad; queda lista para hacerlo por el teléfono.

### La salida (entrega 7)

- Mezclar no enciende ni concede nada; el encendido es un paso aparte.
- Al encender, la tienda se concede sin costo a los negocios activos, en prueba o internos cuyo plan la incluye (Negocio, Cadena y los heredados). Esencial la contrata por $100 al mes.
- En el admin, contratar es escribir por WhatsApp, igual que los demás complementos.
- Un reintento de pedido devuelve el mismo pedido: ya no se duplica.
- A los 30 días se borran también las notas del pedido en línea, y la caja hace ese borrado en su copia.
- Topes: 8 pedidos por hora por red y restaurante; 300 intentos de entrada cada 10 minutos por restaurante.
- El POS web no abre la tienda de una sucursal cuya caja instalada sigue en una versión anterior a la 0.8.0.
- Los textos legales son borradores sin publicar. El sitio web y las novedades no se tocaron.

## Lo que no pude verificar

Lo construido tiene pruebas automáticas (al cierre: 84 smokes de la base, 471 de funciones, 489 del escritorio, 297 de la tienda, 674 del POS, 539 del admin, 268 del panel) y pasó por revisión en cada entrega y una auditoría de seguridad al final. Además ejecuté en local el código real de la función `tienda` contra una base de prueba y recorrí la tienda y el POS en el navegador. Aun así, esto **no se ha probado**:

- **Nada contra la tienda publicada**, porque no existe: el antirobot real, los topes reales, los correos reales (confirmación de pedido, bienvenida, recuperar contraseña).
- **Una caja instalada de punta a punta.** El agente de la caja está probado con dobles, no en una caja real con la 0.8.0.
- **La impresión en papel** de comandas y tickets con la nota del pedido.
- **Las funciones `delivery-accion` y `delivery-espejo` contra una base real** (aceptar, rechazar, pausar, «ya lo tengo»): están comprobadas por tipos, pruebas de su lógica y lectura.
- **Subir y quitar fotos y logo de verdad**, y la tienda con fotos.
- **Un teléfono de verdad** (iPhone, Android) y un lector de pantalla.
- **El aviso nuevo del POS** («actualiza la caja de esta sucursal…») en pantalla.

La prueba interna del paso 2 de la lista de encendido cubre casi todo esto.

## Riesgos conocidos que acepté

- **Topes por restaurante:** alguien con muchos pases del antirobot podría dejar a un restaurante sin recibir pedidos o entradas durante una hora. Se vigila con [`tienda-vigilancia.md`](tienda-vigilancia.md).
- **«Caja lista» falseable:** un empleado con sesión podría marcar su propia sucursal como abierta sin turno. Solo afecta a su propio negocio.
- **Direcciones liberadas:** si un negocio cambia la dirección de su tienda, otro puede tomar la anterior, con los QR ya impresos apuntando ahí.
- **Recargar la página tras «no pudimos confirmar tu pedido»** y volver a enviar sí puede duplicar: la protección vive en la página abierta.
- **La nota del pedido queda en la cuenta de la venta** del restaurante (no se borra a los 30 días; eso solo aplica al pedido en línea). El aviso de privacidad lo dice.
- **La contraseña se verifica en la misma base que usan las cajas.** Un ataque de contraseñas la cargaría; por eso el tope por restaurante. Es lo primero a vigilar tras publicar.

## Dónde está cada cosa

- Lista de encendido: [`docs/operacion/tienda-encendido.md`](tienda-encendido.md)
- Publicar en internet: [`docs/operacion/tienda-publica-salida.md`](tienda-publica-salida.md)
- Instalador 0.8.0: [`docs/operacion/instalador-0.8.0-pendiente.md`](instalador-0.8.0-pendiente.md)
- Soporte de la caja: [`docs/operacion/tienda-en-linea-caja.md`](tienda-en-linea-caja.md)
- Qué vigilar: [`docs/operacion/tienda-vigilancia.md`](tienda-vigilancia.md)
- Borradores legales: [`docs/legal/`](../legal/LEEME.md)
- Diseño aprobado: `docs/superpowers/specs/2026-10-08-tienda-en-linea-design.md`
- Planes y decisiones de cada entrega: `docs/superpowers/plans/`
- Registro de la decisión de arquitectura: `docs/decisiones/` (0032)
