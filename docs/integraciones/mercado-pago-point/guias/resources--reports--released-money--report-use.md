<!-- fuente: https://www.mercadopago.com.mx/developers/es/docs/mp-point/resources/reports/released-money/report-use · capturado 2026-10-08 -->

# Glosario

Consulta la descripción de cada campo presente en el reporte en la tabla siguiente.

| Nombre de la columna del reporte | Qué significa | Tipo de dato  
(longitud máxima) |
| --- | --- | --- |
| Fecha de liquidación (`DATE`) | Fecha de liberación de la transacción. Es el momento en que esta transacción afecta el saldo disponible de la cuenta del usuario. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| ID de operación en Mercado Pago (`SOURCE_ID`) | Identificador de la transacción dentro de los sistemas de Mercadopago. Ejemplo: ID de un Pago. Este campo puede contener valores alfanuméricos. | String  
(100) |
| Código de referencia (`EXTERNAL_REFERENCE`) | Este dato ayuda a identificar una operación según su origen, el código puede ser:  
\- ID de la venta a través de la orden o el envío (si es una compra de carrito)  
\- ID propio provisto por el vendedor en caso de una integración externa. Este dato permite relacionar transacciones (registros) entre Mercado Pago y sistemas externos  
Es posible que este campo esté vacío para algunos casos como el pago de facturas o un envío de dinero, entre otros. | String  
(255) |
| Tipo de registro (`RECORD_TYPE`) | `initial_available_balance` → Dinero disponible del período anterior.  
  
`release` → Dinero de un cargo que fue liberado.  
  
`total` → Valor líquido total. Es el dinero que tienes disponible en tu cuenta. Se calcula como la diferencia entre el monto acreditado total y el monto debitado total.  
  
`available_balance` → Saldo previo y posterior a un retiro de dinero, que explica el balance de la cuenta. | String  
(30) |
| Descripción (`DESCRIPTION`) | Posibles valores que puede tomar el campo:  
Para dinero liquidado `release`: Pago (payment), Percepción sujeto excedido Régimen Simplificado 2% (tax\_payment\_ibex), Devolución de dinero (shipping\_cancel), Retención de impuesto (tax\_withdholding), Retención de impuesto cancelada (tax\_withdholding\_cancel), Contracargo (chargeback), fee\_release\_in\_advance, Rendimientos positivos (asset\_management\_gain), Rendimientos negativos (asset\_management\_loss)  
  
  
Para saldo previo a un retiro `available_balance`: el campo mostrará el prefijo pre o pos para indicar el saldo previo o posterior a un retiro, según corresponda, seguido del tipo de operación, en este caso, un retiro de dinero (payout) y finalmente, el número de identificación de la operación o ID Source.  
  
Prefijo + nombre de operación + número de la operación.  
  
Ejemplo: pre\_payout\_ID source  
  
pre\_payout\_1948976543  
pos\_payout\_1945676549  
  
Definiciones a tener en cuenta:  
  
  
  
Percepción de impuesto a los IIBB `tax_payment_iibb_cre_[jurisdicción]`: percepción de impuesto a los IIBB - Meses sin Tarjeta, en donde `[jurisdicción]` se reemplaza por el nombre de la provincia donde se te genera el impuesto.  
Ejemplo 1: Percepción Impuesto a los IIBB Misiones - Meses sin Tarjeta (tax\_payment\_iibb\_cre\_misiones)  
Ejemplo 2: Percepción Impuesto a los IIBB San Luis - Mercado (tax\_payment\_iibb\_cre\_san\_luis)  
  
  
Percepción de impuesto a los IIBB y juristidiccón `tax_iibb_[jurisdicción]`: percepción de impuesto a los IIBB, en donde `[jurisdicción]` se reemplaza por el nombre de la provincia donde se te genera el impuesto.  
  
  
  
Percepción Impuesto al Valor Agregado Régimen General `tax_iva`: percepción de Impuesto al Valor Agregado Régimen General.  
  
percepción de Impuesto al Valor Agregado Régimen General - Meses sin Tarjeta. `tax_iva_cre`:  
  
Retención de impuesto cancelada `tax_withdholding_cancel`: la cancelación de la retención tax\_withdholding.  
  
Retención de impuesto `tax_withdholding`: el cobro de retenciones que no se pudieron ejecutar transaccionales al pago asociado. En Argentina son únicamente retenciones de Ingresos Brutos (las percepciones se debitan como otra operación). En Uruguay son retenciones de IVA. En Colombia son retenciones de IVA, ICA y Fuente según aplique el caso.  
  
