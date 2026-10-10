<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/account-money/report-fields · capturado 2026-10-08 -->

# Glosario

Consulta la descripción de cada campo presente en el reporte en la tabla siguiente.

| Nombre de la columna del reporte | Qué significa | Tipo de dato  
(longitud máxima) |
| --- | --- | --- |
| Número de referencia (`EXTERNAL_REFERENCE`) | ID que ayuda a identificar el origen de la operación. Por ejemplo, puede ser la venta a través del ID de la orden o el envío (si es una compra de carrito) o del ID propio provisto por el vendedor en caso de una integración externa.  
  
Ten en cuenta que es posible que este campo esté vacío para algunos casos como el pago de facturas o un envío de dinero, entre otros.  
 | String  
(255) |
| ID de operación en Mercado Pago (`SOURCE_ID`) | ID de operación en Mercado Pago (por ejemplo, el pago de una venta). | String  
(100) |
| Código de la cuenta del vendedor (`USER_ID`) | Código de la cuenta del vendedor. (Cust ID). | String  
(19) |
| Medio de pago (`PAYMENT_METHOD`) | Consulta los [medios de pago disponibles](https://www.mercadopago.com.mx/developers/es/docs/sales-processing/payment-methods) según el país con el que operes en Mercado Pago. | String  
(50) |
| Tipo de medio de pago (`PAYMENT_METHOD_TYPE`) | Tipo de medio de pago. Puede ser:  
  
_credit\_card_: tarjeta de crédito.  
_debit\_card_: tarjeta de débito.  
_bank\_transfer_: transferencia.  
_atm_: cajero  
_ticket_: efectivo  
_available\_money_: es el dinero que otros usuarios de Mercado Pago pueden usar para comprar y pagar.  
_prepaid\_card_: tarjeta prepago.  
 | String  
(200) |
| País de origen de la cuenta de Mercado Pago (`SITE`) | MLM: México | String  
(200) |
| Tipo de operación (`TRANSACTION_TYPE`) | Tipo de operación. Puede ser:  
  
Pago aprobado (SETTLEMENT): pago aprobado.  
Devolución de dinero (REFUND): pago devuelto total o parcialmente.  
Contracargo (CHARGEBACK): el comprador hizo un contracargo (desconocimiento del pago) en su tarjeta de crédito.  
Reclamo (DISPUTE): el comprador inició un reclamo por ese pago.  
Retiro de cuenta bancaria (WITHDRAWAL): retiro a la cuenta bancaria.  
Retiro a la cuenta bancaria cancelado (WITHDRAWAL\_CANCEL): retiro a la cuenta bancaria que fue cancelado.  
Retiro de efectivo (PAYOUT): extracción en efectivo de dinero disponible en Mercado Pago.  
 | String  
(200) |
| Valor de la compra (`TRANSACTION_AMOUNT`) | Monto bruto de la operación. | Numeric  
(17,2) |
| Moneda (`TRANSACTION_CURRENCY`) | Puede tomar algunos de estos valores según corresponda:  
  
MXN (Peso mexicano)  
CLP (Peso Chileno)  
ARS (Peso Argentino)  
BRL (Real Brasileiro)  
PEN (Sol Peruano)  
COP (Peso Colombiano)  
UYU (Peso Uruguayo)  
VES (Bolivar Venezolano)  
USD (Dollar) | String  
(10) |
| Monto recibido por compras por split (`SELLER_AMOUNT`) | Monto recibido por compras por split. | Numeric  
(17,2) |
| Fecha de origen (`TRANSACTION_DATE`) | Fecha de creación de la operación. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| Comisiones + IVA (`FEE_AMOUNT`) | Sumatoria de las comisiones de procesamiento, envíos, financiamiento y cupones si fue asumido por el vendedor. Incluyen IVA. | Numeric  
(17,2) |
| Monto neto de la operación que impactó en tu dinero (`SETTLEMENT_NET_AMOUNT`) | Monto neto de la operación que impactó en el dinero. Se le descontaron todas las comisiones involucradas del Valor de la compra (`TRANSACTION_AMOUNT`). | Numeric  
(17,2) |
| Moneda de la liquidación (`SETTLEMENT_CURRENCY`) | Puede tomar algunos de estos valores según corresponda:  
  
MXN (Peso mexicano)  
CLP (Peso Chileno)  
ARS (Peso Argentino)  
BRL (Real Brasileiro)  
PEN (Sol Peruano)  
COP (Peso Colombiano)  
UYU (Peso Uruguayo)  
VES (Bolivar Venezolano)  
USD (Dollar) | String  
(10) |
| Fecha de aprobación (`SETTLEMENT_DATE`) | Fecha de aprobación de la transacción. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| Monto neto de la operación (`REAL_AMOUNT`) | Monto neto de la operación, si es un pago aprobado _settlement_, se le descuentan los montos por contracargos, reclamos o devoluciones. | Numeric  
(17,2) |
| Cupón de descuento (`COUPON_AMOUNT`) | Monto del cupón de descuento. **Solo se descuenta del monto bruto o valor de la compra** (`TRANSACTION_AMOUNT`) **si está provisto por el vendedor**. | Numeric  
(17,2) |
| Datos extra (`METADATA`) | Datos extras como por ejemplo el ID de las devoluciones parciales o datos provistos por el vendedor en caso de tener una integración externa. | String  
(JSON) |
| Comisión de Mercado Libre + IVA (`MKP_FEE_AMOUNT`) | Comisión de Mercado Libre. Incluye IVA. | Numeric  
(17,2) |
| Costo por ofrecer cuotas sin interés (`FINANCING_FEE_AMOUNT`) | Costo por ofrecer cuotas sin interés. | Numeric  
(17,2) |
| Costo de envío (`SHIPPING_FEE_AMOUNT`) | Costo de envío. | Numeric  
(17,2) |
| Impuestos cobrados por retenciones IIBB (`TAXES_AMOUNT`) | Impuestos cobrados. | Numeric  
(17,2) |
| Meses (`INSTALLMENTS`) | Cantidad de cuotas en las que fue realizada la operación. | Numeric  
(2) |
| Detalle de impuestos (`TAX_DETAIL`) | Descripción del impuesto retenido por operación en los impuestos cobrados por retenciones IIBB `TAXES_AMOUNT`. | String  
(50) |
| ID de caja (`POS_ID`) | ID de caja si el pago se realiza a través de un comercio físico. | String  
(50) |
| Nombre de caja (`POS_NAME`) | Nombre de caja para el pago realizado a través de un comercio físico. | String  
(200) |
| ID de caja definido por el usuario (`EXTERNAL_POS_ID`) | ID de caja definido por el usuario para el pago realizado a través de un comercio físico. | String  
(100) |
| ID de sucursal (`STORE_ID`) | ID de sucursal si el pago se realiza a través de un comercio físico. | String  
(50) |
| Nombre de sucursal (`STORE_NAME`) | Nombre de sucursal para el pago realizado a través de un comercio físico. | String  
(200) |
| ID de sucursal definido por el usuario (`EXTERNAL_STORE_ID`) | ID de sucursal definido por el usuario para el pago realizado a través de un comercio físico. | String  
(100) |
| ID de la orden (`ORDER_ID`) | Orden de compra. | Numeric  
(19) |
| ID de envío (`SHIPPING_ID`) | Identificador de envío. | Numeric  
(19) |
| Modo de envío (`SHIPMENT_MODE`) | Modalidad de envío. | String  
(10) |
| ID del paquete (`PACK_ID`) | Identificador del paquete en el carrito. | Numeric  
(19) |
| Desglose de impuestos (`TAXES_DISAGGREGATED`) | Impuestos desagregados en formato JSON. | String  
(JSON) |
| Número de serie del lector (S/N) (`POI_ID`) | ID del lector si el pago se realiza a través de un comercio físico. | String  
(50) |
| Billetera virtual (`POI_WALLET_NAME`) | Nombre de la billetera virtual desde la que se origina un pago digital. Permite identificar el origen de una operación cuando cobras con un código QR de Mercado Pago. | String  
(200) |
| Banco de origen (`POI_BANK_NAME`) | Nombre de la entidad bancaria desde la que se origina un pago digital. Permite identificar el origen de una operación cuando cobras con un código QR de Mercado Pago. | String  
(200) |
| Descripción (`DESCRIPTION`) | Ayuda a identificar transacciones u operaciones registradas en un período de tiempo.  
Cuando se trata de un pago financiado, será identificado como "INSTALLMENT". | String  
(50) |
| Fecha de liberación del dinero (`MONEY_RELEASE_DATE`) | Fecha en la que se prevee la liberación del pago para cada cuota. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| Liberado (`IS_RELEASED`) | Indica si el dinero de la operación ya fue liberado. Puede tomar los valores TRUE (dinero liberado) o FALSE (dinero no liberado). | Boolean  
(TRUE/FALSE) |
| Tarjeta de tu comprador (`CARD_INITIAL_NUMBER`) | Corresponde a los primeros dígitos de la tarjeta crédito o débito con la que se hizo la compra. | Numeric  
(8) |
| Etiquetas de la operación (`OPERATION_TAGS`) | Son las etiquetas para categorizar y/o segmentar diferentes aspectos de la transacción, como por ejemplo los canales usados para hacer un pago. Se identifican como:  
  
\-Pago vía WhatsApp (WHATSAPP\_PAY): Esta etiqueta indica que el pago fue hecho a través de WhatsApp. | String  
(JSON) |
| Canal de venta (`BUSINESS_UNIT`) | Corresponde al canal por medio del cual se generó una venta. Los canales son Mercado Pago, Mercado Libre, Mercado Shops y Delivery. | String  
(255) |
| Plataforma de cobro (`SUB_UNIT`) | Permite identificar el medio que se utilizó para cobrar una venta con Mercado Pago. | String  
(255) |
| Código de producto SKU (`PRODUCT_SKU`) | Código con el que como vendedor podrás identificar tus productos. | String  
(200) |
| Detalle de la venta (`SALE_DETAIL`) | Esta columna ofrece información detallada sobre los artículos vendidos en cada entrega, facilitando la conciliación y el control de tus ventas. Cada entrada muestra el primer elemento vendido, seguido del agrupamiento de los demás productos. Es importante observar que, debido a la extensión, sólo los primeros 100 caracteres del nombre del producto serán mostrados. | String  
(500) |
| Monto de la propina (`TIP_AMOUNT`) | Monto de la propina recibida en la transacción. | Numeric  
(17,2) |
| Bandera (`FRANCHISE`) | Nombre de la bandera de la tarjeta utilizada. | String alfanumérico |
| Últimos 4 dígitos (`LAST_FOUR_DIGITS`) | Últimos 4 dígitos de la tarjeta utilizada. | Numeric, integer |
| ID de la solicitud (`ORDER_MP`) | Identificador de la order en Mercado Pago. | String alfanumérico |
| ID de intento de operación (`TRANSACTION_INTENT_ID`) | Identificador de la intención de transacción. | String alfanumérico |
| Período de facturación (`INVOICING_PERIOD`) | Período de facturación al que corresponde la transacción. Ayuda a organizar y conciliar las transacciones por ciclo de facturación. | Numeric, integer |
| Nombre del emisor (`ISSUER_NAME`) | Nombre de la entidad financiera emisora de la tarjeta o el medio de pago utilizado en la transacción. | String alfanumérico |
| Número de cuenta bancaria de pago (`PAY_BANK_TRANSFER_ID`) | Identificador único asignado a cada transferencia bancaria utilizada como medio de pago. Permite rastrear y gestionar los detalles de esa transacción específica. | String alfanumérico |
| ID de la compra (`PURCHASE_ID`) | Identificador único asignado a una compra o transacción específica. | String alfanumérico |
| CLABE interbancaria (`AVK_ID`) | Identificador o referencia única relacionada con la liquidación de los fondos según el país donde se emite el reporte. Permite rastrear el movimiento de fondos a través de los diferentes participantes en la transacción. | String alfanumérico |
| ID de asociación de envíos (`SHIPPING_ORDER_ID`) | Identificador único interno para rastrear cada orden de envío dentro de la empresa. Permite gestionar los detalles de cada solicitud. No es el número de seguimiento del transportista. | String alfanumérico |
| Identificador de aplicación (`APPLICATION_ID`) | Identificador de la aplicación interna en MP; identifica qué aplicación específica generó cada transacción. | String alfanumérico |
| Código de autorización (`AUTHORIZATION_CODE`) | Código único emitido para identificar la confirmación de aprobación del pago. | String alfanumérico |
| Modo de ingreso de tarjeta (`CARD_ENTRY_MODE`) | Corresponde al modo de entrada de tarjeta; identifica cómo se capturaron los datos en la terminal. | String alfanumérico |
| Detalle de segmento (`SEGMENT_DETAIL`) | Detalle de la subunit; clasificación granular de las transacciones según su naturaleza y características específicas. | String alfanumérico |
| Fecha de liquidación corta (`SETTLEMENT_DATE_SHORT`) | Fecha corta de aprobación del pago en formato YYYY-MM-DD. | Date (YYYY-MM-DD) |
| Fecha de transacción corta (`TRANSACTION_DATE_SHORT`) | Fecha de creación del pago en formato YYYY-MM-DD. | Date (YYYY-MM-DD) |
| Fecha de liberación de dinero corta (`MONEY_RELEASE_DATE_SHORT`) | Fecha de liberación del pago en formato YYYY-MM-DD. | Date (YYYY-MM-DD) |
| Pagador autenticado (`AUTHENTICATED_PAYER`) | Indicador de que la transacción fue pagada por un usuario autenticado o no en MP. | Boolean |
