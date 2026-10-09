<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/credentials · capturado 2026-10-08 -->

# Credenciales

Las credenciales son claves de acceso únicas con las que identificamos una integración en tu cuenta. Están directamente vinculadas a la **aplicación** que creaste para esa integración, y te permitirán desarrollar tu proyecto contando con las mejores medidas de seguridad de Mercado Pago.

## Tipos de credenciales

Las credenciales están divididas en dos tipos, **credenciales de prueba** y **credenciales de producción**. A continuación, te explicamos de qué se tratan.

### Credenciales de prueba

Las credenciales de prueba son un conjunto de claves que se utilizan tanto en la etapa de desarrollo, para garantizar configuraciones seguras, como en la etapa de pruebas, para probar la integración.

Durante el proceso de integración, utiliza **credenciales de prueba** para realizar todas las configuraciones y validaciones necesarias, asegurando que no se efectúen pagos reales en producción. Estas credenciales simulan la información de una cuenta productiva, pero en un entorno seguro de pruebas. Mantén el uso de las credenciales de prueba durante toda la fase de desarrollo. Solo cámbialas por las credenciales productivas cuando el sistema esté completamente validado y listo para ser publicado.

Si estás desarrollando para otra persona, deberá solicitar acceso a las credenciales de las aplicaciones que no administras. Consulta la sección **Compartir credenciales** para más información.

Al crear una aplicación, tus credenciales de prueba se generarán automáticamente. Si esto no sucede, solo tienes que hacer clic en **Activar credenciales** en los datos de la integración correspondiente o como te indicamos a continuación.

1.  En [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app), selecciona tu aplicación. Luego, dirígete a la sección **Pruebas** y haz clic en **Credenciales de prueba** en el menú a la izquierda de la pantalla.
2.  Acepta la [Declaración de Privacidad](https://www.mercadopago.com.mx/privacidad) y los [Términos y condiciones](https://www.mercadopago.com.mx/developers/es/docs/resources/legal/terms-and-conditions). Completa el reCAPTCHA y haz clic en **Activar credenciales**.

![activar credenciales de test](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/credentials/activate-credentials-tests-ES-neutro-v1.png)

Al acceder a las credenciales de prueba, se mostrará el par de credenciales **Public Key y Access Token**.

### Public Key y Access Token

Las credenciales **Public Key** y **Access Token** de prueba se utilizan al igual que las credenciales productivas, pero no permitirán realizar ninguna transacción real. En algunas integraciones serán requeridas durante la etapa de desarrollo para simular transacciones y verificar que tu integración funcione correctamente.

El prefijo del _Access Token_ de prueba puede variar dependiendo de la solución que estés integrando. Consulta la documentación específica de cada una para asegurar el uso de la credencial correcta.

| Tipo | Descripción |
| --- | --- |
| Public Key | La clave pública de la aplicación se utiliza generalmente en el frontend. Permite, por ejemplo, acceder a información sobre los medios de pago y cifrar los datos de la tarjeta. Este tipo de llave es la única que puede ser utilizada del lado público de tu integración. |
| Access Token | Clave privada de la aplicación que siempre se debe utilizar en el backend para generar pagos. Nunca deberá ser expuesta en un parámetro o del lado público de la integración. |

## Compartir credenciales

Si estás desarrollando para otra persona o recibes ayuda en la integración o configuración de tus tiendas, podrás compartir las credenciales de forma segura con otra cuenta de Mercado Pago.

Puedes compartir las credenciales **hasta un máximo de 10 veces**. Si alcanzas este límite, deberás eliminar permisos antiguos, sin impacto en las integraciones ya configuradas.

Además, si por cuestiones de seguridad no deseas seguir compartiendo tus credenciales, puedes cancelar el acceso.

A continuación, te mostramos cómo compartir credenciales.

1.  En la esquina superior derecha de [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/panel/app), haz clic en **Ingresar** e ingresa los datos requeridos con la información correspondiente a tu cuenta de Mercado Pago. Luego, haz clic en el botón **Tus integraciones** ubicado en la esquina superior derecha.
2.  Accede a la aplicación de la integración para la cual necesitas compartir las credenciales.
3.  Ve a la sección **Pruebas** o **Producción**, según el tipo de credencial que desees compartir. Recuerda que para acceder a las credenciales de producción, deberás activarlas. Si no sabes cómo activarlas, actívalas desde la sección **Producción**.
4.  Una vez seleccionas las credenciales, dirígete a la sección _Comparte las credenciales con un desarrollador_ y haz clic en el botón **Compartir Credenciales**.
5.  Ingresa el correo electrónico de la persona a la que deseas concederle acceso. **Recuerda**: es obligatorio que el correo electrónico esté asociado a una cuenta de Mercado Pago.

![Compartir credenciales en Tus Integraciones](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/share-credentials-panel-es-v1.jpg)

## Renovar credenciales

Puedes renovar tus **credenciales de producción** por motivos de seguridad o cualquier otra razón relevante.

Renovar credenciales ya configuradas en una integración afectará su funcionamiento. Es necesario que **reemplaces las credenciales antiguas con las obtenidas** luego del proceso de renovación para continuar operando.

Para renovar un par de credenciales, sigue los pasos a continuación.

1.  Accede a tus credenciales de producción a través de [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app).
2.  Selecciona el par de credenciales que quieres renovar. Estas pueden ser **Public Key** y **Access Token** o **Client ID** y **Client Secret**. Ten en cuenta que se renovarán ambas credenciales del par que elijas.
3.  Haz clic en los tres puntos ubicados a la derecha de la credencial que quieras renovar y selecciona **Renovar**. Haz clic en **Renovar ahora** para confirmar el cambio.

![Cómo renovar tus credenciales](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/renew-credentials-es-v1.jpg)

Listo, tus credenciales ya fueron renovadas.

## Recomendaciones de seguridad

Al integrar las soluciones de Mercado Pago, manejarás datos sensibles que deberás proteger de posibles pérdidas o vulnerabilidades, tales como tus credenciales de acceso a Mercado Pago, las claves que utilizas en tus integración o la información de tus clientes.

Te mostraremos cómo puedes optimizar la seguridad de tus integraciones de manera simple y rápida.

### Envía el Access Token por header

Cada vez que realices llamadas a la API, envía el **Access Token** por _header_ en lugar de hacerlo por _query param_. Esto te permitirá resguardarlo para que no sea expuesto a cualquier persona ajena a tu integración.

Por ejemplo, si realizas un llamado **GET** al recurso `/users/me`, sería de esta manera:

```
curl -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
https://api.mercadolibre.com/users/me
```

### Utiliza OAuth para gestionar las credenciales de terceros

OAuth es un protocolo de autorización que permite a aplicaciones acceder de forma segura a cuentas de usuario en servicios HTTP sin necesidad de que ese usuario comparta sus credenciales directamente. Funciona como un intermediario que facilita el acceso controlado a datos de usuario por parte de aplicaciones de terceros.

Para más información, accede a la [documentación](https://www.mercadopago.com.mx/developers/es/docs/security/oauth).