Impuesto sobre los Créditos y Débitos en pagos `tax_withholding_payer`: Impuesto sobre los Créditos y Débitos en pagos.  
  
Impuesto sobre los Créditos y Débitos en cobros `tax_withholding_collector`: impuesto sobre los Créditos y Débitos en cobros.  
  
Impuesto sobre los Créditos y Débitos en retiros `tax_withholding_payout`: impuesto sobre los Créditos y Débitos en retiros.  
  
Impuesto sobre los Créditos y Débitos en envíos `tax_withholding_shipping`: impuesto sobre los Créditos y Débitos en envíos.  
  
Tarifa de envío `shipping`: comisión de shipping para las compras de carrito que no se incluye en cada uno de los pagos del carrito.  
  
Devolución de dinero / Tarifa de envío `shipping_cancel`: cancelación de la comisión de shipping para las compras de carrito que no se incluye en cada uno de los pagos del carrito.  
  
Pago de comisiones / Adelanto de dinero `fee-release_in_advance`: comisión por adelanto.  
  
Rendimientos positivos `asset_management_gain`: rendimiento positivo generado por la variación del valor de cuotapartes suscritas en el fondo común de inversión.  
  
Rendimientos negativos `asset_management_loss`: rendimiento negativo generado por la variación del valor de cuotapartes suscritas en el fondo común de inversión.  
  
Restricción por comportamiento fraudulento `restriction`: ocurre cuando se te aplica una restricción por comportamiento fraudulento.  
  
Débito de la cuota de un préstamo `credit_payment`: aparece cuando se cobra la cuota de un préstamo otorgado.  
  
Extracción de efectivo `payout`: extracción en efectivo de dinero disponible en Mercado Pago.  
  
Embargo dinero invertido `reserve_for_embargo_invested`: embargo de tu dinero invertido. Este valor aparece cuando hay una reserva de dinero en fondos de inversión.  
  
Dinero retenido de envío por devolución de venta en Mercado Libre `reserve_for_bpp_shipping_return`: reserva para devoluciones.  
  
Dinero retenido por deuda `reserve_for_debt_payment`: retenido para cobro de deuda.  
  
Dinero retenido para reembolso `reserve_for_refund`: retenido para devoluciones.  
  
Dinero retenido por contracargo de cuenta vinculada `reserve_for_cbk_cross_recovery`: retenido por contracargo de cuenta vinculada.  
  
Consumos pendientes de confirmación `reserve_for_payment`: consumos pendientes de confirmación.  
  
Contracargos `chargeback`: aparece cuando se inicia o resuelve un contracargo asociado al pago al que hace referencia.  
  
Reclamo `dispute`: aparece cuando se inicia o resuelve una mediación o reclamo sobre el pago al que hace referencia. Puede ocurrir antes o después de que el pago se haya liberado como dinero disponible e incluso retirado de la cuenta.  
  
Comisión por devolución de envío `shipping_return`: aparece cuando se bloquea o desbloquea un pago realizado por devolución express.  
  
Pago de crédito `credit_payment`: aparece cuando se cobra la cuota de un préstamo otorgado.  
  
Pago `payment`: pago que se libera en alguno de los canales en los que opera el cliente.  
  
Transferencia `withdrawal`: retiro que se ejecuta sobre el dinero disponible.  
  
`refund`: devolución asociada al pago al que hace referencia.  
  
`shipping`: comisión de shipping para las compras de carrito que no se incluye en cada uno de los pagos del carrito.  
  
`shipping_cancel`: cancelación de la comisión de shipping para las compras de carrito que no se incluye en cada uno de los pagos del carrito.  
  
Mediación `mediation`: resolución de una mediación a favor del comprador que termina restando del dinero disponible del vendedor.  
  
Cancelación de la mediación `mediation_cancel`: cancelación de la mediación resuelta a favor del comprador.  
  
Contracargo `chargeback`: contracargo ya sea a favor o en contra de una operación.  
  
Pago de comisiones / Adelanto de dinero `fee-release_in_advance`: comisión por adelanto.  
  
Retiro de dinero `payout`: extracción en efectivo de dinero disponible en Mercado Pago.  
  
Reserva para bloqueo de dinero invertido `reserve_for_embargo_invested`: embargo de tu dinero invertido. Este valor aparece cuando hay una reserva de dinero en fondos de inversión.  
  
