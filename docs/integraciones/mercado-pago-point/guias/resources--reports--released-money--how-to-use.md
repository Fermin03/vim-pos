<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/released-money/how-to-use · capturado 2026-10-08 -->

# Usos del reporte

Una vez que el reporte esté listo y descargado, tendrás un archivo preparado para consultar las planillas de cálculo e importarlas al programa de conciliación que utilices.

Para consultar el reporte, recomendamos descargarlo en formato .csv y abrirlo en una hoja de cálculos o cualquier programa de visualización. Configura tu programa para que soporte el formato UTF-8, así evitas problemas de lectura.

## Contenido del reporte

| Campo del informe | Descripción |
| --- | --- |
| Initial Available Balance |   
Saldo inicial. Indica el valor que estaba disponible en la fecha inicial del período seleccionado para la conciliación.  
  
 |
| Release |   
Detalle de las liberaciones de dinero que incluyen el saldo inicial y las transacciones que impactan el saldo total.  
  
 |
| Block |   
Bloqueos de dinero por disputas.  
  
 |
| Unblock |   
Desbloqueos después de la resolución de las disputas.  
  
 |
| Subtotal |   
Suma de las transacciones que componen cada sección.  
  
 |
| Total |   
Resultado final compuesto por la suma de todos los subtotales.  
  
Es decir:  
subtotal `Release` + subtotal `Block` + subtotal `Unblock` = resultado total.  
  
Es la diferencia entre el valor neto total acreditado y el valor neto total debitado. |

Además, el reporte refleja los conceptos contables del debe (dinero que debes pagar) y haber (dinero que debes cobrar), organizando el reporte en dos columnas, una para cada concepto:

Tu **haber** estará en la columna `NET_CREDIT_AMOUNT`.  
Tu **debe** estará en la columna `NET_DEBIT_AMOUNT`.

Los saldos disponibles de las transacciones liquidadas se muestran en las columnas `NET_CREDIT_AMOUNT` (acreditado) y `NET_DEBIT_AMOUNT` (debitado) dependiendo de si el monto es positivo o negativo. En estos campos también se detallan el monto bruto y los descuentos relacionados con financiamientos, impuestos y costos de envío, dando como resultado el valor neto final.

Si esto pasa, el reporte sigue siendo válido. El dinero vuelve a tu cuenta y la operación aparecerá en el reporte como una nueva línea en la columna `NET_CREDIT_AMOUNT`.

Ten a mano el [Glosario del Reporte de Liberaciones](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/released-money/report-fields) para consultarlo cuando necesites revisar algún término técnico.

## Ejemplo de reporte

Observa lo que compone el Reporte de Liberaciones en el siguiente ejemplo para identificar las secciones y analizar tus propios reportes:

![Reporte de liberaciones](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/manage-account/reports/example-release-es-v1.jpg)

La versión por defecto mostrará una vista extendida de las columnas. El reporte final tendrá la mayor cantidad de detalles posible.

## Organización del informe

Mira el siguiente ejemplo para entender la organización del reporte:

![Reporte de Dinero retirado Ejemplos Mercado Pago](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/manage-account/reports/example-nledger-es-v1.jpg)
