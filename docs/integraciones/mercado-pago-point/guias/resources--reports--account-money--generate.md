<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/account-money/generate · capturado 2026-10-08 -->

# Generar reporte

Puedes generar un reporte de Todas las transacciones a través de tu cuenta de Mercado Pago o mediante la integración a través de la API. Consulta la tabla a continuación para obtener más información.

## Canales de generación

Existen dos formas de generar un reporte de Todas las transacciones:

| Canales | Descripción |
| --- | --- |
| Panel de Mercado Pago | Es posible crear el reporte manualmente a través del panel de Mercado Pago. Accede a la sección de [Informes y facturación](https://www.mercadopago.com.mx/balance/reports?page=1#!/settlement-report) , haz clic en **Ir a reportes de pagos y extractos de cuenta** y selecciona el reporte. Para obtener más información, consulta la documentación [Generar reporte desde el panel](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/account-money/panel). |
| Integración vía API | Crea el reporte manualmente o programa su generación según la frecuencia deseada utilizando nuestra integración a través de la API. Para obtener más información, consulta la documentación [Generar reporte a través de la API.](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/account-money/api) |

## Características técnicas del reporte

Ten en cuenta la siguiente información técnica cuando quieras generar, programar y configurar tus reportes.

### Programación del reporte

Programa cómo y con qué frecuencia quieres generar tus reportes.

| Elemento | Características |
| --- | --- |
| Programación |   
\- Diaria  
\- Semanal  
\- Mensual  
  
 |
| Generación |   
\- Manual  
\- Automática  
  
 |

### Estructura del reporte

Conoce las características de los elementos que conforman tu reporte.

| Elemento o acción | Características |
| --- | --- |
| Detalle de tablas |   
El detalle de las tablas comprende información generada en día 1 como mínimo.  
  
 |
| Orden de columnas |   
Fijo  
  
 |
| Período máximo |   
Reportes con datos de hasta 60 días.  
  
 |
| Moneda |   
Local (basada en el país donde esté registrada la cuenta de Mercado Pago)  
  
 |
| Zona horaria de las columnas con fechas |   
GMT-4  
  
Toma como referencia el lugar desde el que se descarga el reporte.  
  
 |
| Selección de fechas vía API |   
Formato del timezone: UTC / GMT-0  
  
 |
| Selección de fechas vía web |   
Debe basarse en el timezone de la cuenta.  
Por ejemplo, a la cuenta registrada en Brasil le corresponde el timezone de São Paulo.  
 |

### Exportación del reporte

Todas las opciones que tienes disponible a la hora de descargar tu reporte.

| Elemento o acción | Características |
| --- | --- |
| Formato del nombre del archivo |   
Cuando el reporte es programado o manual:  
"<prefijo-configurable>-<yyyy-MM-dd-hhmmss>.<formato>"  
Ejemplo: mitienda-2019-05-28-104010.csv  
  
 |
| Formatos de descarga |   
.csv, .xlsx  
  
Tip: descarga el reporte en .csv para importar los datos y usarlos en otras aplicaciones. Descárgalo en .xlsx para leer la información en las tablas de la hoja de cálculo.  
  
 |
| Archivo |   
Los reportes generados quedan guardados en tu cuenta de Mercado Pago.  
  
 |
| Configuración disponible vía API |   
\- Columnas a generar por reporte  
\- Prefijo del archivo para identificarlo fácilmente  
\- Carga por SFTP  
\- Separador de columnas (punto o punto y coma)  
\- Notificación por e-mail  
  
 |

## Notificaciones

### Webhook

Webhook (también conocido como devolución de llamada web) es un método simple que facilita que una aplicación o sistema proporcione información en tiempo real cada vez que ocurre un evento, es decir, es una forma de recibir datos pasivamente entre dos sistemas a través de un HTTP POST. Para el caso de los reportes que se utilizan para conciliar se enviará una notificación al usuario que tenga configurado este servicio cuando sus archivos sean generados.

| Atributo | Descripción |
| --- | --- |
| transaction\_id | ID de la transacción |
| request\_date | Fecha de la solicitud |
| generation\_date | Fecha de la generación |
| files | Archivos disponibles |
| type | Formato del archivo |
| url | Enlace de descarga |
| name | Nombre del archivo |
| status | Estado del reporte |
| creation\_type | Creación manual o programada |
| report\_type | Tipo de reporte |
| is\_test | Define si es una prueba |
| signature | Firma de la notificación |

### Contraseña para cifrado

La contraseña de cifrado es esencial para asegurar el proceso de notificación al sistema. En el cuerpo del mensaje (_payload_), se envía un atributo llamado **_"signature"_** para validar la origen legítima de la notificación Webhook de Mercado Pago, evitando posibles imitaciones.

La creación de la **_signature_** ocurre mediante la combinación del `transaction_id` con la `contraseña para cifrado` en la sección **_"Notificación por Webhook"_**, junto con la `generation_date` del reporte. Estos valores se cifran utilizando el algoritmo **_BCrypt_** de la siguiente manera:

`signature = BCrypt(transaction_id + '-' + password_for_encryption + '-' + generation_date)`

Para validar que sea Mercado Pago quien emitió la notificación, es necesario utilizar la **_función de verificación_** ofrecida por el algoritmo de **_BCrypt_** para el lenguaje deseado.

**Ejemplo en Java:**

`BCrypt.checkpw(transaction_id + '-' + password_for_encryption + '-' + generation_date, payload_signature)`

Ten a mano el [Glosario del reporte](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/account-money/glossary) de Todas las transacciones para revisarlo cuando necesites o quieras consultar algún término técnico.
