
# Financial API

Esta versión consta de 13 endpoints: 1 endpoint de "Descubrimiento de Tiendas" para listar a qué tiendas tienen acceso tus credenciales, 10 endpoints de "Nivel de Pago" que en conjunto proporcionan los valores relacionados con diferentes tipos de transacciones para una conciliación de pago, 1 endpoint de "Nivel de Cancelación" que entrega detalles de las cancelaciones que no se pagan o consideradas en los endpoints de "Nivel de pago" y 1 endpoint "Nivel de contrato" que proporciona información del contrato y sus condiciones que también pueden argumentar los cargos relacionados en los endpoints de "Nivel de pago".

Para crear un pago, primero utilice el endpoint `payments` y, cuando reciba el identificador de pago sobre el que desea realizar la consulta, utilícelo para consultar los endpoints restantes del "nivel de pago".

El endpoint `contracts` te brindará información sobre las condiciones configuradas en Rappi que subyacen a los montos cobrados por cada concepto dentro de un pago.

Para hacer consultas usando `payment_id`, suponga que `payment_id` solo se actualiza según la frecuencia de pago (semanal, quincenal, mensual). Si la búsqueda se realiza antes del último día del periodo de pago los datos serían del periodo anterior y anteriores. La información más reciente estará disponible solo un día después del final del período de pago (solo días hábiles).

Puede utilizar los operadores en la cadena de consulta, como en la solicitud `/v2/stores/12345/payments?confirmed_payment_date:lte=2023-01-01`, donde el operador `lte` es utilizado. Tenga en cuenta que no todos los operadores están disponibles en la API, consulte la documentación de cada endpoint para conocer cuáles son los campos disponibles y los operadores disponibles.

| Operador | Descripción                                           |
| -------- | ----------------------------------------------------- |
| `eq`     | El campo tiene su valor igual a la solicitud.         |
| `lt`     | El campo tiene su valor menor que la solicitud.       |
| `lte`    | El campo tiene su valor menor o igual a la solicitud. |
| `gt`     | El campo tiene su valor mayor que la solicitud.       |
| `gte`    | El campo tiene su valor mayor o igual a la solicitud. |
| `not`    | El campo tiene su valor no es igual a la solicitud.   |

---

## Proceso de Conciliación Financiera

Para garantizar la transparencia y la facilidad de consumo de datos a gran escala, se creó el API de conciliación financiera, un conjunto de endpoints cuya finalidad es mostrar los importes que componen la transferencia de un socio. Con el conjunto de endpoints de la API Financiera, podrá automatizar el proceso de conciliación entre Rappi y su empresa, evitando así errores operativos y garantizando la claridad necesaria en la composición de los asientos financieros que componen la transferencia.

### Operación de Pagos Rappi - Corte

Rappi completa el cierre financiero de la transferencia del socio según el acuerdo de frecuencia de pago definido en el contrato. Para un ejemplo de frecuencia semanal (de lunes a domingo), todas las entradas realizadas durante este periodo se calculan el lunes siguiente y tras el cálculo, si el importe es positivo, se programa el pago para esa semana. Si el saldo es negativo, Rappi puede generar una deuda para el socio o cargar este importe al siguiente corte.

### ID de Paidlots (pagos) y Fecha estimada de pago

Según la frecuencia de pago de cada comercio, los paidlots (nombre que recibe el conjunto de entradas que componen la transferencia) se cerrarán un día posterior al corte, por lo que la información relacionada a dicho pago solo estará disponible en las API a partir de ese día. Es importante tener en cuenta que la información actualizada se referirá al corte anterior (en el ejemplo semanal, de lunes a domingo). Mientras no haya paidlotId, los endpoints que entregan información de pagos devolverán información del corte anterior.

Para identificar estos importes a cobrar o pagar a Rappi, el campo `payment_id` y el filtro deben utilizarse como clave de agrupación, un identificador único que hace referencia al conjunto de asientos que componen la transferencia.

### Cómo Conciliar

Para que nuestros socios completen una conciliación exitosa existen dos tipos de información extraída de los endpoints proporcionados por la API:

- **Nivel de Pago (bancario):** Información agregada a nivel de transferencia bancaria.
- **Nivel de Orden (transaccional):** Información detallada a nivel de cada transacción u orden.

<aside class="notice">
  <p><b>Actualización diaria de datos</b></p>
  <p>Todos los endpoints que entregan información a nivel de pagos se actualizarán un día después del cierre del corte según la frecuencia de pagos estipulada en el contrato entre el comercio y Rappi. Los datos estarán disponibles a las 14:00 horas.</p>
</aside>

---

## Descripción Detallada de cada Endpoint

### Payments

El endpoint `payments` devuelve información sobre los "ids" que tiene el socio en un mes determinado. Estos "ids" son los identificadores que agrupan un conjunto de contabilizaciones que conforman la transferencia del socio y que deben ser utilizados en las peticiones de los otros endpoints para entender qué conjunto de datos impactó en una transferencia determinada.

El valor total será la suma de los valores de todas las API, ya sean valores positivos o negativos. Podemos tener varias transferencias al socio en el mismo día, dependiendo de varios factores durante la facturación.

<aside class="warning">
  <p><b>Importante</b></p>
  <p>El único impuesto a sumar desde el endpoint <code>taxes</code> es el que tiene el atributo <code>reason = IRRF</code> (el resto están dentro del endpoint <code>orders</code> a nivel de orden).</p>
  <p>Los valores entregados en el endpoint <code>compensations</code> no deben ser considerados en el cálculo total de un pago; tienen un propósito completamente informativo. Los valores descontados están dentro del endpoint <code>orders</code> a nivel de orden.</p>
</aside>

Si el socio ha realizado un anticipo de crédito con una entidad financiera y ha otorgado como garantía la cartera de créditos de Rappi, estos pagos pueden verse afectados por el efecto del contrato (registro de créditos). Esta API solo mostrará el pago residual destinado al comercio socio de Rappi si existe, ya que el establecimiento puede comprometer parte o la totalidad de su cartera.

### Orders (Sales)

El endpoint `orders` contiene detalles sobre las órdenes como el identificador único de la orden, impuestos, descuentos de venta y comisiones. Son todos los pedidos que han pasado por la app de Rappi, independientemente de la forma de pago utilizada por el consumidor.

<aside class="notice">
  <p><b>Observaciones</b></p>
  <ul>
    <li>El valor total de la venta estará representado por el campo <code>billing.total_order</code>, que proporciona el valor de la venta menos markups y markdowns.</li>
    <li>Una orden puede sufrir cambios durante su ciclo de vida, siempre y cuando haya sido aceptada por el socio. Este endpoint solo mostrará las órdenes que hayan finalizado su ciclo de vida (finalizadas o canceladas).</li>
    <li>Si el paidlot aún no se ha calculado (no ha cerrado el corte de ventas), puede sufrir cambios en la inclusión o eliminación de entradas.</li>
    <li>Si una vez generado el <code>payment_id</code>, algunas órdenes que estaban disponibles como canceladas en el endpoint <code>orders</code> pasarán a ser parte del endpoint de <code>cancellations</code> o <code>charged_cancellations</code> dependiendo si aplica para pago o no.</li>
  </ul>
</aside>

### Order Adjustments (Sales Adjustments)

Los ajustes de ventas son descuentos financieros de abono o adeudo que sirven para diversos fines, siempre están relacionados a una orden (`order_id`). Los ejemplos incluyen la cancelación de un artículo después de que el pedido haya sido entregado (completado), el cargo de un saldo pendiente, las disputas aceptadas por Rappi, entre otras opciones.

Cada ajuste manual descontado en el pago contiene una descripción en el campo `descriptionAdjustment` para comprender mejor el motivo de este movimiento.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>El ajuste manual de una orden puede ocurrir en un <code>payment_id</code> diferente al de la venta. En este caso, Rappi cargará este valor para el próximo periodo abierto.</p>
</aside>

### Charged Cancellations

