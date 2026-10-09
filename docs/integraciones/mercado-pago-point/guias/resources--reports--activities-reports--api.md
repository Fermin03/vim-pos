<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/activities-reports/api · capturado 2026-10-08 -->

# Crear reporte a través de la API

La API de reportes de otras operaciones permite definir el contenido y el canal de entrega del archivo, generar reportes manualmente o programar su generación automática y descargarlos cuando estén disponibles.

Para realizar las solicitudes, utiliza tu _Access Token_ de producción.

El flujo consta de los siguientes pasos:

1.  Configura las columnas del archivo y sus notificadores de entrega.
2.  Genera el reporte manualmente, consulta su estado y descárgalo cuando esté disponible.
3.  Programa la generación automática si necesitas recibir el reporte periódicamente.
4.  Consulta el contenido de las notificaciones Webhook y valida su firma.

Recuerda que el tipo de reporte que quieres configurar, generar o programar se define mediante el parámetro de ruta `reportId`. Los valores disponibles son los siguientes:

| `reportId` | Tipo de reporte | Descripción |
| --- | --- | --- |
| `activities_collection` | Reporte de cobros | Incluye los cobros recibidos mediante checkout, QR, Point, marketplace y otros canales. |
| `activities_after_collection` | Reporte poscobro | Incluye devoluciones, contracargos, reclamos y ajustes posteriores al cobro. |
| `activities_withdraw` | Reporte de retiros | Incluye retiros y transferencias de fondos desde la cuenta. |

## 1\. Configurar tus reportes

La configuración determina qué columnas tendrá el archivo, cómo se mostrarán sus datos y mediante qué canales se informará o entregará el reporte. Debes crear una configuración para cada tipo de reporte, identificado mediante `reportId`, antes de generar o programar archivos.

## Crear una nueva configuración

