<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/activities-reports/introduction · capturado 2026-10-08 -->

# Otras operaciones

Los reportes de otras operaciones permiten configurar, generar y descargar información financiera sobre las operaciones de tu cuenta. Cada reporte se crea de forma asíncrona a partir de una configuración de columnas y notificaciones, y se descarga en formato CSV o XLSX.

## Tipos de reporte

El parámetro `reportId` define las operaciones incluidas.

| `reportId` | Reporte | Descripción |
| --- | --- | --- |
| `activities_collection` | Reporte de cobros | Cobros recibidos por checkout, QR, Point, marketplace y otros canales. |
| `activities_after_collection` | Reporte pos-cobros | Devoluciones, contracargos, reclamos y ajustes. |
| `activities_withdraw` | Reporte de retiros | Retiros y transferencias de fondos desde la cuenta. |

Consulta los [Campos del reporte](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/report-fields) para seleccionar las columnas de cada tipo.

## Uso del reporte

Cada fila del archivo representa una operación y contiene fechas, montos, comisiones y estados. Utiliza los reportes para conciliar cobros, devoluciones, contracargos, reclamos y retiros con tus sistemas internos.

Puedes generar el reporte manualmente desde **Tus integraciones > Ver mis cobros y movimientos** o mediante API. Cada solicitud de generación manual admite hasta un año de datos.

Los reportes creados con cuentas de prueba no contienen datos. Sin embargo, los flujos de generación, consulta y listado funcionan normalmente.

Para conocer los canales de generación y las características técnicas del archivo, consulta [Generar reporte](https://www.mercadopago.com.mx/developers/es/docs/reports/activities-reports/generate).
