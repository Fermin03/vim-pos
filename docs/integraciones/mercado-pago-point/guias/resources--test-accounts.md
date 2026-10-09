<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/test-accounts · capturado 2026-10-08 -->

# Cuentas de prueba

Utiliza cuentas de prueba para asegurar que tu integración soporta todos los flujos y escenarios posibles. Tienen las mismas características que una cuenta real de Mercado Pago, lo que te permite probar el funcionamiento de las integraciones que estás desarrollando.

Las cuentas de prueba **se crean automáticamente** tras la creación de la aplicación. Si prefieres crearlas manualmente, sigue los pasos a continuación. Puedes generar hasta **15 cuentas** de prueba al mismo tiempo y, por ahora, **no es posible eliminarlas**.

Las integraciones con [Checkout Bricks](https://www.mercadopago.com.mx/developers/es/docs/checkout-bricks/overview) no soportan cuentas de prueba para realizar pruebas de integración. Para más información, visita la documentación [Hacer compra de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-bricks/integration-test/test-payment-flow) con Checkout Bricks.

Para realizar las pruebas, debes tener al menos dos cuentas:

-   **Vendedor**: cuenta requerida para **configurar la aplicación y las credenciales**. Esta es tu cuenta de usuario.
-   **Comprador**: cuenta necesaria para **probar el proceso de compra**.
-   **Integrador**: cuenta que se usa en **integraciones del modelo marketplace**.

Además de estas cuentas, también es importante utilizar las **tarjetas de prueba** para probar la integración de pago y simular el proceso de compra, así como el **saldo en la cuenta de Mercado Pago del usuario de prueba**. Te mostramos más detalles a continuación.

![formulario para crear test user](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/test-cross/test-user-es-create-seller-v1.png)

Para crear cuentas y probar el funcionamiento de las integraciones, sigue los siguientes pasos:

1.  En [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/es/docs), navega hasta **[Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app)** y haz clic en la aplicación con la que desees trabajar.
2.  En la página de la aplicación, ve a la sección **Cuentas de prueba** y haz clic en el botón **\+ Crear cuenta de prueba**.
3.  En la pantalla "Crear nueva cuenta", selecciona el **país de operación** de la cuenta. Esta información **no se podrá editar más adelante**, y además, los usuarios Comprador y Vendedor deben ser del mismo país.
4.  Luego, ingresa una descripción para identificar la cuenta. Por ejemplo: "Vendedor - tienda 1".
5.  A continuación, selecciona el tipo de cuenta que deseas crear. Esta puede ser **Vendedor**, **Comprador** o **Integrador**.
6.  En caso de que la cuenta de prueba lo solicite, ingresa un **valor ficticio en dinero** que servirá como referencia para probar tus aplicaciones. Este valor aparecerá como saldo en la cuenta de Mercado Pago del usuario de prueba y se podrá utilizar para simular pagos, al igual que las **tarjetas de prueba**.
7.  Autoriza el uso de tus datos personales de acuerdo con la [Declaración de Privacidad](https://www.mercadopago.com.mx/privacidad) y asegúrate de que tu cuenta utiliza las herramientas de Mercado Pago según los [Términos y Condiciones](https://www.mercadopago.com.mx/developers/es/docs/resources/legal/terms-and-conditions) marcando la casilla de selección.
8.  Haz clic en **Crear cuenta de prueba**.

¡Listo! La cuenta de prueba se ha creado y se mostrará en la tabla con la información a continuación.

![acceder a los usuarios de prueba](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/test-cross/test-user-es-list-full-v1.png)

-   **País**: Lugar de origen de la cuenta seleccionado en tu registro.
-   **User ID**: número de identificación de usuario, que es creado automáticamente.
-   **Usuario**: Nombre de usuario de la cuenta de prueba generado automáticamente. Este es el nombre de usuario que se utiliza para iniciar sesión con el test user.
-   **Contraseña**: Contraseña de acceso a la cuenta del usuario de prueba generada automáticamente. Para generar una nueva contraseña, haz clic en los 3 puntos verticales al final de la línea de la tabla y selecciona la opción **Generar nueva contraseña**.
-   **Código de verificación**: Número de 6 dígitos que debes ingresar en caso de que se solicite verificación por e-mail al iniciar sesión con la cuenta de prueba.

Para editar la **identificación de la cuenta** o **agregar más dinero ficticio** para probar tus aplicaciones, haz clic en los **3 puntos verticales** al final de la línea de la tabla y selecciona la opción **Editar datos**.

## Validar inicio de sesión con cuentas de prueba

Si al iniciar sesión con cuentas de prueba se solicita autenticación por e-mail, ingresa el **código de verificación de 6 dígitos** de tu cuenta de prueba que encontrarás en **[Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) > _Tu aplicación_ > Pruebas > Cuentas de prueba**.

Ten en cuenta que, al realizar este inicio de sesión con una cuenta de prueba, no tendrás acceso a ciertas secciones dentro del Panel del Desarrollador, como las **Credenciales de prueba** o la **Calidad de integración**. Se trata de secciones que no sólo no son necesarias para este tipo de cuentas, sino que también pueden interferir en el uso adecuado y deseado de los mismos.
