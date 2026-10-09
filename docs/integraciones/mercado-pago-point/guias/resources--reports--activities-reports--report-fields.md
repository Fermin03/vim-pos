<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/activities-reports/report-fields · capturado 2026-10-08 -->

# Campos del reporte

Consulta la descripción de los campos que puedes incluir en un reporte de otras operaciones. Al crear o actualizar una configuración, envía la `key` de cada campo dentro de `structure.columns`.

| Campo (`key`) | Descripción | Tipo de dato | Reporte |
| --- | --- | --- | --- |
| `date_created` | Fecha de creación de la operación. | Datetime | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `date_approved` | Fecha de aprobación de la operación. | Datetime | `activities_collection`, `activities_after_collection` |
| `date_released` | Fecha en la que el dinero se liberó y quedó disponible en el saldo de la cuenta. | Datetime | `activities_collection` |
| `operation_id` | Identificador de la operación en Mercado Pago. | String (100) | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `external_reference` | Referencia externa que permite identificar el origen de la operación. | String (255) | `activities_collection`, `activities_after_collection` |
| `status` | Estado de la operación. | String (50) | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `status_detail` | Detalle del estado de la operación. | String | `activities_collection`, `activities_after_collection` |
| `operation_type` | Tipo de operación. | String | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `transaction_amount` | Monto bruto de la operación. | Numeric (17,2) | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `net_received_amount` | Monto neto recibido después de descontar las comisiones. | Numeric (17,2) | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `mercadopago_fee` | Comisión cobrada por Mercado Pago. | Numeric (17,2) | `activities_collection`, `activities_after_collection` |
| `payment_type` | Medio de pago utilizado en la operación. | String (200) | `activities_collection`, `activities_after_collection` |
| `installments` | Cantidad de cuotas. | Integer | `activities_collection`, `activities_after_collection` |
| `amount_refunded` | Monto devuelto de la operación. | Numeric (17,2) | `activities_collection` |
| `chargeback_id` | Identificador del contracargo. | String | `activities_collection` |
| `claim_id` | Identificador del reclamo. | String | `activities_collection` |
| `store_id` | Identificador de la tienda. | String (100) | `activities_collection`, `activities_after_collection` |
| `pos_id` | Identificador del punto de venta. | String | `activities_collection` |
| `rejection_causes` | Causas del rechazo. Solo se informa para cobros rechazados por alto riesgo. | Array JSON | `activities_collection` |
| `counterpart_name` | Nombre de la contraparte de la operación. | String | `activities_collection`, `activities_after_collection`, `activities_withdraw` |
| `counterpart_email` | Correo electrónico de la contraparte de la operación. | String | `activities_collection` |
| `buyer_document` | Documento del comprador. | String | `activities_collection` |
| `bank_account` | Datos de la cuenta bancaria de destino del retiro. | String | `activities_withdraw` |

En `activities_collection`, ten en cuenta las siguientes particularidades al interpretar los campos del archivo:

-   `mercadopago_fee` se devuelve como un valor negativo. Considéralo al conciliarlo con `transaction_amount`.
-   Por condiciones de protección de datos personales, `counterpart_name`, `counterpart_email` y `buyer_document` pueden excluirse del archivo. Además, cuando se incluye `counterpart_email`, su valor puede devolverse parcialmente ofuscado.

Para conocer las validaciones y los valores admitidos por cada campo, consulta la [Referencia de API](https://www.mercadopago.com.mx/developers/es/reference/reports/overview).
