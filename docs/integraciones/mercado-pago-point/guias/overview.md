<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/overview · capturado 2026-10-08 -->

Integra Mercado Pago Point en tu Punto de Venta Transforma la experiencia de cobro integrando terminals Point a tu sistema punto de venta (PDV). Esta integración permite procesar pagos presenciales con tarjetas y realizar una conciliación automática de tus ventas con Mercado Pago de forma unificada.

Pagos presenciales

Múltiples medios de pago

Conciliación automática

¿Buscas opciones sin desarrollo? Obtén un [lector de tarjetas listo para operar](https://www.mercadopago.com.mx/herramientas-para-vender/lectores-point).

![](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/5/19/1750362213269-terminalsmlamlmes.png)

Cómo funciona

Al integrar pagos con las terminals Point, las vincularás directamente a tu sistema punto de venta (PDV). Así, podrás procesar pagos de manera unificada, reduciendo la posibilidad de errores involuntarios y garantizando una sincronización entre tu sistema y Mercado Pago.

[Cómo integrar](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application)

![](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/5/19/1750362335520-howitworkses.png)

[Consulta las tasas por procesamiento](< https://www.mercadopago.com.mx/developers/es/support/37740
>)

Proceso de cobro

1.  Creas la order de pago desde tu sistema a través de nuestra API unificada.
    
2.  La terminal Point carga la order de pago automáticamente.
    
3.  El comprador efectúa el pago con el medio de pago seleccionado.
    
4.  El sistema integrado recibe la notificación sobre el estado del pago.
    

[Cómo integrar](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application)

Qué ofrece A diferencia de modelos sin integración, donde cada pago debe ser procesado y conciliado manualmente, integrar Mercado Pago Point a tu punto de venta (PDV) transforma tu experiencia.

Agilidad en la gestión

-   Gestiona los pagos directamente desde tu sistema.
-   Concilia automáticamente las operaciones con Mercado Pago.

Pagos personalizados

-   Ofrece múltiples medios de pago y adáptate a cada comprador.
-   Elige si quieres ofrecer meses [con](https://www.mercadopago.com.mx/ayuda/24694) o [sin interés](https://www.mercadopago.com.mx/developers/es/support/mensualidades-sin-intereses_2255).

API unificada

-   Integra distintas soluciones de cobro sin necesidad de trabajar con varias APIs separadas.
-   Simplifica tu proceso de integración con Mercado Pago.

Eficiencia y seguridad

-   Optimiza el desempeño de tu negocio automatizando tareas y reduciendo errores en los cobros y en la conciliación.
-   Protege los datos involucrados en las transacciones con protocolos HTTPS y autenticaciones OAuth.

Terminals disponiblesLos terminals que te permitirán integrar tu sistema PDV a Mercado Pago Point son los siguientes. Si no tienes uno, accede a la [tienda oficial](https://www.mercadopago.com.mx/herramientas-para-vender/lectores-point).

![](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/5/19/1750364166357-terminalsmart1es.png)Point Smart 1[Ir a la tienda](https://www.mercadopago.com.mx/herramientas-para-vender/lectores-point)

![](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/5/19/1750364222941-terminalsmart2es.png)Point Smart 2[Ir a la tienda](https://www.mercadopago.com.mx/herramientas-para-vender/lectores-point)

Pagos con tarjetas

Pagos con tarjetas

Débito, crédito y prepagas, con tecnología de chip, NFC y franja magnética.

Pagos con tarjetas

Débito, crédito y prepagas, con tecnología de chip, NFC y franja magnética.

Propinas

Propinas

\-

Propinas

Cómo integrar

Conoce las etapas que deberás seguir para integrar Mercado Pago Point a tu punto de venta.

Requisitos previos

-   **Terminal Point Smart**
    
    Para ofrecer pagos presenciales a través de Point, es necesario adquirir la terminal. Si aún no lo has hecho, dirígete a la [tienda](https://www.mercadopago.com.mx/herramientas-para-vender/lectores-point).
    
-   **App de Mercado Pago en tu celular**
    
    En conjunto con la terminal, es necesario contar con la aplicación Mercado Pago en tu celular para iniciar sesión en la terminal. Puedes descargarla para dispositivos [Android](https://play.google.com/store/apps/details?id=com.mercadopago.wallet&hl=es_419) o [iOS](https://apps.apple.com/ar/app/mercado-pago/id925436649).
    
-   **Cuenta Mercado Pago**
    
    Necesitas crear un usuario en Mercado Pago o Mercado Libre para tener una [cuenta de vendedor](https://www.mercadopago.com.mx/hub/registration/landing), ya sea en una integración [propia](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application#:~:text=a%20las%20credenciales.-,Obtener,-credenciales%20para%20una) o para [terceros](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application#:~:text=una%20integraci%C3%B3n%20propia-,Obtener,-credenciales%20para%20una).
    

Proceso de integración

1.  [Crear una aplicación](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application) a partir de [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app).
    
2.  [Configurar la terminal Point](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-terminal)
    
3.  [Integrar el procesamiento de pagos](https://www.mercadopago.com.mx/developers/es/docs/mp-point/payment-processing)
    
4.  [Configurar las impresiones](https://www.mercadopago.com.mx/developers/es/docs/mp-point/configure-printings)
    
5.  [Configurar las notificaciones de pago](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications)
    
6.  [Probar la integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/integration-test)
    
7.  [Salir a producción](https://www.mercadopago.com.mx/developers/es/docs/mp-point/go-to-production)
    

[Quiero comenzar a integrar](https://www.mercadopago.com.mx/developers/es/docs/mp-point/create-application)

```
  flowchart TD
                A[Crear una aplicación a partir de Tus integraciones] --> B[Configurar la terminal Point]
                B --> C[Integrar el procesamiento de pagos]
                C --> D[Configurar las impresiones]
                D --> E[Configurar las notificaciones de pago]
                E --> F[Probar la integración]
                F --> G[Salir a producción]
  
```
