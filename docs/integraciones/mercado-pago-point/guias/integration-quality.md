<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/integration-quality · capturado 2026-10-08 -->

# Medir la calidad de la integración

La medición de calidad permite evaluar si tu integración cumple con los requisitos de seguridad y calidad de Mercado Pago. Antes de salir a producción, realiza esta evaluación para identificar ajustes obligatorios, recomendaciones y buenas prácticas.

Esta documentación describe la medición de calidad para integraciones con **Mercado Pago Point vía Orders API** en modo `PDV`.

## Aspectos evaluados en la medición de calidad

Durante la medición, Mercado Pago analiza los siguientes aspectos de la integración:

| Aspecto | Descripción |
| --- | --- |
| Experiencia del comprador | Evalúa los datos y las configuraciones que influyen en la experiencia de pago en la terminal. |
| Conciliación financiera | Verifica que la integración facilite la correlación de las orders de Mercado Pago con las operaciones registradas en tu sistema. |
| Aprobación de pagos | Analiza la información enviada en cada pago para mejorar la tasa de aprobación y aplicar las herramientas de prevención de fraude. |
| Escalabilidad | Comprueba que la integración permita administrar y sostener la operación a medida que el negocio se expande. |
| Seguridad | Evalúa el tratamiento seguro de las credenciales y de los datos utilizados durante la compra. |

## Medir la calidad de tu integración

Para iniciar la medición, declara cómo funciona tu integración:

1.  Accede a **Tus integraciones** y selecciona la aplicación configurada con **Mercado Pago Point vía Orders API**.

![Selección de la aplicación](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/api-orders/tusintegraciones-v1.png)

2.  En **Etapas de integración: Point**, accede a **Probar la integración** y selecciona **Declarar información sobre la integración**.

![Acceso a la declaración de información de la integración](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/mp-point/homologator/declare-information-point-2-esvoseo-v1.png)

3.  En **Declara cómo operará la integración**, indica cuántas marcas usarán la integración, en cuántos países se realizarán operaciones y cuántas cuentas de Mercado Pago se utilizarán. Luego, haz clic en **Continuar**.

![Declaración del funcionamiento de la integración](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/mp-point/homologator/declare-information-point-3-esvoseo-v1.png)

La medición se basa en la información que declares. Complétala con precisión para que el resultado refleje el funcionamiento real de tu integración.

Después de declarar la información, puedes realizar la medición de forma **manual** o **automática**.

Para medir manualmente la calidad de la integración, utiliza el **Order ID** de una order productiva cuyo pago haya sido procesado en una terminal física:

La medición manual solo está disponible cuando la integración tiene actividad productiva. Antes de iniciarla, procesa al menos un pago con credenciales de producción en una terminal física. Como la medición solo admite orders productivas, no es posible utilizar el dispositivo virtual estándar.

1.  Selecciona **Probar la integración** y haz clic en **Comenzar**.
    
2.  En **Medir la calidad de la integración**, haz clic en **Iniciar medición**.
    
3.  Ingresa el **Order ID** de un pago realizado durante los últimos **7 días** con credenciales de producción. Luego, haz clic en **Medir calidad**.
    
4.  Consulta el resultado de la medición.
    

| Resultado | Explicación |
| --- | --- |
| Por debajo del ideal | La integración requiere acciones obligatorias para alcanzar la calidad esperada. |
| Cerca del ideal | La integración cumple con los requisitos mínimos, pero todavía tiene oportunidades de mejora. |
| Ideal | La integración cumple con todos los requisitos esperados. |

5.  Haz clic en **Ir al detalle** para consultar los requisitos, las recomendaciones y las buenas prácticas identificadas.

La sección **Calidad de integración** permanecerá disponible en el menú de la aplicación. Desde allí puedes actualizar la información declarada y ejecutar nuevas mediciones.

Después de completar la medición, aplica todas las acciones obligatorias indicadas por la herramienta y vuelve a medir la calidad de la integración para comprobar los ajustes.

## Analizar los resultados de la medición

En la sección **Calidad de integración** de los [Datos de integración](https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/application-details), encontrarás la siguiente información:

1.  **Puntuación**: indica el nivel de cumplimiento de los criterios de calidad y se calcula a partir de la información enviada en la order. El mínimo para aprobar la medición de calidad es de **73 puntos**, pero alcanzarlo no basta por sí solo: también debes resolver todos los requisitos obligatorios. Recomendamos alcanzar **100 puntos**.
2.  **Fecha de la última medición y Order ID**: identifica cuándo se realizó la última evaluación y qué order se utilizó.
3.  **Aspectos evaluados**: muestra la puntuación de cada aspecto y permite filtrar los resultados por requisitos, recomendaciones y buenas prácticas.
4.  **Medir de nuevo**: permite repetir la medición después de aplicar los ajustes identificados.

La puntuación debe analizarse junto con las acciones obligatorias indicadas por la herramienta.

## Acciones para mejorar la calidad de tu integración

El resultado clasifica las oportunidades de mejora en las siguientes categorías:

-   **Acciones obligatorias**: requisitos que debes cumplir para asegurar la calidad de la integración. Por ejemplo, configurar las [notificaciones Webhooks](https://www.mercadopago.com.mx/developers/es/docs/mp-point/notifications) o enviar una referencia externa para correlacionar las orders.
-   **Acciones recomendadas**: ajustes que mejoran la puntuación. Por ejemplo, enviar los ítems de la compra correctamente detallados en la order.
-   **Buenas prácticas**: recomendaciones que no modifican la puntuación, pero mejoran la operación. Por ejemplo, crear un manual para que el cajero utilice correctamente el software de punto de venta.

Aplica las indicaciones específicas que devuelve la herramienta y ejecuta una nueva medición para comprobar los cambios.
