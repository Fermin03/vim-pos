<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/account-money/how-to-use · capturado 2026-10-08 -->

# Usos del reporte

Una vez listo y descargado el reporte, tendrás un archivo para consultar las planillas de cálculo o importar en el programa de conciliación que uses.

Para consultar el reporte te recomendamos descargarlo en formato .csv para abrirlo en el programa que lo visualices. Configura tu programa para que soporte el formato UTF-8, así evitas problemas de lectura.

## Contenido del reporte

El reporte está compuesto por distintos tipo de transacciones que puedes ver en la columna `TRANSACTION_TYPE`. Cada una de ellas tendrá el monto bruto de la operación.

| Transacciones | Tipo de operación |
| --- | --- |
| _SETTLEMENT_ |   
Operación aprobada.  
  
 |
| _REFUND_ |   
Devolución total o parcial de dinero.  
  
 |
| _CHARGEBACK_ |   
Contracargo.  
  
 |
| _DISPUTE_ |   
Operación en reclamo.  
  
 |
| _WITHDRAWAL_ |   
Retiro de dinero.  
  
 |
| _CASHBACK_ |   
Devolución de dinero.  
  
 |
| _SETTLEMENT\_SHIPPING_ |   
Envíos aprobados.  
  
 |
| _REFUND\_SHIPPING_ |   
Devolución total o parcial de costos de envíos.  
  
 |
| _CHARGEBACK\_SHIPPING_ |   
Contracargo de envíos.  
  
 |
| _DISPUTE\_SHIPPING_ |   
Envíos en reclamo.  
  
 |

Y en la columna `SETTLEMENT_NET_AMOUNT` encontrarás el impacto real sobre tu dinero.

Nota

Ten a mano el [Glosario del reporte](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/account-money/glossary) de Todas las transacciones para revisarlo cuando necesites o quieras consultar algún término técnico.

## Ejemplo de reporte

Observa cómo está compuesto el reporte de Todas las transacciones en este ejemplo para identificar las operaciones y leer tus propios reportes:

![Reporte de Todas las transacciones Ejemplos Mercado Pago](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/images/manage-account/reports/example-settlement-es-v1.png)

La versión por defecto mostrará una vista extendida de las columnas. El informe tendrá la mayor cantidad de detalle posible.