Para crearla, envía una solicitud a [/v1/reporting/operations/{reportId}/configPOST](https://www.mercadopago.com.mx/developers/es/reference/reports/create-activity-report-configuration/post) con los objetos `structure` y `notifiers`.

-   En `structure`, asigna un nombre a la configuración mediante `name` y define las columnas del archivo en `columns`. Cada elemento de `columns` debe contener la `key` de un campo admitido por el tipo de reporte. Consulta los valores disponibles en [Campos del reporte](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/report-fields).
-   En `structure.file_format`, puedes definir los separadores, el formato de fecha, el nombre y el prefijo del archivo.
-   En `structure.display_timezone`, puedes establecer la zona horaria utilizada para mostrar las fechas del archivo. Este valor no modifica el rango enviado posteriormente en `filters.creation_date.range`.
-   En `notifiers`, incluye al menos un canal para informar que el reporte está disponible o entregar el archivo generado.

Cada elemento de `notifiers` contiene un `type`, que identifica el canal de entrega, y un objeto `data`, que reúne los datos de conexión requeridos por ese canal.

| Valor de `notifiers[].type` | Canal de entrega | Campos que debes enviar en `notifiers[].data` |
| --- | --- | --- |
| `webhook` | Envía una notificación a una URL propia. | `url`, `key` |
| `ftp` | Entrega el archivo en un servidor FTP o SFTP mediante contraseña. | `server`, `port`, `username`, `password`, `remote_dir` |
| `ftp_pkey` | Entrega el archivo en un servidor SFTP mediante una clave privada SSH. | `server`, `port`, `username`, `private_key`, `remote_dir` |
| `internal_sftp` | Entrega el archivo mediante el canal SFTP interno de Mercado Pago. | Envía `data` como un objeto vacío; sus atributos se administran internamente. |

En caso de éxito, la respuesta contiene `structure.id`, que identifica la configuración, y `notifiers[].id`, que identifica cada notificador creado. Guarda estos valores: los necesitarás para actualizar la configuración o programar la generación automática.

## Consultar configuraciones

Para consultar la configuración activa de un tipo de reporte, envía una solicitud a [/v1/reporting/operations/{reportId}/configGET](https://www.mercadopago.com.mx/developers/es/reference/reports/get-activity-report-configuration/get). La respuesta devuelve la estructura, los notificadores asociados y sus respectivos identificadores.

## Actualizar configuraciones

Para modificar una configuración existente, utiliza el valor de `structure.id` como `structureId` en [/v1/reporting/operations/{reportId}/config/{structureId}PUT](https://www.mercadopago.com.mx/developers/es/reference/reports/update-activity-report-configuration/put).

Mediante esta solicitud puedes actualizar el nombre y las columnas del reporte, la configuración del archivo de salida, la zona horaria utilizada para mostrar las fechas y los notificadores de entrega.

## 2\. Generar reporte manualmente

Genera un reporte para un período específico y descárgalo cuando esté disponible.

## Crear reporte

Para generar el reporte, envía una solicitud a [/v1/reporting/operations/{reportId}/statementsPOST](https://www.mercadopago.com.mx/developers/es/reference/reports/create-activity-report/post). Mediante esta solicitud puedes definir el período del reporte, aplicar los filtros admitidos por el tipo seleccionado y elegir el formato del archivo. El período no puede superar un año.

```
curl -X POST \
  'https://api.mercadopago.com/v1/reporting/operations/activities_collection/statements' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"filters":{"creation_date":{"range":{"gte":"2026-03-01T00:00:00-03:00","lte":"2026-03-31T23:59:59-03:00"}}}}'
```

En caso de éxito, la respuesta devuelve `record_id`. Utiliza ese valor como `uid` para consultar el estado del reporte y descargar el archivo.

## Consultar reporte

Para consultar el estado de un reporte, utiliza el `record_id` obtenido al crearlo como `uid` en [/v1/reporting/operations/{reportId}/statements/{uid}GET](https://www.mercadopago.com.mx/developers/es/reference/reports/get-activity-report-status/get).

| Estado | Descripción |
| --- | --- |
| `pending` | El reporte está en proceso de generación. |
| `available` | El archivo está disponible para descargar. |
| `failed` | La generación no pudo completarse. |
| `empty` | No se encontraron operaciones para el rango y los filtros enviados. |

También puedes listar los reportes generados mediante [/v1/reporting/operations/{reportId}/statementsGET](https://www.mercadopago.com.mx/developers/es/reference/reports/consult-activity-reports-list/get) y filtrar los resultados por estado, fecha de creación y origen.

## Descargar reporte

Cuando el reporte tenga el estado `available`, descárgalo mediante [/v1/reporting/operations/{reportId}/statements/{uid}/downloadGET](https://www.mercadopago.com.mx/developers/es/reference/reports/download-activity-report/get). Utiliza el mismo `uid` de la consulta y elige entre los formatos CSV y XLSX. Los archivos de mayor tamaño pueden entregarse comprimidos en `.zip`.

## 3\. Programar reporte automáticamente

Crea una programación para generar el reporte automáticamente de forma diaria, semanal o mensual.

## Activar generación automática

Para activar la generación automática, envía una solicitud a [/v1/reporting/operations/{reportId}/schedulePOST](https://www.mercadopago.com.mx/developers/es/reference/reports/enable-automatic-generation/post). Mediante esta solicitud puedes definir la frecuencia y la hora de generación, indicar la configuración del reporte y seleccionar sus notificadores de entrega.

En caso de éxito, la respuesta devuelve `id`, que identifica la programación creada. Guarda este valor para desactivarla posteriormente como `scheduleId`.

## Desactivar generación automática

Utiliza el identificador de la programación como `scheduleId` en [/v1/reporting/operations/{reportId}/schedule/{scheduleId}DELETE](https://www.mercadopago.com.mx/developers/es/reference/reports/disable-automatic-generation/delete). Al desactivarla, dejan de generarse nuevos reportes, pero los archivos creados anteriormente permanecen disponibles.

## 4\. Notificaciones

Cuando el reporte está disponible, Mercado Pago envía una solicitud `POST` a la URL definida en `notifiers[].data.url` para el notificador de tipo `webhook`. El cuerpo identifica el reporte y los archivos disponibles.

```
{
  "report_id": "activities_collection",
  "statement_id": "6d17e034-6eb3-48fc-a6fa-461e886fa406",
  "status": "available",
  "files": [
    {
      "type": "text/csv",
      "name": "activities_collection.csv",
      "size": 20480,
      "has_zip_version": false
    }
  ]
}
```

Verifica la firma de la notificación con el _secret_ enviado en `notifiers[].data.key` y descarta el evento si no coincide.
