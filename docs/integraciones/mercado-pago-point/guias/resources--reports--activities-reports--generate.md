<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/activities-reports/generate · capturado 2026-10-08 -->

# Generar reporte

Puedes generar un reporte de otras operaciones desde tu cuenta de Mercado Pago o mediante la integración vía API. Consulta la tabla a continuación para obtener más información.

| Canales | Descripción |
| --- | --- |
| Panel de Mercado Pago | Genera el reporte manualmente desde el Panel de Mercado Pago. Accede a **Tus integraciones > Ver mis cobros y movimientos** y selecciona el tipo de reporte que quieres generar. |
| Integración vía API | Genera el reporte manualmente o programa su generación según la frecuencia deseada mediante la API. Para obtener más información, consulta [Generar reporte a través de la API](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/api). |

## Características técnicas del reporte

Ten en cuenta la siguiente información técnica cuando quieras generar, programar o configurar tus reportes.

### Programación del reporte

Define cómo y con qué frecuencia quieres generar tus reportes.

| Elemento | Características |
| --- | --- |
| Programación | Diaria, semanal o mensual. |
| Generación | Manual o automática. |

### Estructura del reporte

Conoce las características de los elementos que conforman el reporte.

| Elemento o acción | Características |
| --- | --- |
| Columnas | Configurables según el tipo de reporte. Consulta los [Campos del reporte](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/report-fields). |
| Período máximo | Reportes con datos de hasta un año por solicitud. |
| Selección de fechas vía API | Formato ISO 8601 con desfase UTC en `filters.creation_date.range`. |
| Zona horaria de las columnas con fechas | Configurable mediante `display_timezone`. |

### Exportación del reporte

Consulta las opciones disponibles al descargar el reporte.

| Elemento o acción | Características |
| --- | --- |
| Formatos de descarga | `.csv` y `.xlsx`. |
| Compresión | Los reportes de mayor tamaño pueden descargarse como archivos `.zip`. |
| Generación | Asíncrona. El archivo puede descargarse cuando el estado del reporte sea `available`. |

## Notificaciones

Además de la notificación por e-mail que Mercado Pago envía al seller cuando el reporte está disponible, puedes configurar uno o más notificadores para recibirlo o entregarlo mediante otros canales.

| Canal | Características |
| --- | --- |
| Webhook | Notifica a una URL propia cuando el reporte está disponible. |
| SFTP/FTP con contraseña | Entrega el archivo en un servidor externo mediante usuario y contraseña. |
| SFTP con clave privada | Entrega el archivo en un servidor externo mediante una clave privada SSH. |
| SFTP interno | Entrega el archivo mediante la infraestructura SFTP interna de Mercado Pago. |

### Webhook

Cuando el reporte está disponible, Mercado Pago envía una solicitud `POST` a la URL configurada. Para conocer el contenido de la notificación y cómo validar su firma, consulta [Generar reporte a través de la API](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/api#bookmark_4._notificaciones).