El endpoint `charged_cancellations` devuelve información sobre el importe que Rappi ha descontado al socio, cuando la cancelación de la orden es responsabilidad de Rappi. Por ejemplo, una cancelación causada por un problema con el repartidor independiente: si el socio utiliza la logística de entrega de Rappi y durante el trayecto se produce un problema y el pedido no llega a su destino, se entiende que el socio ha cumplido con su deber de preparar y enviar el pedido. En este caso, Rappi realiza un abono al socio, deduciendo los gastos correspondientes definidos en los términos del contrato.

### Store Adjustments

Los ajustes de tienda son descuentos financieros de abono o adeudo que sirven para diversos fines, siempre están relacionados a una tienda (`store_id`). Los ejemplos incluyen correcciones financieras por errores en el cálculo de un pago o rubro financiero, entre otras opciones.

Cada ajuste manual descontado en el pago contiene una descripción en el campo `description_reason` para comprender mejor el motivo de este movimiento.

### Taxes

El endpoint `taxes` devuelve información sobre los reembolsos efectuados por Rappi al socio, debidos a operaciones en las que se recaudó el impuesto sobre la renta. Este importe se calcula en cada corte de pagos de Rappi.

<aside class="warning">
  <p><b>Importante</b></p>
  <p>El endpoint entrega información de todos los impuestos tanto a nivel de orden como de tienda (IRRF). Para componer el valor de un pago, el valor de los impuestos de órdenes ya es considerado dentro del endpoint de <code>orders</code>, de modo que NO se deben tener en cuenta los valores que entrega este endpoint que sean diferentes al IRRF.</p>
</aside>

### Compensations

El endpoint `compensations` devuelve información sobre las retribuciones financieras a usuarios realizados por Rappi a causa de una disputa aceptada atribuible al aliado (producto equivocado, producto faltante, producto en mal estado) que repercuten en la transferencia del socio.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>Es importante categorizar el campo <code>reason</code> para tener una mejor experiencia de comprensión de los casos publicados, dado que Rappi maneja diversos tipos de incidencias.</p>
</aside>

### Loans

El endpoint `loans` entrega información sobre los descuentos realizados por Rappi sobre el valor de un pago a causa del cobro de una cuota de un préstamo, y también información general sobre el préstamo relacionado. Los préstamos pueden ser de diferentes tipos y el endpoint solo entrega la información de la cuota cobrada en un pago específico.

### Debts

El endpoint `debts` entrega información sobre los descuentos realizados por Rappi sobre el valor de un pago a causa de una deuda pendiente que es originada en un pago previo cuyo balance fue negativo, ya que sus ventas no cubren los descuentos relacionados.

<aside class="notice">
  <p><b>Observación</b></p>
  <p>Para identificar el motivo de una deuda, el endpoint <code>debts</code> entrega el identificador del pago en el que se generó la deuda para que se pueda consultar ese pago en específico y tener la trazabilidad de las transacciones por valores negativos que llevaron el valor total a pagar a negativo.</p>
</aside>

### Extras (Ads, Fees, Discounts)

Son registros detallados de transacciones/operaciones, vinculadas al socio, que tienen fecha, valor y naturaleza de operación, que impactan directa y/o indirectamente en el cálculo financiero del socio. Contiene la información de los valores descontados por diferentes conceptos relacionados a operaciones de marketing como Ads y descuentos.

### Cancellations (Unpaid Cancellations)

El endpoint `cancellations` devuelve información sobre las órdenes canceladas que **no serán pagadas** al comercio. Existen diferentes razones por las cuales una cancelación no se pague:

- **Producto no disponible:** La tienda no cuenta con el producto solicitado.
- **Tienda Cerrada:** El restaurante se encontraba cerrado.
- **Problemas técnicos del restaurante:** El restaurante tuvo problemas en la preparación del pedido.
- **Aliado no reconoce orden:** El establecimiento no está operando en la plataforma de Rappi.

<aside class="notice">
  <p><b>Observaciones</b></p>
  <ul>
    <li>En el campo <code>cancellation_description</code> se puede encontrar el motivo de la cancelación.</li>
    <li>Órdenes canceladas con modalidad Marketplace (con repartidor propio de la tienda) no aplican para pago.</li>
  </ul>
</aside>

### Agreements (Fees and Conditions)

