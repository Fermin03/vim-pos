<!-- fuente: https://developer.clip.mx/page/preguntas-frecuentes · capturado 2026-10-08 -->

---
updatedAt: 2025-09-29T20:11:13.000Z
agentTools:
  projectIndex: https://developer.clip.mx/llms.txt
---

# Preguntas frecuentes

Aquí encontrarás respuestas a las preguntas más comunes organizadas por tema.

Si no encuentras lo que buscas te recomendamos que también consultes nuestra página de [guías de solución de problemas](https://developer.clip.mx/page/guias-de-solucion) o que nos contactes por alguno de los siguientes medios:

* Activa el botón de **Ayuda** y llena el formulario. No olvides proporcionar un correo electrónico y tus dudas para que podamos responder a la solicitud de manera eficiente.
* Publica tu pregunta en nuestro [Foro](https://developer.clip.mx/discuss). Publicar en el foro puede ayudar a otros desarrolladores que están experimentando el mismo problema.
* Envía un correo electrónico a la dirección *<developers@payclip.com>* o a <soporte-checkout@clip.mx> (sólo para productos de checkout: API de Checkout, Checkout Embebido, plugin de Clip y Checkout Webhook).

<br />

****

<details class="collapsible">
  <summary >API de Checkout</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Puedo almacenar la información de pago de mis clientes?</summary>

<p id="inner-content">No contamos con este servicio, por lo que tus clientes tienen que completar la información de cobro en cada pago que realicen. Sin embargo, estamos trabajando para ofrecerte una solución que esperamos poner a tu disposición pronto. Te invitamos a mantenerte al pendiente de nuestras actualizaciones en el <a href="https://developer.clip.mx/discuss" > foro del portal de desarrolladores </a> </p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Puedo enviar una lista de productos a la pasarela de pagos Checkout?</summary>

<p id="inner-content">Si se puede pero dependerá de tu página. La idea es que tus clientes puedan seleccionar los productos que quieren comprar dentro de tu carrito de compras y al momento de realizar el pago se cobrará el monto total dentro del Checkout de Clip. </p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >API de Checkout Transparente</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué es el cumplimiento de PCI y por qué es necesario utilizar la API de pago transparente?</summary>

<p id="inner-content">El cumplimiento de PCI se refiere al Estándar de seguridad de datos de la industria de tarjetas de pago, que garantiza el manejo seguro de los datos de los titulares de tarjetas durante las transacciones de pago. Es necesario utilizar la API de chekout transparente para proteger la información del cliente y evitar el acceso no autorizado a datos confidenciales. </p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo funciona la API de Card Token y por qué es importante?</summary>

<p id="inner-content">La API de Card Token captura y tokeniza de forma segura la información de la tarjeta proporcionada por los clientes durante el pago. Reemplaza los datos confidenciales de la tarjeta con un token único, lo que reduce el riesgo de violaciones de datos y simplifica el procesamiento de pagos al permitir a los comerciantes almacenar y transmitir tokens en lugar de los detalles reales de la tarjeta.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuáles son las ventajas de utilizar la API de  Checkout Transparente sobre los métodos de pago tradicionales?</summary>

<p id="inner-content">La API de pago transparente ofrece seguridad mejorada, experiencias de pago optimizadas y un mayor control sobre el proceso de pago. Proporciona a los comerciantes la flexibilidad de personalizar el flujo de pago al tiempo que garantiza la protección de los datos de la tarjeta del cliente.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué pasos están involucrados en la integración de la API de Checkout Transparente en nuestros sistemas existentes?</summary>

<p id="inner-content">La integración generalmente implica obtener credenciales de API, implementar puntos finales de API para la tokenización de tarjetas y el procesamiento de pagos.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué métodos de pago son compatibles con la API de Checkout Transparente?</summary>

<p id="inner-content">Puedes consultar los métodos de pago en este [enlace]().</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo se manejan los reembolsos a través de la API de Pago Transparente?</summary>

<p id="inner-content">Puede realizar un reembolso utilizando nuestra API de Reembolsos o en el Clip Dashboard. Para obtener más información, haga clic [aquí]().</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué medidas existen para garantizar la seguridad de los datos de las tarjetas?</summary>

<p id="inner-content">Las medidas de seguridad pueden incluir cifrado de la transmisión de datos, tokenización de la información de la tarjeta, cumplimiento de los estándares de cumplimiento de PCI e implementación de controles de acceso y sistemas de monitoreo sólidos para detectar y prevenir el acceso no autorizado o la actividad fraudulenta.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Existen tarifas adicionales asociadas con el uso de la API de pago transparente?</summary>

<p id="inner-content">Las tarifas pueden variar según el proveedor de pago elegido y las funciones específicas utilizadas. Los comerciantes deben revisar la estructura de precios y los términos de servicio proporcionados por su proveedor de pagos para obtener detalles sobre las tarifas asociadas.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" >¿Qué nivel de personalización está disponible para la experiencia de pago con la API de pago transparente?</summary>

<p id="inner-content">Los comerciantes normalmente pueden personalizar la experiencia de pago incorporando elementos de marca, configurando opciones de pago e integrando funciones adicionales como ofertas promocionales, opciones de envío y herramientas de gestión de pedidos.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo podemos solucionar problemas o abordar desafíos técnicos al utilizar la API de pago transparente?</summary>

<p id="inner-content">Brindamos soporte 24 horas al día, 7 días a la semana durante los 365 días. Puedes comunicarte con nosotros enviando un correo electrónico a [support-checkout@clip.mx]().</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué tarjetas puedo aceptar con Checkout Clip?</summary>

<p id="inner-content">Checkout Clip acepta las tarjetas de crédito y débito como: American Express, Visa, MasterCard, Carnet, Si Vale y entre otras.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es el monto máximo para estas ventas?</summary>

<p id="inner-content">Los nuevos comercios cuentan con un monto máximo inicial de $5,000 MXN por transacción, mientras que hay comercios que cuentan con un límite de monto máximo de hasta $200,000 MXN. Si requieres tramitar el incremento del monto, procede a validar tu identidad aquí.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" >¿Puedo hacer pruebas con la API de Checkout Transparente en modo prueba Sandbox?</summary>

<p id="inner-content">No tenemos sandbox ni tarjetas de prueba, pero puedes realizar pruebas haciendo transacciones por montos pequeños. Por ejemplo, en México algunos bancos aceptan transacciones por MXN$1 o incluso hasta por MXN$0.01 las cuáles tienen comisiones prácticamente nulas. La ventaja de esta opción es la seguridad de que estarás probando directamente en el ambiente productivo de Clip, lo que significa que si la transacción es exitosa, estás listo para cobrar con tarjeta a tus clientes.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo puedo obtener un reporte detallado de las transacciones e intentos de pagos de mis clientes?</summary>

<p id="inner-content">Puedes consultar tus transacciones y descargarla en formato Excel o CSV accediendo al Dashboard de Clip. Si requieres contar con un reporte más detallado de tus transacciones e intentos de pagos, contáctanos enviando un correo a [support-checkout@clip.mx]().</p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >SDK de Checkout Transparente</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es el propósito del SDK de Pago Transparente? </summary>

<p id="inner-content">El SDK de Transparent Checkout te permite recibir pagos en línea de forma sencilla en tu sitio web proporcionandouna experiencia de pago segura para el tarjetahabiente.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo el SDK o JavaScript general el token con la información de la tarjeta? </summary>

<p id="inner-content">El  SDK captura y tokeniza de forma segura los datos de la tarjeta ingresados por el comprador durante el proceso de pago. Luego devuelve un token ID único, que representa la información cifrada de la tarjeta.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es la importancia de tokenizar la información de la tarjeta? </summary>

<p id="inner-content">La tokenización de la información de la tarjeta mejora la seguridad al reemplazar los datos confidenciales de la tarjeta con un identificador único (el token ID de la tarjeta). Esto ayuda a proteger los datos de los titulares de tarjetas y reduce el riesgo de acceso no autorizado o uso indebido.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo se realiza el cargo por un monto específico al token ID de la tarjeta desde la API de pagos? </summary>

<p id="inner-content">El servicio API Payments o API de pagos permite a los comerciantes cargar una cantidad específica al token ID de la tarjeta asociado con una transacción en particular. Este proceso transmite de forma segura la solicitud de pago a la pasarela de pago o al procesador para su autorización y liquidación.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿El SDK de Checkout Transparente es compatible con todo tipo de sitios web?</summary>

<p id="inner-content">El SDK de Checkout Transparente se puede integrar en la mayoría de los sitios web, siempre y cuándo  acepten JavaScript y tengan la infraestructura necesaria para manejar solicitudes y respuestas de API.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuáles son los pasos a seguir para integrar el SDK de Transparent Checkout en tu sitio web? </summary>

<p id="inner-content">La integración generalmente implica incorporar el SDK o JavaScript en el checkout de tu sitio web e implementar los endpoints correspondientes de la API para manejar la tokenización y el procesamiento de pagos.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Se puede personalizar el SDK de Checkout Transparente para que coincida con la marca y el diseño de tu sitio web?</summary>

<p id="inner-content">Sí, el SDK se puede personalizar para alinearlo con tus preferencias de diseño y marca, incorporando colores, logotipos y fuentes personalizados para una experiencia de pago perfectamente adaptada a tus necesidades.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué medidas de seguridad existen para proteger los datos tanto de los tarjetahabientes  como de los comerciantes durante las transacciones? </summary>

<p id="inner-content">Las medidas de seguridad incluyen cifrado de la transmisión de datos, cumplimiento de estándares de la industria como PCI DSS y la implementación de mecanismos seguros de autenticación para evitar el acceso no autorizado.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo se manejan los reembolsos a través de la API de Checkout Transparente?</summary>

<p id="inner-content">Se pueden realizar reembolsos utilizando nuestra API Reembolsos o directamente en el panel de control de Clip (Dashboard). Para obtener más información, haga clic aquí.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Tienen algún canal de soporte técnico disponible para reportar problemas con el SDK de Checkout Transparente?</summary>

<p id="inner-content">Sí, puedes enviar un correo electrónico a [support-checkout@clip.mx]().</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué tarjetas puedo aceptar con Checkout Clip?</summary>

<p id="inner-content">Checkout Clip acepta las tarjetas de crédito y débito como: American Express, Visa, MasterCard, Carnet, Si Vale y entre otras.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es el monto máximo para estas ventas?</summary>

<p id="inner-content">Los nuevos comercios cuentan con un monto máximo inicial de $5,000 MXN por transacción, mientras que hay comercios que cuentan con un límite de monto máximo de hasta $200,000 MXN. Si requieres tramitar el incremento del monto, procede a validar tu identidad aquí.</p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >API de Depósitos</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es el rango de fechas que puedo consultar con la API de Depósitos?</summary>

<p id="inner-content">Se pueden consultar los depósitos recibidos en un rango de 1 a 90 días de antigüedad a partir de la fecha de consulta.</p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >API de Punto de Venta</summary>

<details class="collapsible">
  <summary id="collapsible-content" >¿Puedo conectar mi lector Clip directamente a mi sistema de punto de venta?</summary>

<p id="inner-content">No, es necesario tener un dispositivo con la aplicación móvil de Clip para recibir las peticiones de pago generadas desde la API de Punto de Venta.</p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >API de Transacciones</summary>

<details class="collapsible">
  <summary id="collapsible-content" >¿Puedo obtener detalles de los productos vendidos? ¿Puedo obtener la cantidad total por tipo de producto vendido?</summary>

<p id="inner-content">Nuestra API de transacciones no guarda información de los productos que vendiste y, por lo tanto, no contamos con la función de generar reportes por tipo de producto.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cuál es el rango de fechas que puedo consultar con la API de Transacciones?</summary>

<p id="inner-content">Puedes consultar transacciones dentro de un rango de fechas de 1 a 30 días y de hasta un año de antigüedad.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" >¿Qué filtros de búsqueda puedo aplicar para buscar transacciones?</summary>

<p id="inner-content">Además de los rangos de fecha, puedes filtrar por estado de la transacción y por los últimos cuatro dígitos de la tarjeta utilizada para realizar el pago.</p>

</details>

</details>

<br />

****

<details class="collapsible">
  <summary >API de Suscripciones</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo podemos solucionar problemas o abordar desafíos técnicos al utilizar la API de suscripciones? </summary>

<p id="inner-content">Brindamos soporte 24 horas al día, 7 días a la semana durante los 365 días. Puedes comunicarte con nosotros enviando un correo electrónico a [support-checkout@clip.mx]().</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Qué tarjetas puedo aceptar con Checkout Clip?</summary>

<p id="inner-content">Checkout Clip acepta las tarjetas de crédito y débito como: American Express, Visa, MasterCard, Carnet, Si Vale y entre otras.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Puedo hacer pruebas con la API de suscripciones en modo Sandbox? </summary>

<p id="inner-content">No tenemos sandbox ni tarjetas de prueba, pero puedes realizar pruebas haciendo transacciones por montos pequeños. Por ejemplo, en México algunos bancos aceptan planes por MXN$1 o incluso hasta por MXN$0.01 los cuáles tienen comisiones prácticamente nulas. La ventaja de esta opción es la seguridad de que estarás probando directamente en el ambiente productivo de Clip, lo que significa que si la transacción es exitosa, estás listo para cobrar con tarjeta a tus clientes.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo puedo obtener un reporte detallado de las transacciones e intentos de pagos de mis clientes? </summary>

<p id="inner-content">Puedes consultar tus transacciones y descargarla en formato Excel o CSV accediendo al Dashboard de Clip. Si requieres contar con un reporte más detallado de tus transacciones e intentos de pagos, contáctanos enviando un correo a [support-checkout@clip.mx]().</p>

</details>

</details>

****

<details class="collapsible">
  <summary >Preguntas generales</summary>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Tienen una API de catálogo? </summary>

<p id="inner-content">No contamos con una API de catálogo pero te invitamos a seguir al pendiente de nuestras actualizaciones por si en un futuro la lanzamos. Sin embargo, puedes agregar productos en batch desde el portal, únicamente descarga nuestra plantilla y sigue las instrucciones.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Puedo integrar las APIs con cualquier lenguaje de programación?</summary>

<p id="inner-content">Sí se puede. Únicamente tienes que realizar las peticiones a APIs REST por medio de comandos cURL.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Su documentación está disponible en inglés?</summary>

<p id="inner-content">Estamos trabajando en ello. Algunos de nuestros productos tienen documentación en inglés que podemos compartirte en archivo PDF. Envíanos un correo a developers@payclip.com indicando para qué producto de nuestro portal de desarrolladores solicitas la documentación en inglés y nosotros te confirmaremos si la tenemos disponible.</p>

</details>

<details class="collapsible">
  <summary id="collapsible-content" > ¿Cómo puedo hacer pruebas? ¿Tienen un sandbox o tarjetas de prueba?</summary>

<p id="inner-content"> No tenemos sandbox ni tarjetas de prueba, pero puedes realizar pruebas haciendo transacciones por montos pequeños. Por ejemplo, en México algunos bancos aceptan transacciones por MXN$1 o incluso hasta por MXN$0.01 las cuáles tienen comisiones prácticamente nulas. La ventaja de esta opción es la seguridad de que estarás probando directamente en el ambiente productivo de Clip, lo que significa que si la transacción es exitosa, estás listo para cobrar con tarjeta a tus clientes.</p>

</details>

</details>

<HTMLBlock>{`








`}</HTMLBlock>