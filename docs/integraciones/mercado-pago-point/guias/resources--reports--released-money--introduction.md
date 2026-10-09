<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/released-money/introduction · capturado 2026-10-08 -->

# Reporte de Liberaciones

El Reporte de Liberaciones es un archivo que se puede descargar y detalla el saldo disponible en tu cuenta de Mercado Pago. No solo muestra el valor total disponible, sino que también proporciona información sobre las transacciones realizadas en un período determinado, incluyendo situaciones como bloqueos y desbloqueos de fondos.

Además, le permite saber si su dinero se encuentra en un estado disponible o retirado, y puede solicitar esta información para el período de fechas que le resulte más conveniente. Ten presente que actualmente este reporte solo se genera a través de tu computadora.

## Análisis de los reportes a partir de octubre de 2022

Los informes que genere a partir de octubre de 2022 tienen las siguientes características:

1.  Los movimientos ahora se presentan en el orden en que ocurrieron, con lo cual puedes identificarlos con mayor facilidad y controlar tus ventas.
2.  En caso de reclamación o contracargo relacionada con algún problema en el servicio o producto que vendiste, el valor correspondiente se retiene hasta que se resuelva la mediación. Esta información se refleja en su reporte y puede encontrarse buscando el prefijo "reserve-".
3.  Las transacciones relacionadas con retiros y/o transferencias de su saldo disponible aparecen como _payout_, y todas las mediaciones que surgen cuando se inicia o resuelve una reclamación aparecen como _dispute_. Para obtener la descripción de otras transacciones y términos, consulte [el glosario](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/reports/released-money/report-use).
4.  Encontrará una nueva columna llamada "Sale detail" o "Detalle de venta" que proporciona información detallada sobre los artículos vendidos, facilitando la conciliación y el control de sus ventas. Cada entrada en esta columna muestra el primer elemento de la venta, seguido del agrupamiento de otros artículos.

## Descargar reporte

Para saber cómo generar y descargar el reporte de Liberaciones, ve a [Informes y facturación](https://www.mercadopago.com.mx/balance/reports) > **Reportes de ventas y extractos de cuenta > [Liberaciones](https://www.mercadopago.com.mx/balance/reports/release)** \> **Crear reporte**.

### Crear reporte por API

Genera el reporte de Liberaciones manualmente tantas veces desee o prográmelo según sus necesidades de frecuencia a través de la [API](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/reports/released-money/api).

La generación del reporte lleva algunos minutos dependiendo de cuánta información desee incluir. No siempre estará listo instantáneamente y, hasta que lo esté, verá el estado "En preparación" en la pantalla.

Consulte ["Cómo analizar el reporte de Liberaciones?"](https://www.mercadopago.com.mx/ayuda/28771) para comprender mejor su reporte.

### Valores del reporte

Dependiendo de las [tasas y plazos](https://www.mercadopago.com.mx/settings/release-options) seleccionados, el valor obtenido con la venta se va a liquidar un tiempo después de acreditado el cobro. Por lo tanto, el valor total indicado en el reporte puede no coincidir siempre con su saldo total o con el valor total en los reportes de facturación.

Los plazos de liberación están relacionados con los procesos bancarios y los flujos de intermediación cuando las transacciones se realizan en Mercado Libre. Además, las reclamaciones y contracargos recibidas en las ventas pueden afectar la liberación del dinero.

Para obtener la fecha exacta de disponibilidad del dinero de una transacción, es importante revisar los [detalles de los pagos acreditados.](https://www.mercadopago.com.mx/activities/balance)

## Uso del reporte

El reporte de Liberaciones es una herramienta importante tanto para la conciliación como para el análisis de su historial financiero. Detalla las transacciones de la cuenta, proporciona comprensión y conciliación del saldo disponible en fechas específicas y ofrece datos de cada transacción, incluyendo la fecha, concepto y el monto.

Además, este reporte presenta el historial completo del dinero liberado, abordando eventos como transferencias bancarias, disputas, reembolsos y estornos, y destaca las cuotas liquidadas en comparación con las pendientes de pago.

Puedes utilizar el [Glosario del reporte](https://www.mercadopago.com.mx/developers/es/docs/additional-content/reports/account-money/report-fields) para consultar algún término técnico.

Limitaciones para cuentas de prueba

Debido a una limitación del ambiente que impide poblar los datos, los reportes generados para cuentas de prueba se mostrarán sin información. Sin embargo, los flujos de generación, las consultas y las listas de reportes funcionarán con normalidad.