El endpoint `agreements` devuelve información sobre las condiciones del contrato que subyacen a los importes cobrados por cada concepto dentro de un pago, incluyendo frecuencia de pago, condiciones de comisión y términos del contrato.

---

## Conceptos específicos de Rappi

| Concepto | Descripción |
| -------- | ----------- |
| **Loans** | Préstamos por parte de Rappi al comercio. Pueden ser de diferentes tipos y el endpoint solo entrega la información de la cuota cobrada en un pago específico. |
| **Debts** | Tras el cálculo del pago de un corte de ventas, en caso de que el resultado sea negativo, este importe será cobrado en el pago del siguiente corte. |
| **Extras** | Contiene la información de los valores descontados por diferentes conceptos relacionados a operaciones de marketing como Ads y descuentos. |

---

## Operaciones de Financial API

| Método | Endpoint                                                                                                        | Descripción                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | [`/restaurants/auth/v1/token/login/finance`](/es/api-reference/financial/#post-finance-login)                   | Genera un token de acceso para la API Financial usando sus credenciales.                                                          |
| `GET`  | [`/v2/stores`](/es/api-reference/financial/#get-stores-v2)                                                      | Devuelve la lista de IDs de tiendas asociadas a tus credenciales de la API Financial.                                             |
| `GET`  | [`/v2/stores/{store_id}/payments`](/es/api-reference/financial/#get-payments-v2)                                | Devuelve una lista de pagos filtrados por tienda y por período de pago con información del comerciante y detalles de cada pago.   |
| `GET`  | [`/v2/stores/{store_id}/orders`](/es/api-reference/financial/#get-orders-v2)                                    | Devuelve una lista de pedidos por pago o por tienda y un período de pago.                                                         |
| `GET`  | [`/v2/stores/{store_id}/order_adjusments`](/es/api-reference/financial/#get-order-adjusments-v2)                | Devuelve una lista de ajustes de pedidos por pago o por tienda y un período de pago.                                              |
| `GET`  | [`/v2/stores/{store_id}/charged_cancellations`](/es/api-reference/financial/#get-charged-cancellations-v2)      | Devuelve una lista de cancelaciones (pedidos) y su detalle por pago o por tienda y un periodo de pago.                            |
| `GET`  | [`/v2/stores/{store_id}/store_adjustments`](/es/api-reference/financial/#get-store-adjustments-v2)              | Devuelve una lista de ajustes de tienda por pago o por tienda y un período de pago.                                               |
| `GET`  | [`/v2/stores/{store_id}/loans`](/es/api-reference/financial/#get-loans-v2)                                      | Devuelve una lista de cuotas de préstamos por pago o por tienda y un período de pago.                                             |
| `GET`  | [`/v2/stores/{store_id}/debts`](/es/api-reference/financial/#get-debts-v2)                                      | Devuelve información de deudas pendientes de periodos pasados por pago o por tienda y un periodo de pago.                         |
| `GET`  | [`/v2/stores/{store_id}/extras`](/es/api-reference/financial/#get-extras-v2)                                    | Devuelve un listado de cargos extras (tarifas, descuentos, otros) por pago o por tienda y un periodo de pago.                     |
| `GET`  | [`/v2/stores/{store_id}/taxes`](/es/api-reference/financial/#get-taxes-v2)                                      | Devuelve una lista de impuestos por pago o por tienda y un período de pago.                                                       |
| `GET`  | [`/v2/stores/{store_id}/compensations`](/es/api-reference/financial/#get-compensations-v2)                      | Devuelve una lista de compensaciones y su detalle por pago o por tienda y un periodo de pago.                                     |
| `GET`  | [`/v2/stores/{store_id}/cancellations`](/es/api-reference/financial/#get-cancellations-v2)                      | Devuelve una lista de cancelaciones (pedidos) por tienda y un período de pago.                                                    |
| `GET`  | [`/v2/stores/{store_id}/agreements`](/es/api-reference/financial/#get-agreements-v2)                            | Devuelve información sobre las condiciones del contrato que subyacen a los importes cobrados por cada concepto dentro de un pago. |