`digitalchange_transaction`: Movimiento por Vueltos digitales. Ingreso o salida de dinero en cuenta. Si eres vendedor, corresponde a los vueltos de dinero digital que le diste a un comprador que pagó en efectivo. Si eres comprador, corresponde al cambio que debiste recibir en la compra que pagaste en efectivo. | String  
(50) |
| Monto neto acreditado (`NET_CREDIT_AMOUNT`) | Acreditado al monto disponible. | Numeric  
(17,2) |
| Monto neto debitado (`NET_DEBIT_AMOUNT`) | Debitado al monto disponible. | Numeric  
(17,2) |
| Monto recibido por compras por split (`SELLER_AMOUNT`) | Monto recibido por compras por split. | Numeric  
(17,2) |
| Monto bruto de la operación (`GROSS_AMOUNT`) | Valor total bruto (antes de deducciones) que recibe el vendedor por la transacción. | Numeric, decimal  
(17,2) |
| Datos extra (`METADATA`) | Datos extras como por ejemplo el ID de las devoluciones parciales o datos provistos por el vendedor en caso de tener una integración externa. | String  
(JSON) |
| `MP_FEE_AMOUNT` | Comisión de Mercado Pago y/o Mercado Libre. Incluye IVA. | Numeric  
(17,2) |
| Comisión por ofrecer cuotas sin interés (`FINANCING_FEE_AMOUNT`) | Costo por ofrecer cuotas sin interés. | Numeric  
(17,2) |
| Costo de envío (`SHIPPING_FEE_AMOUNT`) | Costo de envío. | Numeric  
(17,2) |
| Impuestos cobrados por retenciones IIBB (`TAXES_AMOUNT`) | Impuestos cobrados por retenciones de Ingresos Brutos. | Numeric  
(17,2) |
| Cupón de descuento (`COUPON_AMOUNT`) | Esta transacción te muestra el valor total del cupón de descuento que se ofrece a tus compradores. | Numeric  
(17,2) |
| Cuotas (`INSTALLMENTS`) | Cantidad de cuotas en las que se realizó la operación. | Numeric  
(2) |
| Medio de pago (`PAYMENT_METHOD`) | [Medios de pago disponibles](https://www.mercadopago.com.mx/developers/es/docs/sales-processing/payment-methods) según el país con el que operes con Mercado Pago. | String  
(200) |
| Tipo de medio de pago (`PAYMENT_METHOD_TYPE`) | Tipo de [medio de pago disponible](https://www.mercadopago.com.mx/developers/es/docs/sales-processing/payment-methods) según el país con el que operes con Mercado Pago. | String  
(200) |
| Detalle de impuestos (`TAX_DETAIL`) | Descripción del impuesto retenido por operación en el impuesto cobrado por retenciones IIBB `TAXES_AMOUNT`.  
  
  
También se puede visualizar `devolución_percepción_gral` cuando la operación es la devolución de este impuesto. | String  
(50) |
| Impuesto descontado del valor bruto (`TAX_AMOUNT_TELCO`) | Es el valor del impuesto a las empresas de telecomunicaciones que se descuenta del valor bruto. | Numeric  
(17,2) |
| Fecha de aprobación (`TRANSACTION_APPROVAL_DATE`) | Fecha de aprobación de la operación. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| Fecha de creación de la operación (`TRANSACTION_DATE`) | Fecha de creación de la operación. | DateTime  
(yyyy-MM-dd'T'HH:mm:ssZ) |
| Fecha corta de creación de la operación (`TRANSACTION_DATE_SHORT`) | Fecha de creación de la operación. | YYYY-MM-DD |
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
| Costo por ofrecer descuento (`EFFECTIVE_COUPON_AMOUNT`) | Esta transacción te muestra el valor que asumes dentro del cupón de descuento ofrecido a tus compradores. Para que sea más fácil diferenciarlo del `COUPON_AMOUNT`, agregamos los signos "—", cuando el movimiento corresponda a una venta, y "+" para cuando el movimiento corresponde a una devolución. | Numeric  
(17,2) |
| Número de serie del lector (`POI_ID`) | ID del lector si el pago se realiza a través de un comercio físico. | String  
(100) |
| Tarjeta de tu comprador (`CARD_INITIAL_NUMBER`) | Corresponde a los primeros dígitos de la tarjeta crédito o débito con la que se hizo la compra. | Numeric  
(8) |
| Etiquetas de la operación (`OPERATION_TAGS`) | Son las etiquetas para categorizar y/o segmentar diferentes aspectos de la transacción, como por ejemplo los canales usados para hacer un pago. Se identifican como:  
  
Pago vía WhatsApp (WHATSAPP\_PAY): Esta etiqueta indica que el pago fue hecho a través de whatsApp.  
PO: esta etiqueta indica que el pago fue hecho mediante un dispositivo Point.  
MARKETPLACE: esta etiqueta indica que el pago fue hecho directamente en Mercado Libre. | String  
(JSON) |
| Identificador de producto (`ITEM_ID`) | Identificador del producto vendido. | String  
(200) |
| Saldo (`BALANCE_AMOUNT`) | En esta columna se visualiza el saldo que queda en una cuenta luego de que se ejecuta una operación que afecta el valor total. | Numeric  
(17,2) |
| Cuenta de destino del retiro (`PAYOUT_BANK_ACCOUNT_NUMBER`) | Aquí se muestra el número completo de la cuenta a la que se envió dinero desde Mercado Pago. | String  
(200) |
| Código de producto SKU (`PRODUCT_SKU`) | Código con el que como vendedor podrás identificar tus productos. | String  
(200) |
| Detalle de la venta (`SALE_DETAIL`) | Esta columna ofrece información detallada sobre los artículos vendidos en cada entrega, facilitando la conciliación y el control de tus ventas. | String  
(500) |
| Moneda (`CURRENCY`) | Moneda en la que se realizó la transacción. | String alfanumérico |
| Bandera (`FRANCHISE`) | Nombre de la bandera de la tarjeta utilizada. | String alfanumérico |
| Últimos 4 dígitos (`LAST_FOUR_DIGITS`) | Últimos 4 dígitos de la tarjeta utilizada. | Numeric, integer |
| ID de la solicitud (`ORDER_MP`) | Identificador de la order en Mercado Pago. | String alfanumérico |
| ID de intento de operación (`TRANSACTION_INTENT_ID`) | Identificador de la intención de transacción. | String alfanumérico |
| ID de la compra (`PURCHASE_ID`) | Identificador único asignado a una compra o transacción específica. | String alfanumérico |
| Liberado (`IS_RELEASED`) | Indicador booleano (`true` / `false`) que señala si un producto ha sido liberado para su envío. `true` significa que el producto está listo para ser enviado, `false` significa lo contrario. | Boolean |
| CLABE interbancaria (`AVK_ID`) | Identificador o referencia única relacionada con la liquidación de los fondos según el país donde se emite el reporte. Permite rastrear el movimiento de fondos a través de los diferentes participantes en la transacción. | String alfanumérico |
| ID de asociación de envíos (`SHIPPING\_ORDER\_ID`) | Identificador único interno para rastrear cada orden de envío dentro de la empresa. Permite gestionar los detalles de cada solicitud. No es el número de seguimiento del transportista. | String alfanumérico |
| Nombre del emisor (`ISSUER\_NAME`) | Nombre de la entidad financiera emisora de la tarjeta o el medio de pago utilizado en la transacción. | String alfanumérico |
| Identificador de aplicación (`APPLICATION_ID`) | Identificador de la aplicación interna en MP; identifica qué aplicación específica generó cada transacción. | String alfanumérico |
| Código de autorización (`AUTHORIZATION_CODE`) | Código único emitido para identificar la confirmación de aprobación del pago. | String alfanumérico |
| Modo de ingreso de tarjeta (`CARD_ENTRY_MODE`) | Corresponde al modo de entrada de tarjeta; identifica cómo se capturaron los datos en la terminal. | String alfanumérico |
| Detalle de segmento (`SEGMENT_DETAIL`) | Detalle de la subunit; clasificación granular de las transacciones según su naturaleza y características específicas. | String alfanumérico |
| Fecha de liberación corta (`DATE_SHORT`) | Fecha de liberación del pago en formato YYYY-MM-DD. | Date (YYYY-MM-DD) |
| Fecha de aprobación de transacción corta (`TRANSACTION_APPROVAL_DATE_SHORT`) | Fecha de aprobación del pago en formato YYYY-MM-DD. | Date (YYYY-MM-DD) |
| Pagador autenticado (`AUTHENTICATED_PAYER`) | Indicador de que la transacción fue pagada por un usuario autenticado o no en MP. | Boolean |
