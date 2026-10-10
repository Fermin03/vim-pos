<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/go-to-production · capturado 2026-10-08 -->

# Salir a producción

Antes de salir a producción con la integración de Mercado Pago Point a tu punto de venta, verifica cumplir con los siguientes puntos.

Credenciales

Después de probar y validar la integración, será necesario reemplazar el Access Token de prueba utilizado durante el proceso de desarrollo y prueba de la integración por el **_Access Token_ de producción** de la cuenta real. De esta forma, tu integración estará lista para recibir pagos reales en el entorno de producción.

Dependiendo de si estás desarrollando una integración propia o para un tercero, esas **credenciales de producción** serán diferentes y deberán obtenerse de formas distintas. Selecciona la opción que mejor se adapte a tus necesidades y sigue los pasos indicados para acceder a las credenciales.

El proceso de obtención de credenciales para una integración propia con Mercado Pago Point se basa en la activación de las credenciales de producción de tu cuenta real. Sigue los pasos a continuación para saber cómo activarlas.

1.  Ingresa a [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) y selecciona tu aplicación.
2.  Dirígete a la sección **Credenciales de producción** en el menú lateral izquierdo.
3.  En el campo **Industria**, selecciona del menú desplegable la industria o rubro al que pertenece el negocio que estás integrando.
4.  En el campo **Sitio web (opcional)**, completa con la URL del sitio web del negocio.
5.  Acepta la [Declaración de Privacidad](https://www.mercadopago.com.mx/privacidad) y los [Términos y condiciones](https://www.mercadopago.com.mx/developers/es/docs/resources/legal/terms-and-conditions). Completa el reCAPTCHA y haz clic en **Activar credenciales de producción**.

Al acceder a las credenciales de producción, se mostrarán los siguientes pares de credenciales:

![Cómo acceder a las credenciales a través de Tus Integraciones](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/snippets/credentials-prod-panel-es-v2.jpg)

Para disponibilizar tu integración con Mercado Pago Point en producción, utiliza tu Access Token de producción de tu cuenta real de Mercado Pago.

  
  

Recuerda también reemplazar las credenciales de prueba por las de producción en las llamadas a las APIs para el [procesamiento de pagos](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing).

Crear y configurar nuevas sucursales y cajas

Durante el desarrollo, la sucursal y caja creadas fueron asociadas a la cuenta de prueba. Para salir a producción, deberás [crearlas nuevamente](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal), esta vez utilizando el _Access Token_ que corresponda a tu tipo de integración, según se indica en el apartado de _Credenciales_ de esta misma documentación.

Reasociar terminal

Durante el desarrollo, la terminal fue asociada a la cuenta de prueba. Al salir a producción, es necesario reasociarla a la cuenta real que recibirá los pagos (o a la cuenta de colaborador, según corresponda). Para ello, cierra la sesión iniciada en la terminal previamente, y escanea el código QR con la aplicación móvil de Mercado Pago con la sesión iniciada en la cuenta de producción correspondiente.

Terminals en modo PDV

Recuerda que cada terminal con la que vayas a operar de manera integrada deberá estar configurada en [modo PDV](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal#:~:text=en%20la%20terminal-,Como,-%C3%BAltimo%20paso%20de). Confirma esto para cada una de las terminals con las que saldrás a producción.

Notificaciones

Confirma en [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) haber [configurado tus notificaciones Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications) de Modo producción y haber indicado una URL de producción para recibir actualizaciones sobre las orders.

En el caso de integraciones para terceros, las notificaciones Webhooks deben configurarse en la **aplicación** de la cuenta principal.

Reportes

Los [reportes de Mercado](https://www.mercadopago.com.mx/developers/es/docs/reports/introduction) Pago proporcionan información para dar seguimiento a las transacciones de las cuentas, como el saldo disponible, los movimientos y la liquidez. Esto facilita la conciliación de las ventas y otras operaciones con sistemas de gestión internos.

Si bien son opcionales, te recomendamos utilizar los reportes para mejorar la gestión financiera empresarial una vez que hagas tu salida a producción.
